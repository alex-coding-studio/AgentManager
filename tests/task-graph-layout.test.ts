import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskGraphNode } from '../lib/task-graph.ts';
import { buildTaskGraphLayout } from '../lib/task-graph-layout.ts';

function node(id: string, derivedFrom: string[] = []): TaskGraphNode {
  return {
    schemaVersion: 1,
    id,
    role: derivedFrom.length === 0 ? 'start' : 'node',
    type: derivedFrom.length === 0 ? 'source' : 'module',
    title: id,
    status: 'captured',
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
    resources: [],
    derivedFrom,
    dependsOn: [],
    typeTemplateRef: id,
    metadata: {},
  };
}

void test('builds formal lineage edges from derivedFrom', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-0001'), node('NODE-0002', ['NODE-0001'])],
    [],
  );

  assert.deepEqual(graph.edges, [
    {
      id: 'derived:NODE-0001:NODE-0002',
      source: 'NODE-0001',
      target: 'NODE-0002',
      relation: 'lineage',
    },
  ]);
  assert.ok(position(graph, 'NODE-0002').x > position(graph, 'NODE-0001').x);
});

void test('places each lineage generation in its own column', () => {
  const graph = buildTaskGraphLayout(
    [
      node('NODE-0001'),
      node('NODE-0002', ['NODE-0001']),
      node('NODE-0003', ['NODE-0001']),
      node('NODE-0004', ['NODE-0002']),
    ],
    [],
  );

  const root = position(graph, 'NODE-0001');
  const firstChild = position(graph, 'NODE-0002');
  const secondChild = position(graph, 'NODE-0003');
  const grandchild = position(graph, 'NODE-0004');
  assert.ok(root.x < firstChild.x);
  assert.ok(root.x < secondChild.x);
  assert.ok(firstChild.x < grandchild.x);
  assert.ok(secondChild.x < grandchild.x);
  assert.notEqual(firstChild.x, secondChild.x);
  assert.notEqual(firstChild.y, secondChild.y);
  assert.ok(root.y > Math.min(firstChild.y, secondChild.y));
  assert.ok(root.y < Math.max(firstChild.y, secondChild.y));
});

void test('places a preview beside its source with a temporary edge', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-0001')],
    [
      {
        id: 'REQUEST-PREVIEW-NODE-0001',
        sourceNodeId: 'NODE-0001',
        instruction: 'Split into modules',
        inheritedResourceCount: 1,
        additionalResourceCount: 2,
      },
    ],
  );

  const source = position(graph, 'NODE-0001');
  const preview = position(graph, 'REQUEST-PREVIEW-NODE-0001');
  assert.equal(preview.kind, 'preview');
  assert.deepEqual(preview.derivedFrom, ['NODE-0001']);
  assert.ok(preview.x > source.x);
  assert.equal(graph.edges[0]?.relation, 'request');
});

void test('keeps every sibling lineage edge while one Candidate is refining', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-0001')],
    [
      {
        id: 'CANDIDATE-0001',
        sourceNodeId: 'NODE-0001',
        instruction: 'Refine this direction',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'run',
        status: 'running',
        revisionOf: 'CANDIDATE-0001',
        derivedFrom: ['NODE-0001'],
      },
      {
        id: 'CANDIDATE-0002',
        sourceNodeId: 'NODE-0001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        derivedFrom: ['NODE-0001'],
      },
    ],
  );

  assert.deepEqual(graph.edges.map((edge) => edge.id).sort(), [
    'derived:NODE-0001:CANDIDATE-0001',
    'derived:NODE-0001:CANDIDATE-0002',
  ]);
});

void test('drops lineage edges whose source is not present', () => {
  const graph = buildTaskGraphLayout([node('NODE-0002', ['NODE-9999'])], []);

  assert.deepEqual(graph.edges, []);
});

void test('renders execution dependencies separately from lineage', () => {
  const prerequisite = node('NODE-0002', ['NODE-0001']);
  const dependent = node('NODE-0003', ['NODE-0001']);
  dependent.dependsOn = ['NODE-0002'];

  const graph = buildTaskGraphLayout(
    [node('NODE-0001'), prerequisite, dependent],
    [],
  );

  assert.deepEqual(graph.edges.at(-1), {
    id: 'depends:NODE-0003:NODE-0002',
    source: 'NODE-0003',
    target: 'NODE-0002',
    relation: 'dependency',
  });
});

void test('renders a dependency between Candidates in one proposal', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-0001')],
    [
      {
        id: 'CANDIDATE-0001',
        sourceNodeId: 'NODE-0001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        dependsOn: [],
      },
      {
        id: 'CANDIDATE-0002',
        sourceNodeId: 'NODE-0001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        dependsOn: ['CANDIDATE-0001'],
      },
    ],
  );

  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.id === 'depends:CANDIDATE-0002:CANDIDATE-0001' &&
        edge.relation === 'dependency',
    ),
  );
});

void test('places a request preview without colliding in the target rank', () => {
  const graph = buildTaskGraphLayout(
    [
      node('NODE-0001'),
      node('NODE-0002', ['NODE-0001']),
      node('NODE-0003', ['NODE-0001']),
    ],
    [
      {
        id: 'REQUEST-PREVIEW-NODE-0001',
        sourceNodeId: 'NODE-0001',
        instruction: 'Split into modules',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
      },
    ],
  );

  const preview = position(graph, 'REQUEST-PREVIEW-NODE-0001');
  const firstChild = position(graph, 'NODE-0002');
  const secondChild = position(graph, 'NODE-0003');
  assert.ok(Math.abs(preview.x - firstChild.x) < 60);
  assert.ok(Math.abs(preview.x - secondChild.x) < 60);
  assert.notEqual(preview.y, firstChild.y);
  assert.notEqual(preview.y, secondChild.y);
});

function position(graph: ReturnType<typeof buildTaskGraphLayout>, id: string) {
  const result = graph.nodes.find((candidate) => candidate.id === id);
  assert.ok(result);
  return result;
}
