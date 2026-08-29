import type { TaskGraphNode } from '@/lib/task-graph';
import type { TaskGraphPreview } from '@/lib/task-graph-layout';

const timestamp = '2026-08-28T00:00:00.000Z';

export function createTaskGraphPreview() {
  const nodes = [
    node('NODE-9001', 'start', 'source', 'Product definition', []),
    node('NODE-9010', 'node', 'module', 'Context library', ['NODE-9001']),
    node('NODE-9011', 'node', 'module', 'Task decomposition', ['NODE-9001']),
    node('NODE-9012', 'node', 'module', 'Dependency synchronization', [
      'NODE-9001',
    ]),
    node('NODE-9013', 'node', 'module', 'Agent transport', ['NODE-9001']),
    node('NODE-9020', 'node', 'task', 'Bounded context packet', ['NODE-9010']),
    node(
      'NODE-9021',
      'node',
      'task',
      'Candidate generation',
      ['NODE-9011'],
      ['NODE-9020'],
    ),
    node(
      'NODE-9022',
      'node',
      'task',
      'Candidate refinement',
      ['NODE-9011'],
      ['NODE-9021'],
    ),
    node(
      'NODE-9023',
      'node',
      'task',
      'Graph reconciliation',
      ['NODE-9012'],
      ['NODE-9021'],
    ),
    node(
      'NODE-9024',
      'node',
      'task',
      'Agent invocation',
      ['NODE-9013'],
      ['NODE-9020'],
    ),
    node(
      'NODE-9030',
      'node',
      'capability',
      'Formal node promotion',
      ['NODE-9022', 'NODE-9023'],
      ['NODE-9021', 'NODE-9023'],
    ),
    node(
      'NODE-9031',
      'node',
      'capability',
      'Dependency readiness',
      ['NODE-9023'],
      ['NODE-9030'],
    ),
    node(
      'NODE-9032',
      'node',
      'capability',
      'Delivery handoff',
      ['NODE-9024'],
      ['NODE-9030', 'NODE-9031'],
    ),
  ];
  const previews: TaskGraphPreview[] = [
    {
      id: 'REQUEST-PREVIEW-NODE-9022',
      sourceNodeId: 'NODE-9022',
      instruction: 'Split refinement into independently verifiable steps.',
      inheritedResourceCount: 2,
      additionalResourceCount: 1,
    },
  ];
  return { nodes, previews };
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
