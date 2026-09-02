import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileProposalRuns } from '../lib/agent-graph-proposal.ts';

void test('proposal Run reconciliation removes deleted records and replaces changed ones', () => {
  const current = [
    { runId: 'RUN-old', value: 1 },
    { runId: 'RUN-changed', value: 1 },
    { runId: 'RUN-deleted', value: 1 },
  ];
  assert.deepEqual(
    reconcileProposalRuns(current, {
      requestedRunId: 'RUN-changed',
      deletedRunIds: ['RUN-deleted'],
      runs: [{ runId: 'RUN-changed', value: 2 }],
    }),
    [
      { runId: 'RUN-old', value: 1 },
      { runId: 'RUN-changed', value: 2 },
    ],
  );
});

void test('proposal Run reconciliation removes the requested final-Candidate Run', () => {
  assert.deepEqual(
    reconcileProposalRuns([{ runId: 'RUN-only' }], {
      requestedRunId: 'RUN-only',
      runDeleted: true,
    }),
    [],
  );
});
