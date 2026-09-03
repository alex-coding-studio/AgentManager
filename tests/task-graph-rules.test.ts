import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { partitionNodeResources } from '../lib/graph/task/resources.ts';
import {
  assertCanvasCanCreateStartNode,
  assertTaskGraphNodeCanBeDeleted,
  CanvasStartConflictError,
  getTaskGraphRelationships,
  NodeReferencedError,
} from '../lib/graph/task/rules.ts';
import { listTaskGraphNodes } from '../lib/graph/task/model.ts';
import { toggleWhatsNextSelection } from '../lib/modules/product-discovery/selection.ts';

const relationshipNodes = [
  { id: 'NODE-00000001', role: 'start', derivedFrom: [], dependsOn: [] },
  {
    id: 'NODE-00000002',
    role: 'node',
    derivedFrom: ['NODE-00000001'],
    dependsOn: [],
  },
  {
    id: 'NODE-00000003',
    role: 'node',
    derivedFrom: ['NODE-00000001'],
    dependsOn: ['NODE-00000002'],
  },
];

void test('allows the first Start node in a Canvas', () => {
  assert.doesNotThrow(() => assertCanvasCanCreateStartNode([]));
});

void test('rejects a second Start node in the same Canvas', () => {
  assert.throws(
    () => assertCanvasCanCreateStartNode([{ role: 'start' }]),
    CanvasStartConflictError,
  );
});

void test('lists graph relationships in both directions', () => {
  const relationships = getTaskGraphRelationships(
    relationshipNodes,
    'NODE-00000002',
  );

  assert.deepEqual(
    relationships.derivedFrom.map((node) => node.id),
    ['NODE-00000001'],
  );
  assert.deepEqual(
    relationships.dependents.map((node) => node.id),
    ['NODE-00000003'],
  );
  assert.deepEqual(relationships.derivedNodes, []);
});

void test('allows deleting a node that only references upstream nodes', () => {
  assert.doesNotThrow(() =>
    assertTaskGraphNodeCanBeDeleted(relationshipNodes, 'NODE-00000003'),
  );
});

void test('rejects deleting a node referenced through lineage or dependency', () => {
  assert.throws(
    () => assertTaskGraphNodeCanBeDeleted(relationshipNodes, 'NODE-00000001'),
    NodeReferencedError,
  );
  assert.throws(
    () => assertTaskGraphNodeCanBeDeleted(relationshipNodes, 'NODE-00000002'),
    (error: unknown) =>
      error instanceof NodeReferencedError &&
      error.blockerNodeIds.includes('NODE-00000003'),
  );
});
void test('separates a Node output from inherited input Resources', () => {
  const resources = [
    {
      kind: 'output',
      path: 'whats-next/nodes/NODE-00000001/output.md',
    },
    {
      kind: 'output',
      path: 'whats-next/nodes/NODE-00000002/output.md',
    },
    {
      kind: 'context',
      path: 'context/product/project.md',
    },
  ];

  assert.deepEqual(partitionNodeResources('NODE-00000002', resources), {
    inputs: [resources[0], resources[2]],
    outputs: [resources[1]],
  });
});

void test('migrates legacy What’s Next nodes into Discovery without changing identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'praxis-layer-'));
  const planningPath = path.join(root, 'planning');
  const nodeId = 'NODE-abcdef12';
  const nodePath = path.join(planningPath, 'whats-next', 'nodes', nodeId);
  await mkdir(nodePath, { recursive: true });
  const legacy = {
    schemaVersion: 1,
    id: nodeId,
    role: 'node',
    type: 'module',
    title: 'Legacy direction',
    status: 'accepted',
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
    resources: [],
    derivedFrom: [],
    dependsOn: [],
    typeTemplateRef: nodeId,
    metadata: {},
  };
  await writeFile(
    path.join(nodePath, 'node.json'),
    `${JSON.stringify(legacy, null, 2)}\n`,
  );
  const project = {
    id: 'test',
    name: 'Test',
    kind: 'standalone' as const,
    rootPath: root,
    planningPath,
    codePath: null,
    description: '',
    createdAt: legacy.createdAt,
  };
  try {
    const [node] = await listTaskGraphNodes(project, 'whats-next');
    assert.equal(node?.id, nodeId);
    assert.equal(node?.layer, 'discovery');
    assert.equal(node?.artifactKind, 'direction');
    const stored = JSON.parse(
      await readFile(path.join(nodePath, 'node.json'), 'utf8'),
    );
    assert.equal(stored.id, nodeId);
    assert.equal(stored.layer, 'discovery');
    assert.equal(stored.artifactKind, 'direction');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('Source selection is exclusive while ordinary What’s Next nodes support multi-select', () => {
  const nodes = [
    { id: 'source', role: 'start' as const },
    { id: 'one', role: 'node' as const },
    { id: 'two', role: 'node' as const },
  ];
  assert.deepEqual(toggleWhatsNextSelection(nodes, [], 'source'), ['source']);
  assert.deepEqual(toggleWhatsNextSelection(nodes, ['source'], 'one'), ['one']);
  assert.deepEqual(toggleWhatsNextSelection(nodes, ['one'], 'two'), [
    'one',
    'two',
  ]);
  assert.deepEqual(toggleWhatsNextSelection(nodes, ['one', 'two'], 'source'), [
    'source',
  ]);
});
