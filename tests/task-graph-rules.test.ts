import assert from 'node:assert/strict';
import test from 'node:test';
import { partitionNodeResources } from '../lib/task-graph-resources.ts';
import {
  assertCanvasCanCreateStartNode,
  assertTaskGraphNodeCanBeDeleted,
  CanvasStartConflictError,
  getTaskGraphRelationships,
  NodeReferencedError,
} from '../lib/task-graph-rules.ts';

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
