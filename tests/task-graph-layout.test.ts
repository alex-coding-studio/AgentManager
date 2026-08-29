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
      temporary: false,
    },
  ]);
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

  assert.deepEqual(graph.nodes[1], {
    id: 'REQUEST-PREVIEW-NODE-0001',
    kind: 'preview',
    x: 360,
    y: 0,
    derivedFrom: ['NODE-0001'],
  });
  assert.equal(graph.edges[0]?.temporary, true);
});

void test('drops lineage edges whose source is not present', () => {
  const graph = buildTaskGraphLayout([node('NODE-0002', ['NODE-9999'])], []);

  assert.deepEqual(graph.edges, []);
});
