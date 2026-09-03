import assert from 'node:assert/strict';
import test from 'node:test';
import {
  successfulRecomposeOutputCandidateIds,
  successfulRecomposeSupersededCandidateIds,
  validateAgentGraphRecomposeDependencies,
  validateAgentGraphRecomposePlan,
} from '../lib/graph/agent/recompose.ts';

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

void test('rejects retained Candidates that depend on removed working-set members', () => {
  assert.throws(
    () =>
      validateAgentGraphRecomposeDependencies({
        selectedIds: ['A', 'B'],
        retainedIds: ['B'],
        outputCandidates: [],
        knownCandidates: [
          { candidateId: 'A', dependsOn: [] },
          { candidateId: 'B', dependsOn: ['A'] },
        ],
      }),
    /Candidate B depends on a replaced or removed Candidate/,
  );
});

void test('only successful Recompose proposals supersede the previous working set', () => {
  const runs = [
    {
      operation: 'recompose-candidates',
      status: 'failed',
      recomposeCandidateIds: ['A', 'B'],
    },
    {
      operation: 'recompose-candidates',
      status: 'proposal',
      recomposeCandidateIds: ['D', 'E'],
      result: {
        outcome: 'proposal',
        recomposition: {
          effects: [{ kind: 'merge' as const, from: ['D', 'E'], to: ['F'] }],
        },
      },
    },
    {
      operation: 'recompose-candidates',
      status: 'no-change',
      recomposeCandidateIds: ['G', 'H'],
      result: {
        outcome: 'proposal',
        recomposition: {
          effects: [{ kind: 'merge' as const, from: ['G', 'H'], to: ['I'] }],
        },
      },
    },
  ];
  assert.deepEqual(
    [...successfulRecomposeSupersededCandidateIds(runs)],
    ['D', 'E'],
  );
});

void test('successful Recompose output membership includes retained and new Candidate identities', () => {
  const runs = [
    {
      operation: 'recompose-candidates',
      status: 'proposal',
      recomposeCandidateIds: ['A', 'B'],
      result: {
        outcome: 'proposal',
        candidates: [{ candidateId: 'C' }],
        recomposition: {
          effects: [
            { kind: 'retain' as const, from: ['A'], to: ['A'] },
            { kind: 'replace' as const, from: ['B'], to: ['C'] },
          ],
        },
      },
    },
  ];
  assert.deepEqual(
    [...successfulRecomposeOutputCandidateIds(runs)],
    ['C', 'A'],
  );
});
