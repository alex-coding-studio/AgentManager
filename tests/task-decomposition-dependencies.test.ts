import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateDependencyBlockers,
  resolveCandidateDependencies,
  unresolvedCandidateDependencies,
} from '../lib/task-decomposition-dependencies.ts';
import { PublicApiError } from '../lib/api-errors.ts';

const nodes = [
  { id: 'NODE-00000001' },
  {
    id: 'NODE-00000002',
    provenance: { candidateId: 'CANDIDATE-0001' },
  },
];

void test('maps accepted Candidate dependencies to formal Node identifiers', () => {
  assert.deepEqual(
    resolveCandidateDependencies(
      'CANDIDATE-0002',
      ['NODE-00000001', 'CANDIDATE-0001'],
      nodes,
    ),
    ['NODE-00000001', 'NODE-00000002'],
  );
});

void test('requires Candidate dependencies to be accepted first', () => {
  assert.throws(
    () =>
      resolveCandidateDependencies('CANDIDATE-0003', ['CANDIDATE-0002'], nodes),
    (error: unknown) => {
      assert.ok(error instanceof PublicApiError);
      assert.equal(error.status, 409);
      assert.equal(
        error.message,
        'Accept CANDIDATE-0002 before accepting CANDIDATE-0003.',
      );
      return true;
    },
  );
});

void test('identifies only dependencies that still prevent acceptance', () => {
  assert.deepEqual(
    unresolvedCandidateDependencies(
      ['NODE-00000001', 'CANDIDATE-0001', 'CANDIDATE-0002'],
      nodes,
    ),
    ['CANDIDATE-0002'],
  );
});

void test('finds unaccepted Candidates that block a discard', () => {
  assert.deepEqual(
    candidateDependencyBlockers('CANDIDATE-0001', [
      { candidateId: 'CANDIDATE-0001', dependsOn: [] },
      { candidateId: 'CANDIDATE-0002', dependsOn: ['CANDIDATE-0001'] },
      { candidateId: 'CANDIDATE-0003', dependsOn: ['NODE-00000001'] },
    ]),
    ['CANDIDATE-0002'],
  );
});
