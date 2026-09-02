import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgentGraphRecomposePlan } from '../lib/agent-graph-recompose.ts';

void test('accepts one complete N-to-M Recompose plan', () => {
  assert.doesNotThrow(() =>
    validateAgentGraphRecomposePlan({
      selectedIds: ['A', 'B', 'C', 'D'],
      outputIds: ['A', 'E', 'F', 'G'],
      effects: [
        { kind: 'retain', from: ['A'], to: ['A'] },
        { kind: 'merge', from: ['B', 'C'], to: ['E'] },
        { kind: 'split', from: ['D'], to: ['F', 'G'] },
      ],
    }),
  );
});

void test('requires every selected and output Candidate to participate exactly once', () => {
  assert.throws(
    () =>
      validateAgentGraphRecomposePlan({
        selectedIds: ['A', 'B'],
        outputIds: ['C'],
        effects: [{ kind: 'replace', from: ['A'], to: ['C'] }],
      }),
    /Selected Candidate B must have exactly one effect/,
  );
  assert.throws(
    () =>
      validateAgentGraphRecomposePlan({
        selectedIds: ['A'],
        outputIds: ['B', 'C'],
        effects: [{ kind: 'replace', from: ['A'], to: ['B'] }],
      }),
    /Output Candidate C must have exactly one effect/,
  );
});

void test('rejects illegal effect shapes and references outside the working set', () => {
  assert.throws(
    () =>
      validateAgentGraphRecomposePlan({
        selectedIds: ['A'],
        outputIds: ['B'],
        effects: [{ kind: 'merge', from: ['A'], to: ['B'] }],
      }),
    /Invalid merge Recompose effect shape/,
  );
  assert.throws(
    () =>
      validateAgentGraphRecomposePlan({
        selectedIds: ['A'],
        outputIds: ['B'],
        effects: [{ kind: 'replace', from: ['X'], to: ['B'] }],
      }),
    /unselected Candidate X/,
  );
});

void test('supports explicit removal and requires retain to preserve identity', () => {
  assert.doesNotThrow(() =>
    validateAgentGraphRecomposePlan({
      selectedIds: ['A'],
      outputIds: [],
      effects: [{ kind: 'remove', from: ['A'], to: [] }],
    }),
  );
  assert.throws(
    () =>
      validateAgentGraphRecomposePlan({
        selectedIds: ['A'],
        outputIds: ['B'],
        effects: [{ kind: 'retain', from: ['A'], to: ['B'] }],
      }),
    /Invalid retain Recompose effect shape/,
  );
});
