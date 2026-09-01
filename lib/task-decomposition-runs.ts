import { PublicApiError } from './api-errors.ts';
import { createHash, randomUUID } from 'node:crypto';
import {
  validateAgentProfile,
  sameModelSelection,
  type AgentProfile,
} from './agent-profile.ts';
import { candidatePromptView } from './graph-identity.ts';
import {
  ensureGraphIdentities,
  parseIdentifiedResult,
  readIdentifiedEntities,
  reserveNodeIdentity,
  reservedCandidateAliases,
} from './graph-identity-store.ts';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import trash from 'trash';
import type { RegisteredProject } from './project-registry.ts';
import {
  TASK_DECOMPOSITION_HARNESS_ID,
  TASK_DECOMPOSITION_HARNESS_REVISION,
  parseTaskDecompositionHarnessResult,
  type TaskDecompositionHarnessResult,
} from './task-decomposition-harness.ts';
import {
  buildTaskDecompositionContinuationPrompt,
  buildTaskDecompositionPrompt,
} from './task-decomposition-prompt.ts';
import {
  readTaskDecompositionAttachment,
  readTaskDecompositionContext,
} from './task-decomposition-context.ts';
import {
  primarySourceResourcePaths,
  relatedContextNodeIds,
  writeTaskDecompositionContextWorkspace,
  type ContextWorkspaceEntry,
  type ContextWorkspaceInput,
} from './task-decomposition-context-workspace.ts';
import {
  candidateDependencyBlockers,
  resolveCandidateDependencies,
} from './task-decomposition-dependencies.ts';
import {
  startLocalAgentRun,
  type LocalAgentKind,
  type LocalAgentRun,
  type LocalAgentUsage,
} from './local-agent-transport.ts';
import {
  listTaskGraphNodes,
  readTaskGraphMarkdownResource,
  type TaskGraphNode,
} from './task-graph.ts';

export type TaskDecompositionRunStatus =
  | 'running'
  | 'validating'
  | 'proposal'
  | 'clarification'
  | 'insufficient-evidence'
  | 'no-change'
  | 'failed'
  | 'canceled';

export type TaskDecompositionRunTransport = 'codex-cli' | 'claude-cli';

const RUN_TRANSPORTS: Record<LocalAgentKind, TaskDecompositionRunTransport> = {
  codex: 'codex-cli',
  claude: 'claude-cli',
};

export type TaskDecompositionRunRecord = {
  schemaVersion: 1;
  runId: string;
  sessionId: string;
  requestId: string;
  agentSessionId: string | null;
  agentSessionMode?: 'persistent';
  sourceNodeId: string;
  operation: 'propose' | 'append-candidates' | 'revise-candidate';
  parentRunId?: string;
  revisionOf?: string;
  status: TaskDecompositionRunStatus;
  transport: TaskDecompositionRunTransport;
  profile?: AgentProfile;
  harness: {
    id: typeof TASK_DECOMPOSITION_HARNESS_ID;
    revision: typeof TASK_DECOMPOSITION_HARNESS_REVISION;
  };
  input?: {
    instruction: string;
    projectInstructions: string;
    resourcePaths: string[];
    requestArtifact: 'request.json';
  };
  inputFingerprint: string;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  usage: LocalAgentUsage | null;
  result: TaskDecompositionHarnessResult | null;
  error: string | null;
};

type RunRequest = {
  sourceNodeId: string;
  agent: LocalAgentKind;
  model?: AgentProfile['model'];
  effort?: AgentProfile['effort'];
  instruction: string;
  contextRefs: string[];
  files: File[];
  revisionRunId?: string;
  revisionCandidateId?: string;
  operation?: 'propose' | 'append-candidates';
};

type ActiveRun = {
  record: TaskDecompositionRunRecord;
  agent: LocalAgentRun;
};

const activeRuns = getActiveRuns();

export async function startTaskDecompositionRun(
  project: RegisteredProject,
  input: RunRequest,
) {
  validateRunRequest(input);
  const profile: AgentProfile = {
    agent: input.agent,
    model: input.model ?? '',
    effort: input.effort ?? '',
  };
  validateAgentProfile(profile);
  const nodes = await listTaskGraphNodes(project);
  const sourceNode = nodes.find((node) => node.id === input.sourceNodeId);
  if (!sourceNode)
    throw new PublicApiError('The source Node could not be found.', 400);
  const revisionTarget = await resolveRevisionTarget(project, input);
  const operation = revisionTarget
    ? 'revise-candidate'
    : (input.operation ?? 'propose');
  const coordinatorCandidate =
    operation === 'propose'
      ? null
      : (revisionTarget?.run ??
        (await findLatestCoordinatorRun(project, sourceNode.id)));
  const transport = RUN_TRANSPORTS[input.agent];
  const coordinatorRun =
    coordinatorCandidate?.agentSessionMode === 'persistent' &&
    coordinatorCandidate.transport === transport &&
    sameModelSelection(coordinatorCandidate.profile, profile)
      ? coordinatorCandidate
      : null;
  const continuesExistingSession = Boolean(coordinatorRun?.agentSessionId);
  const existingCandidateChildren = await collectExistingCandidateChildren(
    project,
    sourceNode.id,
  );
  const reservedCandidateIds = await collectReservedCandidateIds(project);
  const formalChildren = nodes.filter((node) =>
    node.derivedFrom?.includes(sourceNode.id),
  );
  if (
    [...activeRuns.values()].some(
      (active) =>
        active.record.sourceNodeId === sourceNode.id &&
        ['running', 'validating'].includes(active.record.status),
    )
  ) {
    throw new PublicApiError('This Node already has an active Agent Run.', 409);
  }

  const runId = `RUN-${randomUUID()}`;
  const sessionId = coordinatorRun?.sessionId ?? `SESSION-${randomUUID()}`;
  const requestId = `REQUEST-${randomUUID()}`;
  const runPath = taskDecompositionRunPath(project, runId);
  const resourcesPath = path.join(runPath, 'resources');
  await mkdir(resourcesPath, { recursive: true });

  const uploadedResources = await saveUploadedResources(
    runId,
    resourcesPath,
    input.files,
  );
  const featureContext = await readTaskDecompositionContext(project);
  const contextInputs = await collectContextWorkspaceInputs(
    project,
    sourceNode,
    nodes,
    input.contextRefs,
    uploadedResources,
    featureContext.attachments.map((attachment) => attachment.fileName),
    revisionTarget
      ? {
          outputPath: `task-decomposition/runs/${revisionTarget.run.runId}/candidates/${revisionTarget.candidate.candidateId}/output.md`,
          resourcePaths: revisionTarget.candidate.resources.map(
            (resource) => resource.path,
          ),
        }
      : undefined,
  );
  const contextWorkspace = await writeTaskDecompositionContextWorkspace(
    runPath,
    contextInputs,
  );
  const resources = [
    ...contextWorkspace.manifest.primary,
    ...contextWorkspace.manifest.related,
  ];
  const requestIdentity = {
    sessionId,
    requestId,
    inputFingerprint: '',
  };
  const packetWithoutFingerprint = {
    request: requestIdentity,
    operation,
    instruction: input.instruction.trim(),
    projectInstructions: continuesExistingSession
      ? undefined
      : featureContext.instructions,
    graphMap: continuesExistingSession ? undefined : nodes.map(graphMapEntry),
    currentNode: continuesExistingSession ? undefined : sourceNode,
    contextWorkspace: {
      root: contextWorkspace.root,
      indexPath: contextWorkspace.indexPath,
      primary: contextWorkspace.manifest.primary,
      related: contextWorkspace.manifest.related,
    },
    revisionTarget: revisionTarget
      ? candidatePromptView(revisionTarget.candidate)
      : null,
    reservedCandidateIds: reservedCandidateIds.filter(
      (candidateId) => candidateId !== revisionTarget?.candidate.candidateId,
    ),
    previousProposalAliases: coordinatorRun?.result?.candidateAliases ?? {},
    existingChildren:
      operation === 'append-candidates'
        ? continuesExistingSession
          ? [
              ...formalChildren.map((node) => ({
                id: node.id,
                updatedAt: node.updatedAt,
                acceptedFromCandidateId: node.provenance?.candidateId ?? null,
              })),
              ...existingCandidateChildren.map((candidate) => ({
                candidateId: candidate.candidateId,
                revision: candidate.revision,
              })),
            ]
          : [...formalChildren.map(graphMapEntry), ...existingCandidateChildren]
        : undefined,
    resources: resources.map((resource) => ({
      kind: resource.kind,
      path: resource.logicalPath,
      role: resource.role,
      workspacePath: resource.workspacePath,
    })),
  };
  requestIdentity.inputFingerprint = createHash('sha256')
    .update(JSON.stringify(packetWithoutFingerprint))
    .digest('hex');
  const prompt = continuesExistingSession
    ? buildTaskDecompositionContinuationPrompt(packetWithoutFingerprint)
    : buildTaskDecompositionPrompt(packetWithoutFingerprint);
  const timestamp = new Date().toISOString();
  await writeFile(
    path.join(runPath, 'request.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: timestamp,
        profile,
        packet: packetWithoutFingerprint,
        prompt,
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  const record: TaskDecompositionRunRecord = {
    schemaVersion: 1,
    runId,
    sessionId,
    requestId,
    agentSessionId: null,
    agentSessionMode: 'persistent',
    sourceNodeId: sourceNode.id,
    operation,
    parentRunId: coordinatorCandidate?.runId,
    revisionOf: revisionTarget?.candidate.candidateId,
    status: 'running',
    transport,
    profile,
    harness: {
      id: TASK_DECOMPOSITION_HARNESS_ID,
      revision: TASK_DECOMPOSITION_HARNESS_REVISION,
    },
    input: {
      instruction: input.instruction.trim(),
      projectInstructions: featureContext.instructions,
      resourcePaths: resources.map((resource) => resource.logicalPath),
      requestArtifact: 'request.json',
    },
    inputFingerprint: requestIdentity.inputFingerprint,
    startedAt: timestamp,
    updatedAt: timestamp,
    endedAt: null,
    usage: null,
    result: null,
    error: null,
  };
  await writeRunRecord(project, record);

  const agent = startLocalAgentRun(input.agent, {
    workingDirectory: runPath,
    prompt,
    resumeSessionId: coordinatorRun?.agentSessionId ?? undefined,
    model: profile.model || undefined,
    effort: profile.effort || undefined,
  });
  activeRuns.set(runKey(project, runId), { record, agent });
  void finishTaskDecompositionRun(
    project,
    record,
    agent,
    nodes,
    resources,
    existingCandidateChildren,
    revisionTarget?.candidate,
    operation === 'revise-candidate' ? [] : reservedCandidateIds,
  );
  return record;
}

export async function readTaskDecompositionRun(
  project: RegisteredProject,
  runId: string,
) {
  validateRunId(runId);
  await ensureGraphIdentities(project.planningPath, 'task-graph');
  const record = JSON.parse(
    await readFile(
      path.join(taskDecompositionRunPath(project, runId), 'run.json'),
      'utf8',
    ),
  ) as TaskDecompositionRunRecord;
  record.operation ??= record.revisionOf ? 'revise-candidate' : 'propose';
  if (record.result?.outcome === 'proposal') {
    record.result.candidates = await readIdentifiedEntities(
      project.planningPath,
      'task-graph',
      record.result.candidates,
    );
  }
  await ensureCandidateArtifacts(project, record);
  return record;
}

export async function listLatestTaskDecompositionRuns(
  project: RegisteredProject,
) {
  const root = path.join(project.planningPath, 'task-decomposition', 'runs');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^RUN-/i.test(entry.name))
      .map((entry) =>
        readTaskDecompositionRun(project, entry.name).catch(() => null),
      ),
  );
  return records
    .filter((record): record is TaskDecompositionRunRecord => record !== null)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export async function cancelTaskDecompositionRun(
  project: RegisteredProject,
  runId: string,
) {
  const record = await readTaskDecompositionRun(project, runId);
  if (!['running', 'validating'].includes(record.status)) return record;

  const active = activeRuns.get(runKey(project, runId));
  const timestamp = new Date().toISOString();
  const canceledRecord = active?.record ?? record;
  canceledRecord.status = 'canceled';
  canceledRecord.updatedAt = timestamp;
  canceledRecord.endedAt = timestamp;
  canceledRecord.error = null;
  await writeRunRecord(project, canceledRecord);
  active?.agent.cancel();
  return canceledRecord;
}

export async function acceptTaskDecompositionCandidate(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  return mutateTaskDecomposition(project, () =>
    acceptTaskDecompositionCandidateUnlocked(project, runId, candidateId),
  );
}

async function acceptTaskDecompositionCandidateUnlocked(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  if (
    [...activeRuns.values()].some(
      (active) =>
        active.record.revisionOf === candidateId &&
        ['running', 'validating'].includes(active.record.status),
    )
  ) {
    throw new PublicApiError(
      'Wait for the active Candidate revision to finish.',
      400,
    );
  }
  const run = await readTaskDecompositionRun(project, runId);
  if (run.result?.outcome !== 'proposal') {
    throw new PublicApiError('The Candidate proposal is unavailable.', 400);
  }
  const candidate = run.result.candidates.find(
    (value) => value.candidateId === candidateId,
  );
  if (!candidate)
    throw new PublicApiError('The Candidate could not be found.', 400);

  const existingNodes = await listTaskGraphNodes(project);
  const accepted = existingNodes.find((node) => node.uid === candidate.uid);
  if (accepted) return { node: accepted, nodes: existingNodes };
  const resolvedDependencies = resolveCandidateDependencies(
    candidate.candidateId,
    candidate.dependsOn,
    existingNodes,
  );

  if (!candidate.uid) throw new Error('Candidate stable identity is missing.');
  const { id: nodeId } = await reserveNodeIdentity(
    project.planningPath,
    'task-graph',
    candidate.uid,
  );
  const nodesPath = path.join(project.planningPath, 'task-graph', 'nodes');
  const nodePath = path.join(nodesPath, nodeId);
  const temporaryPath = path.join(nodesPath, `.${nodeId}-${randomUUID()}.tmp`);
  const candidateOutput = path.join(
    taskDecompositionRunPath(project, runId),
    'candidates',
    candidateId,
    'output.md',
  );
  await mkdir(temporaryPath, { recursive: true });

  try {
    await copyFile(candidateOutput, path.join(temporaryPath, 'output.md'));
    const timestamp = new Date().toISOString();
    const matchingType = existingNodes.find(
      (node) => node.type === candidate.type,
    );
    const node: TaskGraphNode = {
      schemaVersion: 1,
      id: nodeId,
      uid: candidate.uid,
      relations: candidate.relations,
      role: 'node',
      type: candidate.type,
      title: candidate.title,
      summary: candidate.summary,
      status: 'accepted',
      createdAt: timestamp,
      updatedAt: timestamp,
      resources: [
        ...candidate.resources,
        {
          kind: 'output',
          path: `task-graph/nodes/${nodeId}/output.md`,
        },
      ],
      derivedFrom: candidate.derivedFrom,
      dependsOn: resolvedDependencies,
      typeTemplateRef:
        candidate.typeTemplateRef ??
        matchingType?.typeTemplateRef ??
        matchingType?.id ??
        nodeId,
      metadata: candidate.metadata,
      presentation: candidate.presentation,
      provenance: {
        runId,
        candidateId,
        revision: candidate.revision,
      },
    };
    await writeFile(
      path.join(temporaryPath, 'node.json'),
      `${JSON.stringify(node, null, 2)}\n`,
      { flag: 'wx' },
    );
    await mkdir(nodesPath, { recursive: true });
    await rename(temporaryPath, nodePath);
    return { node, nodes: await listTaskGraphNodes(project) };
  } catch (error) {
    await import('node:fs/promises').then(({ rm }) =>
      rm(temporaryPath, { recursive: true, force: true }),
    );
    throw error;
  }
}

export async function discardTaskDecompositionCandidate(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  return mutateTaskDecomposition(project, () =>
    discardTaskDecompositionCandidateUnlocked(project, runId, candidateId),
  );
}

async function discardTaskDecompositionCandidateUnlocked(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  if (
    [...activeRuns.values()].some(
      (active) =>
        active.record.revisionOf === candidateId &&
        ['running', 'validating'].includes(active.record.status),
    )
  ) {
    throw new PublicApiError(
      'Cancel or finish the active Candidate revision first.',
      400,
    );
  }
  const requestedRun = await readTaskDecompositionRun(project, runId);
  if (requestedRun.result?.outcome !== 'proposal') {
    throw new PublicApiError('The Candidate proposal is unavailable.', 400);
  }
  const requestedCandidate = requestedRun.result.candidates.find(
    (candidate) => candidate.candidateId === candidateId,
  );
  if (!requestedCandidate)
    throw new PublicApiError('The Candidate could not be found.', 400);
  if (
    [...activeRuns.values()].some(
      (active) =>
        active.record.sourceNodeId === requestedRun.sourceNodeId &&
        ['running', 'validating'].includes(active.record.status),
    )
  ) {
    throw new PublicApiError(
      'Cancel or finish the active Agent Run first.',
      400,
    );
  }
  const accepted = (await listTaskGraphNodes(project)).some(
    (node) => node.provenance?.candidateId === candidateId,
  );
  if (accepted) {
    throw new PublicApiError(
      'An accepted Candidate must be managed as a formal Node.',
      400,
    );
  }
  const blockers = candidateDependencyBlockers(
    candidateId,
    await collectLatestUnacceptedCandidates(project),
  );
  if (blockers.length > 0) {
    throw new Error(
      `${candidateId} is still required by ${blockers.join(', ')}. Discard dependent Candidates first.`,
    );
  }

  const candidateRuns = (await readAllTaskDecompositionRuns(project)).filter(
    (run) =>
      run.result?.outcome === 'proposal' &&
      run.result.candidates.some(
        (candidate) => candidate.candidateId === candidateId,
      ),
  );
  let requestedRunDeleted = false;
  for (const run of candidateRuns) {
    const runDeleted = await discardCandidateFromRun(project, run, candidateId);
    if (run.runId === runId) requestedRunDeleted = runDeleted;
  }
  return { candidateId, runDeleted: requestedRunDeleted };
}

async function discardCandidateFromRun(
  project: RegisteredProject,
  run: TaskDecompositionRunRecord,
  candidateId: string,
) {
  if (run.result?.outcome !== 'proposal') return false;
  const candidateIndex = run.result.candidates.findIndex(
    (candidate) => candidate.candidateId === candidateId,
  );
  if (candidateIndex < 0) return false;
  const runPath = taskDecompositionRunPath(project, run.runId);
  if (run.result.candidates.length === 1) {
    await trash(runPath);
    return true;
  }
  const candidatePath = path.join(runPath, 'candidates', candidateId);
  const stagedPath = path.join(
    runPath,
    'candidates',
    `.${candidateId}-${randomUUID()}.discarding`,
  );
  await rename(candidatePath, stagedPath);
  try {
    run.result.candidates.splice(candidateIndex, 1);
    run.updatedAt = new Date().toISOString();
    await writeRunRecord(project, run);
  } catch (error) {
    await rename(stagedPath, candidatePath);
    throw error;
  }
  await trash(stagedPath);
  return false;
}

async function finishTaskDecompositionRun(
  project: RegisteredProject,
  record: TaskDecompositionRunRecord,
  agent: LocalAgentRun,
  nodes: TaskGraphNode[],
  resources: ContextWorkspaceEntry[],
  knownCandidates: Array<
    Extract<
      TaskDecompositionHarnessResult,
      { outcome: 'proposal' }
    >['candidates'][number]
  >,
  revisionTarget?: Extract<
    TaskDecompositionHarnessResult,
    { outcome: 'proposal' }
  >['candidates'][number],
  reservedCandidateIds: string[] = [],
) {
  try {
    const agentResult = await agent.completion;
    if (isRunCanceled(record)) return;
    record.status = 'validating';
    record.agentSessionId = agentResult.agentSessionId;
    record.usage = agentResult.usage;
    record.updatedAt = new Date().toISOString();
    await writeRunRecord(project, record);
    if (isRunCanceled(record)) return;

    const result = await parseIdentifiedResult(
      project.planningPath,
      'task-graph',
      agentResult.finalOutput,
      {
        request: {
          sessionId: record.sessionId,
          requestId: record.requestId,
          inputFingerprint: record.inputFingerprint,
        },
        knownNodeIds: nodes.map((node) => node.id),
        availableNodeContentIds: [
          record.sourceNodeId,
          ...resources.flatMap((resource) =>
            resource.nodeId ? [resource.nodeId] : [],
          ),
        ],
        knownResourcePaths: resources.map((resource) => resource.logicalPath),
        acceptedCandidateIds: nodes.flatMap((node) =>
          node.provenance?.candidateId ? [node.provenance.candidateId] : [],
        ),
        previousCandidateRevisions: revisionTarget
          ? { [revisionTarget.candidateId]: revisionTarget.revision }
          : undefined,
        reservedCandidateIds,
        knownCandidates,
      },
      parseTaskDecompositionHarnessResult,
      revisionTarget,
    );
    if (
      revisionTarget &&
      result.outcome === 'proposal' &&
      (result.candidates.length !== 1 ||
        result.candidates[0]?.candidateId !== revisionTarget.candidateId)
    ) {
      throw new Error(
        'A revision must return exactly the requested Candidate identifier.',
      );
    }
    const endedAt = new Date().toISOString();
    record.status = result.outcome;
    record.result = result;
    await ensureCandidateArtifacts(project, record);
    record.updatedAt = endedAt;
    record.endedAt = endedAt;
    await writeRunRecord(project, record);
  } catch (error) {
    if (isRunCanceled(record)) return;
    const endedAt = new Date().toISOString();
    record.status = 'failed';
    record.error =
      error instanceof Error ? error.message : 'The Agent Run failed.';
    record.updatedAt = endedAt;
    record.endedAt = endedAt;
    await writeRunRecord(project, record);
  } finally {
    activeRuns.delete(runKey(project, record.runId));
  }
}

async function collectContextWorkspaceInputs(
  project: RegisteredProject,
  sourceNode: TaskGraphNode,
  nodes: TaskGraphNode[],
  contextRefs: string[],
  uploads: ContextWorkspaceInput[],
  featureAttachmentNames: string[],
  revision?: { outputPath: string; resourcePaths: string[] },
) {
  const sourceOutputPaths = new Set(
    sourceNode.resources
      .filter((resource) => resource.kind === 'output')
      .map((resource) => resource.path),
  );
  const primarySourcePaths = primarySourceResourcePaths(
    sourceNode.role,
    sourceNode.resources,
  );
  const relatedNodeIds = relatedContextNodeIds(sourceNode, nodes);
  const graphRequests: Array<{
    path: string;
    role: 'primary' | 'related';
    kind: string;
    nodeId?: string;
  }> = [
    ...sourceNode.resources.map((resource) => ({
      path: resource.path,
      role: primarySourcePaths.has(resource.path)
        ? ('primary' as const)
        : ('related' as const),
      kind: resource.kind,
      nodeId: sourceOutputPaths.has(resource.path) ? sourceNode.id : undefined,
    })),
    ...contextRefs.map((resourcePath) => ({
      path: resourcePath,
      role: 'primary' as const,
      kind: 'run-context',
    })),
    ...(revision?.resourcePaths.map((resourcePath) => ({
      path: resourcePath,
      role: 'related' as const,
      kind: 'candidate-context',
    })) ?? []),
    ...(revision
      ? [
          {
            path: revision.outputPath,
            role: 'primary' as const,
            kind: 'candidate-output',
          },
        ]
      : []),
    ...nodes.flatMap((node) =>
      !relatedNodeIds.has(node.id)
        ? []
        : node.resources
            .filter((resource) => resource.kind === 'output')
            .map((resource) => ({
              path: resource.path,
              role: 'related' as const,
              kind: 'node-output',
              nodeId: node.id,
            })),
    ),
  ];
  const graphResources = await Promise.all(
    graphRequests.map(async (request) => {
      const resource = await readTaskGraphMarkdownResource(
        project,
        request.path,
      );
      return {
        role: request.role,
        kind: request.kind,
        logicalPath: resource.path,
        content: resource.markdown,
        ...(request.nodeId ? { nodeId: request.nodeId } : {}),
      };
    }),
  );
  const featureResources = await Promise.all(
    featureAttachmentNames.map(async (fileName) => {
      const attachment = await readTaskDecompositionAttachment(
        project,
        fileName,
      );
      return {
        role: 'related' as const,
        kind: 'decomposition-context',
        logicalPath: `task-decomposition/attachments/${attachment.fileName}`,
        content: attachment.content,
      };
    }),
  );
  return [...graphResources, ...featureResources, ...uploads];
}

async function saveUploadedResources(
  runId: string,
  resourcesPath: string,
  files: File[],
) {
  const usedNames = new Set<string>();
  const resources: ContextWorkspaceInput[] = [];
  for (const file of files) {
    if (!/\.(md|markdown)$/i.test(file.name)) {
      throw new PublicApiError(
        'Only Markdown Resources can be added to an Agent Run.',
        400,
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new PublicApiError(
        'Each Markdown Resource must be 2 MB or smaller.',
        400,
      );
    }
    const fileName = chooseUniqueFileName(file.name, usedNames);
    const content = await file.text();
    await writeFile(path.join(resourcesPath, fileName), content, {
      flag: 'wx',
    });
    resources.push({
      role: 'primary',
      kind: 'run-attachment',
      logicalPath: path.posix.join(
        'task-decomposition',
        'runs',
        runId,
        'resources',
        fileName,
      ),
      content,
    });
  }
  return resources;
}

function graphMapEntry(node: TaskGraphNode) {
  return {
    id: node.id,
    uid: node.uid,
    relations: node.relations,
    role: node.role,
    type: node.type,
    title: node.title,
    summary: node.summary ?? '',
    derivedFrom: node.derivedFrom ?? [],
    dependsOn: node.dependsOn,
    acceptedFromCandidateId: node.provenance?.candidateId ?? null,
    resourcePaths: node.resources.map((resource) => resource.path),
  };
}

async function writeRunRecord(
  project: RegisteredProject,
  record: TaskDecompositionRunRecord,
) {
  const runPath = taskDecompositionRunPath(project, record.runId);
  await mkdir(runPath, { recursive: true });
  const filePath = path.join(runPath, 'run.json');
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function validateRunRequest(input: RunRequest) {
  if (!/^NODE-[0-9a-f]{8,32}$/.test(input.sourceNodeId)) {
    throw new PublicApiError('The source Node is invalid.', 400);
  }
  const instruction = input.instruction.trim();
  if (!instruction)
    throw new PublicApiError('An Instruction is required.', 400);
  if (instruction.length > 1_000) {
    throw new PublicApiError(
      'The Instruction must be 1,000 characters or fewer.',
      400,
    );
  }
  if (input.contextRefs.length > 50) {
    throw new PublicApiError(
      'Select no more than 50 additional Context Resources.',
      400,
    );
  }
  if (input.files.length > 20) {
    throw new PublicApiError('Upload no more than 20 Markdown Resources.', 400);
  }
  if (
    (input.revisionRunId && !input.revisionCandidateId) ||
    (!input.revisionRunId && input.revisionCandidateId)
  ) {
    throw new PublicApiError(
      'A complete Candidate revision target is required.',
      400,
    );
  }
  if (
    input.operation !== undefined &&
    !['propose', 'append-candidates'].includes(input.operation)
  ) {
    throw new PublicApiError('The decomposition operation is invalid.', 400);
  }
}

async function resolveRevisionTarget(
  project: RegisteredProject,
  input: RunRequest,
) {
  if (!input.revisionRunId || !input.revisionCandidateId) return null;
  const run = await readTaskDecompositionRun(project, input.revisionRunId);
  if (run.result?.outcome !== 'proposal') {
    throw new PublicApiError(
      'The Candidate revision source is unavailable.',
      400,
    );
  }
  const candidate = run.result.candidates.find(
    (value) => value.candidateId === input.revisionCandidateId,
  );
  if (!candidate || run.sourceNodeId !== input.sourceNodeId) {
    throw new PublicApiError('The Candidate revision target is invalid.', 400);
  }
  return { run, candidate };
}

async function findLatestCoordinatorRun(
  project: RegisteredProject,
  sourceNodeId: string,
) {
  const runs = await readAllTaskDecompositionRuns(project);
  return (
    runs
      .filter(
        (run) =>
          run.sourceNodeId === sourceNodeId &&
          run.agentSessionId &&
          run.agentSessionMode === 'persistent',
      )
      .sort((left, right) =>
        right.startedAt.localeCompare(left.startedAt),
      )[0] ?? null
  );
}

async function collectExistingCandidateChildren(
  project: RegisteredProject,
  sourceNodeId: string,
) {
  return (await collectLatestUnacceptedCandidates(project)).filter(
    (candidate) => candidate.derivedFrom.includes(sourceNodeId),
  );
}

async function collectLatestUnacceptedCandidates(project: RegisteredProject) {
  const runs = await readAllTaskDecompositionRuns(project);
  const latestByCandidate = new Map<
    string,
    Extract<
      TaskDecompositionHarnessResult,
      { outcome: 'proposal' }
    >['candidates'][number]
  >();
  for (const run of runs.sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  )) {
    if (run.result?.outcome !== 'proposal') {
      continue;
    }
    for (const candidate of run.result.candidates) {
      const current = latestByCandidate.get(candidate.candidateId);
      if (!current || candidate.revision > current.revision) {
        latestByCandidate.set(candidate.candidateId, candidate);
      }
    }
  }
  const acceptedIds = new Set(
    (await listTaskGraphNodes(project)).flatMap((node) =>
      node.provenance?.candidateId ? [node.provenance.candidateId] : [],
    ),
  );
  return [...latestByCandidate.values()].filter(
    (candidate) => !acceptedIds.has(candidate.candidateId),
  );
}

async function collectReservedCandidateIds(project: RegisteredProject) {
  return reservedCandidateAliases(project.planningPath, 'task-graph');
}

async function readAllTaskDecompositionRuns(project: RegisteredProject) {
  const root = path.join(project.planningPath, 'task-decomposition', 'runs');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^RUN-/i.test(entry.name))
      .map((entry) =>
        readTaskDecompositionRun(project, entry.name).catch(() => null),
      ),
  );
  return records.filter(
    (record): record is TaskDecompositionRunRecord => record !== null,
  );
}

function chooseUniqueFileName(value: string, usedNames: Set<string>) {
  const parsed = path.parse(path.basename(value));
  const baseName =
    parsed.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resource';
  const extension =
    parsed.ext.toLowerCase() === '.markdown' ? '.markdown' : '.md';
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const fileName = `${baseName}${suffix === 1 ? '' : `-${suffix}`}${extension}`;
    if (!usedNames.has(fileName)) {
      usedNames.add(fileName);
      return fileName;
    }
  }
  throw new Error('Could not choose a unique Run Resource name.');
}

function taskDecompositionRunPath(project: RegisteredProject, runId: string) {
  validateRunId(runId);
  return path.join(project.planningPath, 'task-decomposition', 'runs', runId);
}

function validateRunId(runId: string) {
  if (!/^RUN-[0-9a-f-]{36}$/i.test(runId)) {
    throw new PublicApiError('The Agent Run identifier is invalid.', 400);
  }
}

function runKey(project: RegisteredProject, runId: string) {
  return `${project.id}:${runId}`;
}

const mutationRuntime = globalThis as typeof globalThis & {
  taskDecompositionMutations?: Map<string, Promise<unknown>>;
};
const mutations = (mutationRuntime.taskDecompositionMutations ??= new Map<
  string,
  Promise<unknown>
>());

async function mutateTaskDecomposition<T>(
  project: RegisteredProject,
  work: () => Promise<T>,
): Promise<T> {
  const previous = mutations.get(project.planningPath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mutations.set(project.planningPath, next);
  try {
    return (await next) as T;
  } finally {
    if (mutations.get(project.planningPath) === next)
      mutations.delete(project.planningPath);
  }
}

function getActiveRuns() {
  const runtime = globalThis as typeof globalThis & {
    __agentManagerRuns?: Map<string, ActiveRun>;
  };
  runtime.__agentManagerRuns ??= new Map<string, ActiveRun>();
  return runtime.__agentManagerRuns;
}

async function ensureCandidateArtifacts(
  project: RegisteredProject,
  record: TaskDecompositionRunRecord,
) {
  if (record.result?.outcome !== 'proposal') return;
  await Promise.all(
    record.result.candidates.map(async (candidate) => {
      const candidatePath = path.join(
        taskDecompositionRunPath(project, record.runId),
        'candidates',
        candidate.candidateId,
      );
      const outputPath = path.join(candidatePath, 'output.md');
      if (
        await access(outputPath)
          .then(() => true)
          .catch(() => false)
      )
        return;
      await mkdir(candidatePath, { recursive: true });
      await writeFile(outputPath, renderCandidateMarkdown(candidate), {
        flag: 'wx',
      });
    }),
  );
}

function renderCandidateMarkdown(
  candidate: Extract<
    TaskDecompositionHarnessResult,
    { outcome: 'proposal' }
  >['candidates'][number],
) {
  const relationships = [
    `- Derived from: ${candidate.derivedFrom.join(', ')}`,
    `- Depends on: ${candidate.dependsOn.join(', ') || 'None'}`,
  ];
  const resources = candidate.resources.length
    ? candidate.resources.map(
        (resource) => `- \`${resource.path}\` (${resource.kind})`,
      )
    : ['- None'];
  const assumptions = candidate.assumptions.length
    ? candidate.assumptions.map((assumption) => `- ${assumption}`)
    : ['- None'];
  const metadata = Object.keys(candidate.metadata).length
    ? `\n\`\`\`json\n${JSON.stringify(candidate.metadata, null, 2)}\n\`\`\``
    : '\nNone.';
  return `# ${candidate.title}

${candidate.summary}

## Candidate

- ID: \`${candidate.candidateId}\`
- Revision: ${candidate.revision}
- Type: ${candidate.type}

## Relationships

${relationships.join('\n')}

## Resources

${resources.join('\n')}

## Assumptions

${assumptions.join('\n')}

## Metadata
${metadata}
`;
}

function isRunCanceled(record: TaskDecompositionRunRecord) {
  return record.status === ('canceled' as TaskDecompositionRunStatus);
}
