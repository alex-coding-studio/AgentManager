import type { TaskGraphNode } from '@/lib/task-graph';
import type { TaskGraphPreview } from '@/lib/task-graph-layout';
import type { HarnessCandidate } from '@/lib/task-decomposition-harness';

const timestamp = '2026-08-28T00:00:00.000Z';

export function createTaskGraphPreview() {
  const nodes = [
    node('NODE-00009001', 'start', 'source', 'Product definition', []),
    node('NODE-00009010', 'node', 'module', 'Context library', [
      'NODE-00009001',
    ]),
    node('NODE-00009011', 'node', 'module', 'Decomposition', ['NODE-00009001']),
    node('NODE-00009012', 'node', 'module', 'Dependency synchronization', [
      'NODE-00009001',
    ]),
    node('NODE-00009013', 'node', 'module', 'Agent transport', [
      'NODE-00009001',
    ]),
    node('NODE-00009020', 'node', 'task', 'Bounded context packet', [
      'NODE-00009010',
    ]),
    node(
      'NODE-00009021',
      'node',
      'task',
      'Candidate generation',
      ['NODE-00009011'],
      ['NODE-00009020'],
    ),
    node(
      'NODE-00009022',
      'node',
      'task',
      'Candidate refinement',
      ['NODE-00009011'],
      ['NODE-00009021'],
    ),
    node(
      'NODE-00009023',
      'node',
      'task',
      'Graph reconciliation',
      ['NODE-00009012'],
      ['NODE-00009021'],
    ),
    node(
      'NODE-00009024',
      'node',
      'task',
      'Agent invocation',
      ['NODE-00009013'],
      ['NODE-00009020'],
    ),
    node(
      'NODE-00009030',
      'node',
      'capability',
      'Formal node promotion',
      ['NODE-00009022', 'NODE-00009023'],
      ['NODE-00009021', 'NODE-00009023'],
    ),
    node(
      'NODE-00009031',
      'node',
      'capability',
      'Dependency readiness',
      ['NODE-00009023'],
      ['NODE-00009030'],
    ),
    node(
      'NODE-00009032',
      'node',
      'capability',
      'Delivery handoff',
      ['NODE-00009024'],
      ['NODE-00009030', 'NODE-00009031'],
    ),
  ];
  const previews: TaskGraphPreview[] = [
    {
      id: 'REQUEST-PREVIEW-NODE-00009022',
      sourceNodeId: 'NODE-00009022',
      instruction: 'Split refinement into independently verifiable steps.',
      inheritedResourceCount: 2,
      additionalResourceCount: 1,
    },
  ];
  return { nodes, previews, sequence: undefined };
}

export function createTaskGraphRefiningPreview() {
  const source = node(
    'NODE-00009001',
    'start',
    'source',
    'Product definition',
    [],
  );
  const first = previewCandidate('CANDIDATE-9001', 1, 'Context boundaries');
  const second = previewCandidate('CANDIDATE-9002', 1, 'Dependency boundaries');
  const running: TaskGraphPreview = {
    ...first,
    kind: 'run',
    type: 'Running',
    status: 'running',
    runId: 'RUN-00000000-0000-4000-8000-000000000031',
    revisionOf: first.id,
  };
  return {
    nodes: [source],
    previews: [first, second],
    sequence: {
      running,
      completed: previewCandidate(first.id, 2, 'Context boundaries'),
    },
  };
}

function previewCandidate(
  candidateId: string,
  revision: number,
  title: string,
): TaskGraphPreview {
  const candidate: HarnessCandidate = {
    candidateId,
    revision,
    type: 'module',
    title,
    summary: `Development preview for ${title}.`,
    derivedFrom: ['NODE-00009001'],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
  };
  return {
    id: candidateId,
    sourceNodeId: 'NODE-00009001',
    instruction: 'Refine this boundary.',
    inheritedResourceCount: 1,
    additionalResourceCount: 0,
    kind: 'candidate',
    title,
    type: candidate.type,
    description: candidate.summary,
    status: 'proposal',
    derivedFrom: candidate.derivedFrom,
    dependsOn: candidate.dependsOn,
    candidate,
    runId: `RUN-${revision}`,
  };
}

function node(
  id: string,
  role: TaskGraphNode['role'],
  type: string,
  title: string,
  derivedFrom: string[],
  dependsOn: string[] = [],
): TaskGraphNode {
  return {
    schemaVersion: 1,
    id,
    role,
    type,
    title,
    summary: `Development preview for ${title}.`,
    status: 'captured',
    createdAt: timestamp,
    updatedAt: timestamp,
    resources: [],
    derivedFrom,
    dependsOn,
    typeTemplateRef: id,
    metadata: {},
  };
}
