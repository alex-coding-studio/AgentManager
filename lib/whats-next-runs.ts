import { createHash, randomUUID } from 'node:crypto';
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
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import trash from 'trash';
import type { RegisteredProject } from './project-registry.ts';
import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_REVISION,
  canReuseWhatsNextSession,
  createWhatsNextRevisionTarget,
  parseWhatsNextHarnessResult,
  type WhatsNextCandidate,
  type WhatsNextHarnessResult,
} from './whats-next-harness.ts';
import {
  buildWhatsNextContinuationPrompt,
  buildWhatsNextPrompt,
} from './whats-next-prompt.ts';
import { renderWhatsNextResponseMarkdown } from './whats-next-response.ts';
import {
  isPendingReplacement,
  redoProposalPlan,
  redoProposalContext,
  type ProposalReplacement,
} from './whats-next-redo.ts';
import {
  readWhatsNextAttachment,
  readWhatsNextContext,
} from './whats-next-context.ts';
import {
  candidateDependencyBlockers,
  resolveCandidateDependencies,
} from './task-decomposition-dependencies.ts';
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

const GRAPH_ROOT = 'whats-next' as const;

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
  operation: 'explore' | 'refine-candidate';
  parentRunId?: string;
  revisionOf?: string;
  replacement?: ProposalReplacement;
  cleanupWarning?: string;
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
    feedback: WhatsNextFeedbackAnchor[];
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

export type WhatsNextFeedbackAnchor = {
  feedbackId: string;
  path: string;
  baseRevision: number;
  startLine: number;
  endLine: number;
  excerpt: string;
  excerptHash: string;
  instruction: string;
};

type RunRequest = {
  sourceNodeIds: string[];
  agent: LocalAgentKind;
  instruction: string;
  contextRefs: string[];
  files: File[];
  feedback?: WhatsNextFeedbackAnchor[];
  revisionRunId?: string;
  revisionCandidateId?: string;
  redoProposal?: boolean;
};

type ActiveRun = { record: WhatsNextRunRecord; agent: LocalAgentRun };

const activeRuns = getActiveRuns();

export async function startWhatsNextRun(
  project: RegisteredProject,
  input: RunRequest,
) {
  return mutateWhatsNext(project, () =>
    startWhatsNextRunUnlocked(project, input),
  );
}

async function startWhatsNextRunUnlocked(
  project: RegisteredProject,
  input: RunRequest,
) {
  validateRunRequest(input);
  const nodes = await listTaskGraphNodes(project, GRAPH_ROOT);
  const allRuns = await readAllWhatsNextRuns(project);
  assertNoPendingReplacement(allRuns, input.sourceNodeIds);
  const redo = input.redoProposal
    ? redoProposalPlan(nodes, allRuns, input.sourceNodeIds)
    : null;
  const sourceNodes = input.sourceNodeIds.map((nodeId) => {
    const node = nodes.find((value) => value.id === nodeId);
    if (!node) throw new Error(`${nodeId} could not be found.`);
    return node;
  });
  const revisionTarget = await resolveRevisionTarget(project, input);
  if (revisionTarget && input.feedback?.length) {
    await validateInlineFeedback(project, revisionTarget, input.feedback);
  }
  const operation = revisionTarget ? 'refine-candidate' : 'explore';
  const transport = RUN_TRANSPORTS[input.agent];
  const coordinatorCandidate = revisionTarget
    ? revisionTarget.run
    : await findLatestCoordinatorRun(project, input.sourceNodeIds);
  const coordinatorRun =
    !redo &&
    coordinatorCandidate &&
    canReuseWhatsNextSession(coordinatorCandidate, transport)
      ? coordinatorCandidate
      : null;
  const continuesExistingSession = Boolean(coordinatorRun?.agentSessionId);
  const effectiveInstruction =
    input.instruction.trim() ||
    (revisionTarget
      ? 'Refine the current Candidate using the attached inline feedback.'
      : continuesExistingSession
        ? continuationInstruction(
            coordinatorRun?.result?.reflection.continuationAdvice
              .recommendedFocus,
          )
        : 'Explore the most useful next directions from the selected origin.');
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
  if (redo) {
    const priorPaths = new Set(
      redo.targets.flatMap(({ candidate }) =>
        candidate.resources.map((resource) => resource.path),
      ),
    );
    for (const [index, resourcePath] of [...priorPaths].entries()) {
      const resource = await readTaskGraphMarkdownResource(
        project,
        resourcePath,
      );
      const name = `prior-resource-${index + 1}.md`;
      await writeFile(path.join(resourcesPath, name), resource.markdown, {
        flag: 'wx',
      });
      uploadedResources.push({
        logicalPath: `whats-next/runs/${runId}/resources/${name}`,
        kind: 'prior-context',
        role: 'primary',
        content: resource.markdown,
      });
    }
    const priorMarkdown = redoProposalContext(redo).markdown;
    await writeFile(
      path.join(resourcesPath, 'previous-proposal.md'),
      priorMarkdown,
      { flag: 'wx' },
    );
    uploadedResources.push({
      logicalPath: `whats-next/runs/${runId}/resources/previous-proposal.md`,
      kind: 'previous-proposal',
      role: 'primary',
      content: priorMarkdown,
    });
  }
  const featureContext = await readWhatsNextContext(project);
  const contextInputs = await collectContextWorkspaceInputs(
    project,
    sourceNodes,
    nodes,
    input.contextRefs,
    uploadedResources,
    featureContext.attachments.map((attachment) => attachment.fileName),
    redo ? false : continuesExistingSession,
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
    proposalCorrection: redo
      ? {
          intent:
            'Redo the entire unaccepted proposal from these origins using the current Instruction as feedback. The previous proposal is evidence of what the user is correcting, not a direction to preserve. Return a new proposal, not single-card refinement. Do not modify the parent or other branches.',
          previousCandidateIds: redo.candidateIds,
        }
      : undefined,
    instruction: effectiveInstruction,
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
    revisionTarget: revisionTarget
      ? createWhatsNextRevisionTarget(revisionTarget.candidate)
      : null,
    feedback: input.feedback ?? [],
    previousProposalAliases: coordinatorRun?.result?.candidateAliases ?? {},
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
  const prompt =
    continuesExistingSession &&
    coordinatorRun?.harness.revision === WHATS_NEXT_HARNESS_REVISION
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
    replacement: redo
      ? {
          state: 'pending',
          candidateIds: redo.candidateIds,
          runIds: redo.runIds,
          snapshot: createHash('sha256').update(redo.snapshot).digest('hex'),
        }
      : undefined,
    status: 'running',
    transport,
    harness: {
      id: WHATS_NEXT_HARNESS_ID,
      revision: WHATS_NEXT_HARNESS_REVISION,
    },
    input: {
      instruction: effectiveInstruction,
      projectInstructions: featureContext.instructions,
      resourcePaths: resources.map((resource) => resource.logicalPath),
      feedback: input.feedback ?? [],
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
    operation === 'refine-candidate' ? [] : reservedCandidateIds,
  );
  return record;
}

export async function readWhatsNextRun(
  project: RegisteredProject,
  runId: string,
) {
  validateRunId(runId);
  await ensureGraphIdentities(project.planningPath, GRAPH_ROOT);
  const stored = JSON.parse(
    await readFile(
      path.join(whatsNextRunPath(project, runId), 'run.json'),
      'utf8',
    ),
  ) as Omit<WhatsNextRunRecord, 'operation'> & { operation?: string };
  if (stored.operation === 'revise-candidate') {
    stored.operation = 'refine-candidate';
  }
  stored.operation ??= stored.revisionOf ? 'refine-candidate' : 'explore';
  const record = stored as WhatsNextRunRecord;
  if (record.result?.outcome === 'proposal') {
    record.result.candidates = await readIdentifiedEntities(
      project.planningPath,
      GRAPH_ROOT,
      record.result.candidates,
    );
  }
  if (record.result && !record.result.reflection) {
    record.result.reflection = {
      markdown: record.result.exploration.notes.length
        ? `# Reflection\n\n${record.result.exploration.notes.join('\n\n')}`
        : '# Reflection\n\nThis legacy Run did not record a Reflection.',
      continuationAdvice: {
        action: 'continue',
        recommendedFocus: 'expand',
        reason: 'This legacy Run predates explicit continuation advice.',
      },
    };
  }
  if (record.result?.reflection.continuationAdvice) {
    record.result.reflection.continuationAdvice.recommendedFocus ??= 'expand';
  }
  if (record.result?.outcome === 'proposal') {
    for (const candidate of record.result.candidates) {
      if (candidate.outputMarkdown) continue;
      candidate.outputMarkdown = await readFile(
        path.join(
          whatsNextRunPath(project, record.runId),
          'candidates',
          candidate.candidateId,
          'output.md',
        ),
        'utf8',
      ).catch(() => renderLegacyCandidateMarkdown(candidate));
    }
  }
  await ensureCandidateArtifacts(project, record);
  return record;
}

function continuationInstruction(
  focus: 'clarify' | 'concretize' | 'expand' | 'compare' | 'close' | undefined,
) {
  if (focus === 'concretize') {
    return 'Continue this line of inquiry exactly one semantic level more concrete. Propose user-observable product directions that validate the current meaning without repeating the principle or jumping to implementation steps.';
  }
  if (focus === 'clarify') {
    return 'Continue by resolving the smallest material ambiguity that blocks honest product directions. Prefer one bounded clarification with concrete options.';
  }
  if (focus === 'compare') {
    return 'Continue by making the meaningful differences and overlap between the current directions easier for the user to judge.';
  }
  if (focus === 'close') {
    return 'Reassess whether this line of inquiry has sufficient clarity. Return no-change when another round would only repeat accepted meaning.';
  }
  return 'Continue this line of inquiry from the current accepted understanding and explore the most useful adjacent meaning at the current semantic resolution.';
}

export async function listLatestWhatsNextRuns(project: RegisteredProject) {
  return (await readAllWhatsNextRuns(project)).sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt),
  );
}

export async function recoverWhatsNextRunResult(
  project: RegisteredProject,
  runId: string,
  finalOutput: string,
) {
  const record = await readWhatsNextRun(project, runId);
  if (record.status !== 'failed' || record.result) {
    throw new Error(
      'Only a failed Run without a validated result can recover.',
    );
  }
  const nodes = await listTaskGraphNodes(project, GRAPH_ROOT);
  const revisionTarget =
    record.revisionOf && record.parentRunId
      ? await readWhatsNextRun(project, record.parentRunId).then((parent) =>
          parent.result?.outcome === 'proposal'
            ? (parent.result.candidates.find(
                (candidate) => candidate.candidateId === record.revisionOf,
              ) ?? null)
            : null,
        )
      : null;
  const result = await parseIdentifiedResult(
    project.planningPath,
    GRAPH_ROOT,
    finalOutput,
    {
      request: {
        sessionId: record.sessionId,
        requestId: record.requestId,
        inputFingerprint: record.inputFingerprint,
      },
      operation: record.operation,
      revisionCandidateId: revisionTarget?.candidateId,
      revisionTarget: revisionTarget ?? undefined,
      knownNodeIds: nodes.map((node) => node.id),
      knownResourcePaths: record.input?.resourcePaths ?? [],
      acceptedCandidateIds: nodes.flatMap((node) =>
        node.provenance?.candidateId ? [node.provenance.candidateId] : [],
      ),
      previousCandidateRevisions: revisionTarget
        ? { [revisionTarget.candidateId]: revisionTarget.revision }
        : undefined,
      reservedCandidateIds:
        record.operation === 'refine-candidate'
          ? []
          : await collectReservedCandidateIds(project),
      knownCandidates: await collectLatestUnacceptedCandidates(project),
    },
    parseWhatsNextHarnessResult,
    revisionTarget ?? undefined,
  );
  const timestamp = new Date().toISOString();
  record.status = result.outcome;
  record.result = result;
  record.error = null;
  record.updatedAt = timestamp;
  record.endedAt ??= timestamp;
  await ensureCandidateArtifacts(project, record);
  await writeWhatsNextCheckpoint(project, record);
  await writeRunRecord(project, record);
  return record;
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
  return mutateWhatsNext(project, () =>
    acceptWhatsNextCandidateUnlocked(project, runId, candidateId),
  );
}

async function acceptWhatsNextCandidateUnlocked(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  const allRuns = await readAllWhatsNextRuns(project);
  const availableRun = allRuns.find((run) => run.runId === runId);
  if (!availableRun || isPendingReplacement(availableRun))
    throw new Error(
      'Confirm the replacement proposal before accepting its Candidates.',
    );
  assertNoPendingReplacement(allRuns, availableRun.sourceNodeIds);
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

  const existingNodes = await listTaskGraphNodes(project, GRAPH_ROOT);
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
    GRAPH_ROOT,
    candidate.uid,
  );
  const nodesPath = path.join(project.planningPath, GRAPH_ROOT, 'nodes');
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
        { kind: 'output', path: `${GRAPH_ROOT}/nodes/${nodeId}/output.md` },
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
    return { node, nodes: await listTaskGraphNodes(project, GRAPH_ROOT) };
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
  return mutateWhatsNext(project, () =>
    discardWhatsNextCandidateUnlocked(project, runId, candidateId),
  );
}

async function discardWhatsNextCandidateUnlocked(
  project: RegisteredProject,
  runId: string,
  candidateId: string,
) {
  const allRuns = await readAllWhatsNextRuns(project);
  const availableRun = allRuns.find((run) => run.runId === runId);
  if (!availableRun || isPendingReplacement(availableRun))
    throw new Error(
      'Keep or replace the original proposal before changing individual Candidates.',
    );
  assertNoPendingReplacement(allRuns, availableRun.sourceNodeIds);
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
  const accepted = (await listTaskGraphNodes(project, GRAPH_ROOT)).some(
    (node) => node.provenance?.candidateId === candidateId,
  );
  if (accepted) {
    throw new Error('An accepted Candidate must be managed as a formal Node.');
  }
  const blockers = candidateDependencyBlockers(
    candidateId,
    await collectLatestUnacceptedCandidates(project),
  );
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
    await ensureCandidateArtifacts(project, run);
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

    const result = await parseIdentifiedResult(
      project.planningPath,
      GRAPH_ROOT,
      agentResult.finalOutput,
      {
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
        knownCandidates: (
          await collectLatestUnacceptedCandidates(project)
        ).filter(
          (candidate) =>
            !record.replacement?.candidateIds.includes(candidate.candidateId),
        ),
        operation: record.operation,
        revisionCandidateId: revisionTarget?.candidateId,
        revisionTarget,
      },
      parseWhatsNextHarnessResult,
      revisionTarget,
    );
    if (
      revisionTarget &&
      result.outcome === 'proposal' &&
      (result.candidates.length !== 1 ||
        result.candidates[0]?.candidateId !== revisionTarget.candidateId)
    ) {
      throw new Error(
        'Refine must return exactly the requested Candidate identifier.',
      );
    }
    const endedAt = new Date().toISOString();
    record.status = result.outcome;
    record.result = result;
    record.updatedAt = endedAt;
    record.endedAt = endedAt;
    await ensureCandidateArtifacts(project, record);
    await writeWhatsNextCheckpoint(project, record);
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
  continuesExistingSession: boolean,
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
        role:
          !continuesExistingSession && primaryPaths.has(resource.path)
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
  if (
    input.redoProposal &&
    (input.revisionRunId || input.revisionCandidateId || input.feedback?.length)
  )
    throw new Error(
      'Redo a proposal separately from single-Candidate refinement.',
    );
  if (input.redoProposal && !input.instruction.trim())
    throw new Error(
      'Describe what the whole proposal misunderstood and what you want instead.',
    );
  if (input.sourceNodeIds.length === 0) {
    throw new Error('Select at least one origin Node.');
  }
  if (input.sourceNodeIds.length > 10) {
    throw new Error('Select no more than 10 origin Nodes.');
  }
  if (new Set(input.sourceNodeIds).size !== input.sourceNodeIds.length) {
    throw new Error('Origin Nodes must be unique.');
  }
  if (
    input.sourceNodeIds.some((nodeId) => !/^NODE-[0-9a-f]{8,32}$/.test(nodeId))
  ) {
    throw new Error('An origin Node is invalid.');
  }
  const instruction = input.instruction.trim();
  if (
    input.revisionCandidateId &&
    !instruction &&
    (input.feedback?.length ?? 0) === 0
  ) {
    throw new Error('Refine requires feedback or an Instruction.');
  }
  if (instruction.length > 1_000) {
    throw new Error('The Instruction must be 1,000 characters or fewer.');
  }
  if (input.contextRefs.length > 50) {
    throw new Error('Select no more than 50 additional Context Resources.');
  }
  if (input.files.length > 20) {
    throw new Error('Upload no more than 20 Markdown Resources.');
  }
  for (const feedback of input.feedback ?? []) {
    if (
      !feedback.feedbackId ||
      !feedback.path ||
      feedback.baseRevision < 1 ||
      feedback.startLine < 1 ||
      feedback.endLine < feedback.startLine ||
      !feedback.excerpt.trim() ||
      !feedback.excerptHash ||
      !feedback.instruction.trim()
    ) {
      throw new Error('Inline feedback is invalid.');
    }
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

async function validateInlineFeedback(
  project: RegisteredProject,
  target: { run: WhatsNextRunRecord; candidate: WhatsNextCandidate },
  feedback: WhatsNextFeedbackAnchor[],
) {
  const expectedPath = `whats-next/runs/${target.run.runId}/candidates/${target.candidate.candidateId}/output.md`;
  const markdown = await readFile(
    path.join(
      whatsNextRunPath(project, target.run.runId),
      'candidates',
      target.candidate.candidateId,
      'output.md',
    ),
    'utf8',
  );
  const lines = markdown.split('\n');
  for (const item of feedback) {
    const selfHash = createHash('sha256').update(item.excerpt).digest('hex');
    const currentExcerpt = lines
      .slice(item.startLine - 1, item.endLine)
      .join('\n');
    if (
      item.path !== expectedPath ||
      item.baseRevision !== target.candidate.revision ||
      selfHash !== item.excerptHash ||
      !normalizeExcerpt(currentExcerpt).includes(normalizeExcerpt(item.excerpt))
    ) {
      throw new Error(
        'Inline feedback is stale. Reopen the current Candidate and select the text again.',
      );
    }
  }
}

function normalizeExcerpt(value: string) {
  return value
    .replace(/^\s*[-*#>]\s*/gm, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
          run.harness.revision === WHATS_NEXT_HARNESS_REVISION &&
          ['proposal', 'clarification', 'no-change'].includes(run.status) &&
          !isPendingReplacement(run) &&
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
    if (run.result?.outcome !== 'proposal' || isPendingReplacement(run))
      continue;
    for (const candidate of run.result.candidates) {
      const current = latestByCandidate.get(candidate.candidateId);
      if (!current || candidate.revision > current.revision) {
        latestByCandidate.set(candidate.candidateId, candidate);
      }
    }
  }
  const acceptedIds = new Set(
    (await listTaskGraphNodes(project, GRAPH_ROOT)).flatMap((node) =>
      node.provenance?.candidateId ? [node.provenance.candidateId] : [],
    ),
  );
  return [...latestByCandidate.values()].filter(
    (candidate) => !acceptedIds.has(candidate.candidateId),
  );
}

async function collectReservedCandidateIds(project: RegisteredProject) {
  return reservedCandidateAliases(project.planningPath, GRAPH_ROOT);
}

async function readAllWhatsNextRuns(project: RegisteredProject) {
  const root = path.join(project.planningPath, 'whats-next', 'runs');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && /^RUN-/i.test(entry.name))
      .map((entry) => readWhatsNextRun(project, entry.name).catch(() => null)),
  );
  const visible = records.filter(
    (record): record is WhatsNextRunRecord => record !== null,
  );
  const superseded = new Set(
    visible.flatMap((run) =>
      run.replacement?.state === 'applied' ? run.replacement.runIds : [],
    ),
  );
  return visible.filter((run) => !superseded.has(run.runId));
}

const mutationRuntime = globalThis as typeof globalThis & {
  whatsNextMutations?: Map<string, Promise<unknown>>;
};
const mutations = (mutationRuntime.whatsNextMutations ??= new Map());

async function mutateWhatsNext<T>(
  project: RegisteredProject,
  work: () => Promise<T>,
) {
  const previous = mutations.get(project.planningPath) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mutations.set(project.planningPath, next);
  try {
    return await next;
  } finally {
    if (mutations.get(project.planningPath) === next)
      mutations.delete(project.planningPath);
  }
}

function assertNoPendingReplacement(
  runs: WhatsNextRunRecord[],
  sourceIds: string[],
) {
  if (
    runs.some(
      (run) =>
        isPendingReplacement(run) &&
        !['failed', 'canceled'].includes(run.status) &&
        run.sourceNodeIds.some((id) => sourceIds.includes(id)),
    )
  ) {
    throw new Error(
      'Finish, cancel, or review the pending proposal replacement first.',
    );
  }
}

export async function resolveWhatsNextReplacement(
  project: RegisteredProject,
  runId: string,
  action: 'replace-proposal' | 'keep-original',
) {
  return mutateWhatsNext(project, async () => {
    const run = await readWhatsNextRun(project, runId);
    if (run.replacement?.state === 'applied' && action === 'replace-proposal')
      return { run };
    if (!isPendingReplacement(run))
      throw new Error('There is no pending replacement to review.');
    if (['running', 'validating'].includes(run.status))
      throw new Error('Cancel or finish the Run first.');
    if (action === 'keep-original') {
      await trash(whatsNextRunPath(project, runId));
      return { runDeleted: true };
    }
    if (run.result?.outcome !== 'proposal')
      throw new Error(
        'Only a successful proposal can replace the current directions.',
      );
    const nodes = await listTaskGraphNodes(project, GRAPH_ROOT);
    const runs = await readAllWhatsNextRuns(project);
    const current = redoProposalPlan(nodes, runs, run.sourceNodeIds);
    if (
      createHash('sha256').update(current.snapshot).digest('hex') !==
        run.replacement!.snapshot ||
      JSON.stringify(current.runIds) !== JSON.stringify(run.replacement!.runIds)
    )
      throw new Error(
        'The original proposal changed. Keep it and redo from the current state.',
      );
    for (const candidate of run.result.candidates) {
      if (
        candidate.derivedFrom.some((id) => !run.sourceNodeIds.includes(id)) ||
        !candidate.derivedFrom.length
      )
        throw new Error(
          'Replacement directions must belong to the selected origins.',
        );
      if (
        candidate.dependsOn.some((id) => current.candidateIds.includes(id)) ||
        candidate.resources.some((resource) =>
          current.runIds.some((id) =>
            resource.path.startsWith(`whats-next/runs/${id}/`),
          ),
        )
      )
        throw new Error(
          'The replacement still references the old proposal. Keep the original and correct those references.',
        );
    }
    run.replacement!.state = 'applied';
    run.updatedAt = new Date().toISOString();
    await writeRunRecord(project, run);
    try {
      await writeWhatsNextCheckpoint(project, run);
      const paths: string[] = [];
      for (const id of current.runIds) {
        const folder = whatsNextRunPath(project, id);
        try {
          await access(folder);
          paths.push(folder);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (paths.length) await trash(paths);
    } catch {
      run.cleanupWarning =
        'The replacement is active, but post-confirmation cleanup could not complete. Superseded files remain hidden.';
      await writeRunRecord(project, run);
    }
    return { run };
  });
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
  if (!record.result) return;
  const runPath = whatsNextRunPath(project, record.runId);
  const reflectionPath = path.join(runPath, 'reflection.md');
  if (
    !(await access(reflectionPath)
      .then(() => true)
      .catch(() => false))
  ) {
    await writeFile(
      reflectionPath,
      `${record.result.reflection.markdown.trim()}\n`,
      {
        flag: 'wx',
      },
    );
  }
  const responsePath = path.join(runPath, 'response.md');
  const responseMarkdown = renderWhatsNextResponseMarkdown(record.result);
  const existingResponse = await readFile(responsePath, 'utf8').catch(() => '');
  if (existingResponse !== responseMarkdown) {
    const temporaryResponsePath = `${responsePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryResponsePath, responseMarkdown, { flag: 'wx' });
    await rename(temporaryResponsePath, responsePath);
  }
  if (record.result.outcome !== 'proposal') return;
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
      await writeFile(
        outputPath,
        `${(
          candidate.outputMarkdown ?? renderLegacyCandidateMarkdown(candidate)
        ).trim()}\n`,
        {
          flag: 'wx',
        },
      );
    }),
  );
}

async function writeWhatsNextCheckpoint(
  project: RegisteredProject,
  record: WhatsNextRunRecord,
) {
  if (!record.result) return;
  if (!/^SESSION-[0-9a-f-]{36}$/i.test(record.sessionId)) {
    throw new Error("The What's Next Session identifier is invalid.");
  }
  const sessionPath = path.join(
    project.planningPath,
    'whats-next',
    'sessions',
    record.sessionId,
  );
  await mkdir(sessionPath, { recursive: true });
  const activeCandidates = new Map(
    (await collectLatestUnacceptedCandidates(project)).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  if (record.result.outcome === 'proposal') {
    for (const candidate of record.result.candidates) {
      activeCandidates.set(candidate.candidateId, candidate);
    }
  }
  const checkpoint = {
    schemaVersion: 1,
    sessionId: record.sessionId,
    providerSessionId: record.agentSessionId,
    latestRunId: record.runId,
    updatedAt: record.updatedAt,
    sourceNodeIds: record.sourceNodeIds,
    operation: record.operation,
    status: record.status,
    candidateRevisions: Object.fromEntries(
      [...activeCandidates.values()].map((candidate) => [
        candidate.candidateId,
        candidate.revision,
      ]),
    ),
    unresolvedFeedback: [],
    contextIndexPath: `whats-next/runs/${record.runId}/context/index.json`,
    reflectionPath: `whats-next/runs/${record.runId}/reflection.md`,
    responsePath: `whats-next/runs/${record.runId}/response.md`,
  };
  const filePath = path.join(sessionPath, 'checkpoint.json');
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function renderLegacyCandidateMarkdown(candidate: WhatsNextCandidate) {
  const legacyAssumptions = (
    candidate as WhatsNextCandidate & { assumptions?: string[] }
  ).assumptions;
  const assumptions = legacyAssumptions?.length
    ? legacyAssumptions.map((assumption) => `- ${assumption}`).join('\n')
    : '- None';
  return `# ${candidate.title}

${candidate.summary}

## Why this direction

- This direction was generated by the legacy What's Next Harness.
- Review its original Run evidence before accepting or refining it.

## Assumptions

${assumptions}`;
}

function isRunCanceled(record: WhatsNextRunRecord) {
  return record.status === ('canceled' as WhatsNextRunStatus);
}
