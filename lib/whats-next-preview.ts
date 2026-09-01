import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_REVISION,
  type WhatsNextCandidate,
} from '@/lib/whats-next-harness';
import type { WhatsNextRunRecord } from '@/lib/whats-next-runs';
import type { TaskGraphNode } from '@/lib/task-graph';

const timestamp = '2026-08-29T00:00:00.000Z';
const runId = 'RUN-00000000-0000-4000-8000-000000000022';
const refineRunId = 'RUN-00000000-0000-4000-8000-000000000023';
const sessionId = 'SESSION-00000000-0000-4000-8000-000000000022';

export function createWhatsNextRedoPreview() {
  const original = createWhatsNextReviewPreview();
  const before = original.runs[0]!;
  if (before.result?.outcome !== 'proposal')
    throw new Error('Proposal fixture is missing.');
  const replacement: WhatsNextRunRecord = {
    ...structuredClone(before),
    runId: 'RUN-00000000-0000-4000-8000-000000000028',
    startedAt: '2026-08-29T00:01:00.000Z',
    replacement: {
      state: 'applied',
      candidateIds: before.result.candidates.map(
        (candidate) => candidate.candidateId,
      ),
      runIds: [before.runId],
    },
    result: {
      ...structuredClone(before.result),
      candidates: before.result.candidates.map((candidate, index) => ({
        ...candidate,
        candidateId: `CANDIDATE-abcdef0${index}`,
        dependsOn: index === 0 ? [] : ['CANDIDATE-abcdef00'],
        title: `Corrected direction ${index + 1}`,
        outputMarkdown: `# Corrected direction ${index + 1}\n\n${candidate.outputMarkdown}`,
      })),
    },
  };
  return {
    ...original,
    runs: [before],
    transitionRun: { ...replacement, status: 'running' as const, result: null },
    completionRun: replacement,
  };
}

export function createWhatsNextReviewPreview() {
  const start: TaskGraphNode = {
    schemaVersion: 1,
    id: 'NODE-00009001',
    role: 'start',
    type: 'source',
    title: 'Build a local AgentManager for one developer',
    summary:
      'Explore a local-first product that helps one developer shape, decompose, and deliver work with coding agents.',
    status: 'captured',
    createdAt: timestamp,
    updatedAt: timestamp,
    resources: [],
    derivedFrom: [],
    dependsOn: [],
    typeTemplateRef: 'NODE-00009001',
    metadata: {},
  };
  const candidates = [
    candidate(
      'CANDIDATE-9001',
      'Task Decomposition',
      'Turn dense product context into coherent pieces a person can understand and continue from.',
      [],
      `# Task Decomposition

Turn dense product context into coherent pieces a person can understand and continue from.

## Why this direction

- The current product idea contains several useful capabilities but is difficult to operate on as one document.
- The user repeatedly emphasized controlling how much Context a person must understand at one time.
- A visual decomposition graph makes each accepted boundary inspectable without forcing implementation detail too early.

## Assumptions

- The original product meaning should remain intact while its working resolution changes.`,
    ),
    candidate(
      'CANDIDATE-9002',
      'Implementation Workspace',
      'Turn an accepted product direction into reviewable delivery slices without polluting the product graph with PR state.',
      ['CANDIDATE-9001'],
      `# Implementation Workspace

Turn an accepted product direction into reviewable delivery slices without polluting the product graph with PR state.

## Why this direction

- A concrete product Card may already be feasible enough to implement directly.
- Delivery still needs inputs, outputs, acceptance gates, and pull-request evidence at a finer working resolution.
- Keeping that mutable execution state outside the product graph preserves the accepted meaning of Formal Nodes.

## Assumptions

- Implementation may start from What's Next or Decomposition rather than one mandatory pipeline.`,
    ),
  ];
  const run: WhatsNextRunRecord = {
    schemaVersion: 1,
    runId,
    sessionId,
    requestId: 'REQUEST-00000000-0000-4000-8000-000000000022',
    agentSessionId: 'preview-agent-session',
    agentSessionMode: 'persistent',
    sourceNodeIds: [start.id],
    operation: 'explore',
    intention: 'mvp-exploration',
    motion: 'diverge',
    status: 'proposal',
    transport: 'codex-cli',
    harness: {
      id: WHATS_NEXT_HARNESS_ID,
      revision: WHATS_NEXT_HARNESS_REVISION,
    },
    input: {
      instruction: 'Explore the most immediate product value.',
      projectInstructions: '',
      resourcePaths: [],
      feedback: [],
      requestArtifact: 'request.json',
      intention: 'mvp-exploration',
      motion: 'diverge',
    },
    inputFingerprint: 'preview-input-fingerprint',
    startedAt: timestamp,
    updatedAt: timestamp,
    endedAt: timestamp,
    usage: null,
    result: {
      schemaVersion: 1,
      harness: {
        id: WHATS_NEXT_HARNESS_ID,
        revision: WHATS_NEXT_HARNESS_REVISION,
      },
      request: {
        sessionId,
        requestId: 'REQUEST-00000000-0000-4000-8000-000000000022',
        inputFingerprint: 'preview-input-fingerprint',
      },
      reflection: {
        markdown: `# Reflection

The strongest immediate need is not a complete project-management system. It is a way to turn a large, AI-generated product idea into meaning that one person can understand, challenge, and continue from.

Task Decomposition addresses that first pain directly. An Implementation Workspace becomes adjacent once an accepted direction needs to be tested in real delivery without mixing pull-request state into the product graph.`,
        continuationAdvice: {
          action: 'continue',
          recommendedFocus: 'concretize',
          reason:
            'The relationship between product exploration and execution is concrete enough to explore one level further.',
        },
      },
      exploration: {
        consideredNodeIds: [start.id],
        notes: [
          'The preview uses the selected Start only and introduces no external evidence.',
        ],
      },
      outcome: 'proposal',
      candidates,
    },
    error: null,
  };
  const refinedCandidate: WhatsNextCandidate = {
    ...candidates[0]!,
    revision: 2,
    summary:
      'Reduce how much product Context one person must understand at a time while preserving the accepted meaning.',
    outputMarkdown: `# Task Decomposition

Reduce how much product Context one person must understand at a time while preserving the accepted meaning.

## Why this direction

- The current product idea contains several useful capabilities but is difficult to operate on as one document.
- The user clarified that the primary value is controlling cognitive Context rather than generating smaller tasks for its own sake.
- A visual decomposition graph makes each accepted boundary inspectable without forcing implementation detail too early.

## Assumptions

- The original product meaning should remain intact while its working resolution changes.`,
  };
  const refinedRun: WhatsNextRunRecord = {
    ...run,
    runId: refineRunId,
    requestId: 'REQUEST-00000000-0000-4000-8000-000000000023',
    operation: 'refine-candidate',
    parentRunId: runId,
    revisionOf: refinedCandidate.candidateId,
    startedAt: '2026-08-29T00:05:00.000Z',
    updatedAt: '2026-08-29T00:05:00.000Z',
    endedAt: '2026-08-29T00:05:00.000Z',
    input: {
      ...run.input!,
      instruction:
        'Emphasize cognitive Context rather than task count as the primary value.',
    },
    result: {
      ...run.result!,
      request: {
        sessionId,
        requestId: 'REQUEST-00000000-0000-4000-8000-000000000023',
        inputFingerprint: 'preview-refine-input-fingerprint',
      },
      reflection: {
        markdown: `# Reflection

The direction remains useful, but its center has shifted. The value is not producing smaller tasks for its own sake; it is controlling how much product Context one person must understand at a time.`,
        continuationAdvice: {
          action: 'consider-closing',
          recommendedFocus: 'close',
          reason:
            'The product meaning is now concrete enough to accept, decompose further, or implement.',
        },
      },
      outcome: 'proposal',
      candidates: [refinedCandidate],
    },
  };
  return {
    nodes: [start],
    runs: [run, refinedRun],
    transitionRun: undefined,
    completionRun: undefined,
  };
}

export function createWhatsNextRefiningPreview() {
  const preview = createWhatsNextReviewPreview();
  const refinement = preview.runs[1]!;
  return {
    nodes: preview.nodes,
    runs: [preview.runs[0]!],
    transitionRun: {
      ...refinement,
      status: 'running' as const,
      endedAt: null,
      result: null,
    },
    completionRun: refinement,
  };
}

function candidate(
  candidateId: string,
  title: string,
  summary: string,
  dependsOn: string[],
  outputMarkdown: string,
): WhatsNextCandidate {
  return {
    candidateId,
    revision: 1,
    type: 'module',
    layer: 'discovery',
    artifactKind: 'mvp',
    title,
    summary,
    derivedFrom: ['NODE-00009001'],
    dependsOn,
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: previewAssumptions(outputMarkdown),
    outputMarkdown,
  };
}

function previewAssumptions(markdown: string) {
  const section = markdown.split('## Assumptions')[1] ?? '';
  return section
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter((line) => line && line.toLowerCase() !== 'none');
}
