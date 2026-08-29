import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import trash from 'trash';
import type { RegisteredProject } from './project-registry.ts';
import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_REVISION,
  parseWhatsNextHarnessResult,
  type WhatsNextCandidate,
  type WhatsNextHarnessResult,
} from './whats-next-harness.ts';
import {
  buildWhatsNextContinuationPrompt,
  buildWhatsNextPrompt,
} from './whats-next-prompt.ts';
import {
  readWhatsNextAttachment,
  readWhatsNextContext,
} from './whats-next-context.ts';
import {
  primarySourceResourcePaths,
  relatedContextNodeIds,
  writeTaskDecompositionContextWorkspace,
  type ContextWorkspaceEntry,
  type ContextWorkspaceInput,
} from './task-decomposition-context-workspace.ts';
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

export type WhatsNextRunStatus =
  | 'running'
  | 'validating'
  | 'proposal'
  | 'clarification'
  | 'no-change'
  | 'failed'
  | 'canceled';

export type WhatsNextRunTransport = 'codex-cli' | 'claude-cli';

const RUN_TRANSPORTS: Record<LocalAgentKind, WhatsNextRunTransport> = {
  codex: 'codex-cli',
  claude: 'claude-cli',
};

export type WhatsNextRunRecord = {
  schemaVersion: 1;
  runId: string;
  sessionId: string;
  requestId: string;
  agentSessionId: string | null;
  agentSessionMode?: 'persistent';
  sourceNodeIds: string[];
  operation: 'explore' | 'revise-candidate';
  parentRunId?: string;
  revisionOf?: string;
  status: WhatsNextRunStatus;
  transport: WhatsNextRunTransport;
  harness: {
    id: typeof WHATS_NEXT_HARNESS_ID;
    revision: typeof WHATS_NEXT_HARNESS_REVISION;
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
  result: WhatsNextHarnessResult | null;
  error: string | null;
};

type RunRequest = {
  sourceNodeIds: string[];
  agent: LocalAgentKind;
  instruction: string;
  contextRefs: string[];
  files: File[];
  revisionRunId?: string;
  revisionCandidateId?: string;
};

type ActiveRun = { record: WhatsNextRunRecord; agent: LocalAgentRun };

const activeRuns = getActiveRuns();

export async function startWhatsNextRun(
  project: RegisteredProject,
  input: RunRequest,
) {
  validateRunRequest(input);
  const nodes = await listTaskGraphNodes(project);
  const sourceNodes = input.sourceNodeIds.map((nodeId) => {
    const node = nodes.find((value) => value.id === nodeId);
    if (!node) throw new Error(`${nodeId} could not be found.`);
    return node;
  });
  const revisionTarget = await resolveRevisionTarget(project, input);
  const operation = revisionTarget ? 'revise-candidate' : 'explore';
  const transport = RUN_TRANSPORTS[input.agent];
  const coordinatorCandidate = revisionTarget
    ? revisionTarget.run
    : await findLatestCoordinatorRun(project, input.sourceNodeIds);
  const coordinatorRun =
    coordinatorCandidate?.agentSessionMode === 'persistent' &&
    coordinatorCandidate.transport === transport
      ? coordinatorCandidate
      : null;
  const continuesExistingSession = Boolean(coordinatorRun?.agentSessionId);
  const reservedCandidateIds = await collectReservedCandidateIds(project);
  if (
    [...activeRuns.values()].some(
      (active) =>
        active.record.sourceNodeIds.some((nodeId) =>
          input.sourceNodeIds.includes(nodeId),
        ) && ['running', 'validating'].includes(active.record.status),
    )
  ) {
    throw new Error("A selected Node already has an active What's next Run.");
  }

  const runId = `RUN-${randomUUID()}`;
  const sessionId = coordinatorRun?.sessionId ?? `SESSION-${randomUUID()}`;
  const requestId = `REQUEST-${randomUUID()}`;
  const runPath = whatsNextRunPath(project, runId);
  const resourcesPath = path.join(runPath, 'resources');
  await mkdir(resourcesPath, { recursive: true });

  const uploadedResources = await saveUploadedResources(
    runId,
    resourcesPath,
    input.files,
  );
  const featureContext = await readWhatsNextContext(project);
  const contextInputs = await collectContextWorkspaceInputs(
    project,
    sourceNodes,
    nodes,
    input.contextRefs,
    uploadedResources,
    featureContext.attachments.map((attachment) => attachment.fileName),
    revisionTarget
      ? {
          outputPath: `whats-next/runs/${revisionTarget.run.runId}/candidates/${revisionTarget.candidate.candidateId}/output.md`,
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
  const requestIdentity = { sessionId, requestId, inputFingerprint: '' };
  const packet = {
    request: requestIdentity,
    operation,
    instruction: input.instruction.trim(),
    projectInstructions: continuesExistingSession
      ? undefined
      : featureContext.instructions,
    graphMap: continuesExistingSession ? undefined : nodes.map(graphMapEntry),
    origins: sourceNodes.map(graphMapEntry),
    contextWorkspace: {
      root: contextWorkspace.root,
      indexPath: contextWorkspace.indexPath,
      primary: contextWorkspace.manifest.primary,
      related: contextWorkspace.manifest.related,
    },
    revisionTarget: revisionTarget?.candidate ?? null,
    reservedCandidateIds: reservedCandidateIds.filter(
      (candidateId) => candidateId !== revisionTarget?.candidate.candidateId,
    ),
    resources: resources.map((resource) => ({
      kind: resource.kind,
      path: resource.logicalPath,
      role: resource.role,
      workspacePath: resource.workspacePath,
    })),
  };
  requestIdentity.inputFingerprint = createHash('sha256')
    .update(JSON.stringify(packet))
    .digest('hex');
  const prompt = continuesExistingSession
    ? buildWhatsNextContinuationPrompt(packet)
    : buildWhatsNextPrompt(packet);
  const timestamp = new Date().toISOString();
  await writeFile(
    path.join(runPath, 'request.json'),
    `${JSON.stringify(
      { schemaVersion: 1, createdAt: timestamp, packet, prompt },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  );
  const record: WhatsNextRunRecord = {
    schemaVersion: 1,
    runId,
    sessionId,
    requestId,
    agentSessionId: null,
    agentSessionMode: 'persistent',
    sourceNodeIds: input.sourceNodeIds,
    operation,
    parentRunId: coordinatorCandidate?.runId,
    revisionOf: revisionTarget?.candidate.candidateId,
    status: 'running',
    transport,
    harness: {
      id: WHATS_NEXT_HARNESS_ID,
      revision: WHATS_NEXT_HARNESS_REVISION,
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
  });
  activeRuns.set(runKey(project, runId), { record, agent });
  void finishWhatsNextRun(
    project,
    record,
    agent,
    nodes,
    resources,
    revisionTarget?.candidate,
    operation === 'revise-candidate' ? [] : reservedCandidateIds,
  );
  return record;
}

export async function readWhatsNextRun(
  project: RegisteredProject,
  runId: string,
) {
  validateRunId(runId);
  const record = JSON.parse(
    await readFile(
      path.join(whatsNextRunPath(project, runId), 'run.json'),
      'utf8',
    ),
  ) as WhatsNextRunRecord;
  await ensureCandidateArtifacts(project, record);
  return record;
}

export async function listLatestWhatsNextRuns(project: RegisteredProject) {
  return (await readAllWhatsNextRuns(project)).sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
}

export async function cancelWhatsNextRun(
  project: RegisteredProject,
  runId: string,
) {
  const record = await readWhatsNextRun(project, runId);
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

export async function acceptWhatsNextCandidate(
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
    throw new Error('Wait for the active Candidate revision to finish.');
  }
  const run = await readWhatsNextRun(project, runId);
  if (run.result?.outcome !== 'proposal') {
    throw new Error('The Candidate proposal is unavailable.');
  }
  const candidate = run.result.candidates.find(
    (value) => value.candidateId === candidateId,
  );
  if (!candidate) throw new Error('The Candidate could not be found.');

  const existingNodes = await listTaskGraphNodes(project);
  const accepted = existingNodes.find(
    (node) =>
      node.provenance?.candidateId === candidateId &&
      node.provenance?.runId === runId,
  );
  if (accepted) return { node: accepted, nodes: existingNodes };

  const acceptedCandidateNodeIds = new Map(
    existingNodes.flatMap((node) =>
      node.provenance?.candidateId
        ? [[node.provenance.candidateId, node.id]]
        : [],
    ),
  );
  const unresolved = candidate.dependsOn.filter(
    (dependencyId) =>
      dependencyId.startsWith('CANDIDATE-') &&
      !acceptedCandidateNodeIds.has(dependencyId),
  );
  if (unresolved.length > 0) {
    throw new Error(
      `Accept ${unresolved.join(', ')} first: this direction names it as a prerequisite.`,
    );
  }
  const resolvedDependencies = candidate.dependsOn.map(
    (dependencyId) =>
      acceptedCandidateNodeIds.get(dependencyId) ?? dependencyId,
  );

  const nextNumber =
    existingNodes.reduce((largest, node) => {
      const number = Number(node.id.replace(/^NODE-/, ''));
      return Number.isFinite(number) ? Math.max(largest, number) : largest;
    }, 0) + 1;
  const nodeId = `NODE-${String(nextNumber).padStart(4, '0')}`;
  const nodesPath = path.join(project.planningPath, 'task-graph', 'nodes');
  const nodePath = path.join(nodesPath, nodeId);
  const temporaryPath = path.join(nodesPath, `.${nodeId}-${randomUUID()}.tmp`);
  const candidateOutput = path.join(
    whatsNextRunPath(project, runId),
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
      role: 'node',
      type: candidate.type,
      title: candidate.title,
      summary: candidate.summary,
      status: 'accepted',
      createdAt: timestamp,
      updatedAt: timestamp,
      resources: [
        ...candidate.resources,
        { kind: 'output', path: `task-graph/nodes/${nodeId}/output.md` },
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
        feature: 'whats-next',
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
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

export async function discardWhatsNextCandidate(
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
    throw new Error('Cancel or finish the active Candidate revision first.');
  }
  const requestedRun = await readWhatsNextRun(project, runId);
  if (requestedRun.result?.outcome !== 'proposal') {
    throw new Error('The Candidate proposal is unavailable.');
  }
  if (
    !requestedRun.result.candidates.some(
      (candidate) => candidate.candidateId === candidateId,
    )
  ) {
    throw new Error('The Candidate could not be found.');
  }
  const accepted = (await listTaskGraphNodes(project)).some(
    (node) => node.provenance?.candidateId === candidateId,
  );
  if (accepted) {
    throw new Error('An accepted Candidate must be managed as a formal Node.');
  }
  const blockers = (await collectLatestUnacceptedCandidates(project))
    .filter(
      (candidate) =>
        candidate.candidateId !== candidateId &&
        candidate.dependsOn.includes(candidateId),
    )
    .map((candidate) => candidate.candidateId);
  if (blockers.length > 0) {
    throw new Error(
      `${candidateId} is still required by ${blockers.join(', ')}. Discard those directions first.`,
    );
  }

  const candidateRuns = (await readAllWhatsNextRuns(project)).filter(
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
  run: WhatsNextRunRecord,
  candidateId: string,
) {
  if (run.result?.outcome !== 'proposal') return false;
  const candidateIndex = run.result.candidates.findIndex(
    (candidate) => candidate.candidateId === candidateId,
  );
  if (candidateIndex < 0) return false;
  const runPath = whatsNextRunPath(project, run.runId);
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

async function finishWhatsNextRun(
  project: RegisteredProject,
  record: WhatsNextRunRecord,
  agent: LocalAgentRun,
  nodes: TaskGraphNode[],
  resources: ContextWorkspaceEntry[],
  revisionTarget?: WhatsNextCandidate,
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

    const result = parseWhatsNextHarnessResult(agentResult.finalOutput, {
      request: {
        sessionId: record.sessionId,
        requestId: record.requestId,
        inputFingerprint: record.inputFingerprint,
      },
      knownNodeIds: nodes.map((node) => node.id),
      knownResourcePaths: resources.map((resource) => resource.logicalPath),
      acceptedCandidateIds: nodes.flatMap((node) =>
        node.provenance?.candidateId ? [node.provenance.candidateId] : [],
      ),
      previousCandidateRevisions: revisionTarget
        ? { [revisionTarget.candidateId]: revisionTarget.revision }
        : undefined,
      reservedCandidateIds,
      knownCandidates: await collectLatestUnacceptedCandidates(project),
    });
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
      error instanceof Error ? error.message : "The What's next Run failed.";
    record.updatedAt = endedAt;
    record.endedAt = endedAt;
    await writeRunRecord(project, record);
  } finally {
    activeRuns.delete(runKey(project, record.runId));
  }
}

async function collectContextWorkspaceInputs(
  project: RegisteredProject,
  sourceNodes: TaskGraphNode[],
  nodes: TaskGraphNode[],
  contextRefs: string[],
  uploads: ContextWorkspaceInput[],
  featureAttachmentNames: string[],
  revision?: { outputPath: string; resourcePaths: string[] },
) {
  const relatedNodeIds = new Set(
    sourceNodes.flatMap((sourceNode) => [
      ...relatedContextNodeIds(sourceNode, nodes),
    ]),
  );
  for (const sourceNode of sourceNodes) relatedNodeIds.delete(sourceNode.id);

  const graphRequests = [
    ...sourceNodes.flatMap((sourceNode) => {
      const sourceOutputPaths = new Set(
        sourceNode.resources
          .filter((resource) => resource.kind === 'output')
          .map((resource) => resource.path),
      );
      const primaryPaths = primarySourceResourcePaths(
        sourceNode.role,
        sourceNode.resources,
      );
      return sourceNode.resources.map((resource) => ({
        path: resource.path,
        role: primaryPaths.has(resource.path)
          ? ('primary' as const)
          : ('related' as const),
        kind: resource.kind,
        nodeId: sourceOutputPaths.has(resource.path)
          ? sourceNode.id
          : undefined,
      }));
    }),
    ...contextRefs.map((resourcePath) => ({
      path: resourcePath,
      role: 'primary' as const,
      kind: 'run-context',
      nodeId: undefined,
    })),
    ...(revision?.resourcePaths.map((resourcePath) => ({
      path: resourcePath,
      role: 'related' as const,
      kind: 'candidate-context',
      nodeId: undefined,
    })) ?? []),
    ...(revision
      ? [
          {
            path: revision.outputPath,
            role: 'primary' as const,
            kind: 'candidate-output',
            nodeId: undefined,
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
      const attachment = await readWhatsNextAttachment(project, fileName);
      return {
        role: 'related' as const,
        kind: 'whats-next-context',
        logicalPath: `whats-next/attachments/${attachment.fileName}`,
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
      throw new Error(
        "Only Markdown Resources can be added to a What's next Run.",
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Each Markdown Resource must be 2 MB or smaller.');
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
        'whats-next',
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
  record: WhatsNextRunRecord,
) {
  const runPath = whatsNextRunPath(project, record.runId);
  await mkdir(runPath, { recursive: true });
  const filePath = path.join(runPath, 'run.json');
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function validateRunRequest(input: RunRequest) {
  if (input.sourceNodeIds.length === 0) {
    throw new Error('Select at least one origin Node.');
  }
  if (input.sourceNodeIds.length > 10) {
    throw new Error('Select no more than 10 origin Nodes.');
  }
  if (new Set(input.sourceNodeIds).size !== input.sourceNodeIds.length) {
    throw new Error('Origin Nodes must be unique.');
  }
  if (input.sourceNodeIds.some((nodeId) => !/^NODE-\d{4,}$/.test(nodeId))) {
    throw new Error('An origin Node is invalid.');
  }
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('An Instruction is required.');
  if (instruction.length > 1_000) {
    throw new Error('The Instruction must be 1,000 characters or fewer.');
  }
  if (input.contextRefs.length > 50) {
    throw new Error('Select no more than 50 additional Context Resources.');
  }
  if (input.files.length > 20) {
    throw new Error('Upload no more than 20 Markdown Resources.');
  }
  if (
    (input.revisionRunId && !input.revisionCandidateId) ||
    (!input.revisionRunId && input.revisionCandidateId)
  ) {
    throw new Error('A complete Candidate revision target is required.');
  }
}

async function resolveRevisionTarget(
  project: RegisteredProject,
  input: RunRequest,
) {
  if (!input.revisionRunId || !input.revisionCandidateId) return null;
  const run = await readWhatsNextRun(project, input.revisionRunId);
  if (run.result?.outcome !== 'proposal') {
    throw new Error('The Candidate revision source is unavailable.');
  }
  const candidate = run.result.candidates.find(
    (value) => value.candidateId === input.revisionCandidateId,
  );
  if (!candidate) throw new Error('The Candidate revision target is invalid.');
  return { run, candidate };
}

async function findLatestCoordinatorRun(
  project: RegisteredProject,
  sourceNodeIds: string[],
) {
  const key = [...sourceNodeIds].sort().join(',');
  return (
    (await readAllWhatsNextRuns(project))
      .filter(
        (run) =>
          run.agentSessionId &&
          run.agentSessionMode === 'persistent' &&
          [...run.sourceNodeIds].sort().join(',') === key,
      )
      .sort((left, right) =>
        right.startedAt.localeCompare(left.startedAt),
      )[0] ?? null
  );
}

async function collectLatestUnacceptedCandidates(project: RegisteredProject) {
  const runs = await readAllWhatsNextRuns(project);
  const latestByCandidate = new Map<string, WhatsNextCandidate>();
  for (const run of runs.sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  )) {
    if (run.result?.outcome !== 'proposal') continue;
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
  const runs = await readAllWhatsNextRuns(project);
  return [
    ...new Set(
      runs.flatMap((run) =>
        run.result?.outcome === 'proposal'
          ? run.result.candidates.map((candidate) => candidate.candidateId)
          : [],
      ),
    ),
  ];
}

async function readAllWhatsNextRuns(project: RegisteredProject) {
  const root = path.join(project.planningPath, 'whats-next', 'runs');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^RUN-/i.test(entry.name))
      .map((entry) => readWhatsNextRun(project, entry.name).catch(() => null)),
  );
  return records.filter(
    (record): record is WhatsNextRunRecord => record !== null,
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

function whatsNextRunPath(project: RegisteredProject, runId: string) {
  validateRunId(runId);
  return path.join(project.planningPath, 'whats-next', 'runs', runId);
}

function validateRunId(runId: string) {
  if (!/^RUN-[0-9a-f-]{36}$/i.test(runId)) {
    throw new Error("The What's next Run identifier is invalid.");
  }
}

function runKey(project: RegisteredProject, runId: string) {
  return `${project.id}:${runId}`;
}

function getActiveRuns() {
  const runtime = globalThis as typeof globalThis & {
    __agentManagerWhatsNextRuns?: Map<string, ActiveRun>;
  };
  runtime.__agentManagerWhatsNextRuns ??= new Map<string, ActiveRun>();
  return runtime.__agentManagerWhatsNextRuns;
}

async function ensureCandidateArtifacts(
  project: RegisteredProject,
  record: WhatsNextRunRecord,
) {
  if (record.result?.outcome !== 'proposal') return;
  await Promise.all(
    record.result.candidates.map(async (candidate) => {
      const candidatePath = path.join(
        whatsNextRunPath(project, record.runId),
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

function renderCandidateMarkdown(candidate: WhatsNextCandidate) {
  const relationships = [
    `- Grew from: ${candidate.derivedFrom.join(', ')}`,
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

## Direction

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

function isRunCanceled(record: WhatsNextRunRecord) {
  return record.status === ('canceled' as WhatsNextRunStatus);
}
