import assert from 'node:assert/strict';
import test from 'node:test';
import { cardResourceCounts } from '../lib/graph/task/resources.ts';
import { graphFocus, directDependencyCount } from '../lib/graph/task/focus.ts';
import type { TaskGraphNode } from '../lib/graph/task/model.ts';
import type {
  TaskGraphPreview,
  TaskGraphLayoutEdge,
} from '../lib/graph/task/layout.ts';

void test('formal cards distinguish upstream input documents from their own output', () => {
  const node = {
    id: 'NODE-12345678',
    resources: [
      { kind: 'output', path: 'whats-next/nodes/NODE-87654321/output.md' },
      { kind: 'output', path: 'whats-next/nodes/NODE-12345678/output.md' },
    ],
  } as TaskGraphNode;
  assert.deepEqual(cardResourceCounts(node), { inputCount: 1, outputCount: 1 });
});

void test('formal Delivery Contracts recognize their own output Markdown', () => {
  const node = {
    id: 'NODE-abcdef12',
    resources: [
      {
        kind: 'output',
        path: 'what-to-do/runs/RUN-11111111-2222-4333-8444-555555555555/contracts/NODE-abcdef12/output.md',
      },
    ],
  } as TaskGraphNode;
  assert.deepEqual(cardResourceCounts(node), {
    inputCount: 0,
    outputCount: 1,
  });
});

void test('Candidate and refining cards count unique inputs plus the existing generated output', () => {
  const preview = {
    kind: 'candidate',
    candidate: {
      resources: [
        { kind: 'context', path: 'context/product.md' },
        { kind: 'context', path: 'context/product.md' },
      ],
    },
  } as TaskGraphPreview;
  assert.deepEqual(cardResourceCounts(undefined, preview), {
    inputCount: 1,
    outputCount: 1,
  });
  assert.deepEqual(cardResourceCounts(undefined, { ...preview, kind: 'run' }), {
    inputCount: 1,
    outputCount: 1,
  });
});

void test('new loading cards show inputs without inventing an output', () => {
  assert.deepEqual(
    cardResourceCounts(undefined, {
      kind: 'run',
      inheritedResourceCount: 2,
      additionalResourceCount: 1,
    } as TaskGraphPreview),
    { inputCount: 3, outputCount: 0 },
  );
});

const edges: TaskGraphLayoutEdge[] = [
  { id: 'parent', source: 'parent', target: 'selected', relation: 'lineage' },
  { id: 'child', source: 'selected', target: 'child', relation: 'lineage' },
  {
    id: 'dependency',
    source: 'selected',
    target: 'required',
    relation: 'dependency',
  },
  {
    id: 'unrelated',
    source: 'other',
    target: 'elsewhere',
    relation: 'dependency',
  },
];

void test('card focus includes both lineage and direct dependency neighbors', () => {
  assert.deepEqual([...graphFocus(edges, 'selected').nodeIds].sort(), [
    'child',
    'parent',
    'required',
    'selected',
  ]);
  assert.equal(graphFocus(edges, 'selected').edgeIds.size, 3);
});

void test('one dependency button highlights exactly its two endpoints and one edge', () => {
  assert.equal(directDependencyCount(edges, 'selected'), 1);
  const focus = graphFocus(edges, 'selected', true);
  assert.deepEqual([...focus.nodeIds].sort(), ['required', 'selected']);
  assert.deepEqual([...focus.edgeIds], ['dependency']);
});

void test('dependency focus works from either endpoint and excludes parent-child counts', () => {
  assert.equal(directDependencyCount(edges, 'parent'), 0);
  assert.equal(directDependencyCount(edges, 'required'), 1);
  assert.deepEqual([...graphFocus(edges, 'required', true).nodeIds].sort(), [
    'required',
    'selected',
  ]);
});
