import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoalPickerGraph,
  GOAL_PICKER_WIDTH,
  GOAL_PICKER_HEIGHT,
  type GoalPickerEntry,
} from '../lib/goal-picker-graph.ts';

function entry(
  n: number,
  patch: Partial<GoalPickerEntry> = {},
): GoalPickerEntry {
  const suffix = n.toString(16).padStart(8, '0');
  return {
    module: 'task-graph',
    uid: `00000000-0000-4000-8000-0000${suffix}`,
    id: `NODE-${suffix}`,
    title: `Task ${n}`,
    summary: '',
    dependsOn: [],
    derivedFrom: [],
    outputPaths: [],
    executionStatus: 'not-started',
    ...patch,
  };
}
function x(graph: ReturnType<typeof buildGoalPickerGraph>, n: number) {
  return graph.nodes.find((node) => node.entry.uid === entry(n).uid)!.x;
}

void test('two prerequisites precede their dependent, resolving aliases and UUIDs', () => {
  const graph = buildGoalPickerGraph(
    [entry(1), entry(2), entry(3, { dependsOn: [entry(1).id, entry(2).uid] })],
    'task-graph',
  );
  assert.ok(x(graph, 1) < x(graph, 3));
  assert.ok(x(graph, 2) < x(graph, 3));
  assert.equal(
    graph.edges.filter((edge) => edge.kind === 'dependency').length,
    2,
  );
  assert.equal(graph.unresolvedDependencies, 0);
  assert.equal(graph.dependencyCycle, false);
});

void test('decomposition is compacted leaf-first without inventing execution dependencies', () => {
  const graph = buildGoalPickerGraph(
    [
      entry(1),
      entry(2, { derivedFrom: [entry(1).uid] }),
      entry(3, { derivedFrom: [entry(2).id] }),
      entry(4, { derivedFrom: [entry(3).uid] }),
    ],
    'task-graph',
  );
  assert.ok(
    x(graph, 4) < x(graph, 3) &&
      x(graph, 3) < x(graph, 2) &&
      x(graph, 2) < x(graph, 1),
  );
  assert.ok(graph.edges.every((edge) => edge.kind === 'lineage'));
});

void test('real dependency order wins when reversed lineage would contradict it', () => {
  const graph = buildGoalPickerGraph(
    [
      entry(1),
      entry(2, { derivedFrom: [entry(1).uid], dependsOn: [entry(1).uid] }),
    ],
    'task-graph',
  );
  assert.ok(x(graph, 1) < x(graph, 2));
  assert.equal(graph.dependencyCycle, false);
  assert.equal(graph.edges.filter((edge) => edge.kind === 'lineage').length, 1);
  assert.equal(
    graph.edges.filter((edge) => edge.kind === 'dependency').length,
    1,
  );
});

void test('module tabs never mix source graphs and retain disconnected unfinished Nodes', () => {
  const graph = buildGoalPickerGraph(
    [entry(1), entry(2), entry(3, { module: 'whats-next' })],
    'task-graph',
  );
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 0);
  assert.equal(
    buildGoalPickerGraph([entry(3, { module: 'whats-next' })], 'task-graph')
      .nodes.length,
    0,
  );
});

void test('only execution-completed entries are excluded; finalized Plans remain unfinished goals', () => {
  const graph = buildGoalPickerGraph(
    [
      entry(1, { executionStatus: 'completed' }),
      entry(2, { executionStatus: 'plan-ready', dependsOn: [entry(1).id] }),
      entry(3, { executionStatus: 'added' }),
    ],
    'task-graph',
  );
  assert.deepEqual(
    new Set(graph.nodes.map((node) => node.entry.uid)),
    new Set([entry(2).uid, entry(3).uid]),
  );
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.unresolvedDependencies, 0);
});

void test('missing dependencies and cycles are explicit rather than fabricated or silently reordered', () => {
  const graph = buildGoalPickerGraph(
    [
      entry(1, { dependsOn: [entry(2).id, 'missing', 'missing'] }),
      entry(2, { dependsOn: [entry(1).id] }),
    ],
    'task-graph',
  );
  assert.equal(graph.unresolvedDependencies, 1);
  assert.equal(graph.dependencyCycle, true);
  assert.equal(graph.edges.length, 2);
  assert.ok(
    graph.nodes.every(
      (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
    ),
  );
});

void test('duplicate reference forms do not create duplicate edges', () => {
  const graph = buildGoalPickerGraph(
    [entry(1), entry(2, { dependsOn: [entry(1).id, entry(1).uid] })],
    'task-graph',
  );
  assert.equal(graph.edges.length, 1);
});

void test('multi-level fork/join layout is stable under input reordering and planning status changes', () => {
  const entries = Array.from({ length: 18 }, (_, index) =>
    entry(index + 1, {
      derivedFrom: index > 0 ? [entry(Math.ceil(index / 3)).uid] : [],
      dependsOn: index > 8 ? [entry(index - 5).uid, entry(index - 7).id] : [],
    }),
  );
  const initial = buildGoalPickerGraph(entries, 'task-graph');
  const updated = buildGoalPickerGraph(
    [...entries]
      .reverse()
      .map((item) => ({ ...item, executionStatus: 'plan-ready' })),
    'task-graph',
  );
  const positions = (graph: typeof initial) =>
    graph.nodes.map(({ entry: item, x, y }) => ({ id: item.uid, x, y }));
  assert.deepEqual(positions(initial), positions(updated));
  for (let i = 0; i < initial.nodes.length; i++)
    for (let j = i + 1; j < initial.nodes.length; j++) {
      const a = initial.nodes[i],
        b = initial.nodes[j];
      assert.ok(
        a.x + GOAL_PICKER_WIDTH <= b.x ||
          b.x + GOAL_PICKER_WIDTH <= a.x ||
          a.y + GOAL_PICKER_HEIGHT <= b.y ||
          b.y + GOAL_PICKER_HEIGHT <= a.y,
      );
    }
});
