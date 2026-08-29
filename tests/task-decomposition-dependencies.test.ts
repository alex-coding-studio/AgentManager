import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateDependencyBlockers,
  resolveCandidateDependencies,
} from '../lib/task-decomposition-dependencies.ts';

const nodes = [
  { id: 'NODE-0001' },
  {
    id: 'NODE-0002',
    provenance: { candidateId: 'CANDIDATE-0001' },
  },
];

void test('maps accepted Candidate dependencies to formal Node identifiers', () => {
  assert.deepEqual(
    resolveCandidateDependencies(
      'CANDIDATE-0002',
      ['NODE-0001', 'CANDIDATE-0001'],
      nodes,
    ),
    ['NODE-0001', 'NODE-0002'],
  );
});

void test('requires Candidate dependencies to be accepted first', () => {
  assert.throws(
    () =>
      resolveCandidateDependencies('CANDIDATE-0003', ['CANDIDATE-0002'], nodes),
    /Accept CANDIDATE-0002 before accepting CANDIDATE-0003/,
  );
});

void test('finds unaccepted Candidates that block a discard', () => {
  assert.deepEqual(
    candidateDependencyBlockers('CANDIDATE-0001', [
      { candidateId: 'CANDIDATE-0001', dependsOn: [] },
      { candidateId: 'CANDIDATE-0002', dependsOn: ['CANDIDATE-0001'] },
      { candidateId: 'CANDIDATE-0003', dependsOn: ['NODE-0001'] },
    ]),
    ['CANDIDATE-0002'],
  );
});
