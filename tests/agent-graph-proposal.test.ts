import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeLatestCandidatePreview,
  proposalFocusNodeIds,
  reconcileProposalRuns,
} from '../lib/agent-graph-proposal.ts';
import { titleFromAgentGraphIdea } from '../lib/agent-graph-source.ts';
import { readAgentGraphInputPacket } from '../lib/agent-graph-input.ts';

void test('Agent Graph Sources derive a display title without losing the full idea', () => {
  const idea =
    '# Organize a real home\n\nKeep the complete prompt as evidence.';
  assert.equal(titleFromAgentGraphIdea(idea), 'Organize a real home');
  assert.match(idea, /complete prompt/);
});

void test('the standard submission accepts long User Input before packaging', () => {
  const form = new FormData();
  const userInput = `Define the Item lifecycle.\n\n${'x'.repeat(25_000)}`;
  form.set('instruction', userInput);
  form.set('agent', 'codex');
  form.set('model', 'gpt-5.6-luna');
  form.set('effort', 'high');
  form.append('contextRefs', 'context/Product/item.md');
  form.append(
    'files',
    new File(['# Rules'], 'rules.md', { type: 'text/markdown' }),
  );
  const input = readAgentGraphInputPacket(form);
  assert.equal(input.instruction, userInput);
  assert.deepEqual(input.contextRefs, ['context/Product/item.md']);
  assert.equal(input.files[0]?.name, 'rules.md');
  assert.deepEqual(input.profile, {
    agent: 'codex',
    model: 'gpt-5.6-luna',
    effort: 'high',
  });
  assert.equal(input.files[0]?.size, 7);
});

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

void test('proposal Run reconciliation preserves chronological positions', () => {
  assert.deepEqual(
    reconcileProposalRuns(
      [
        { runId: 'RUN-old', value: 1 },
        { runId: 'RUN-new', value: 1 },
      ],
      {
        requestedRunId: 'RUN-old',
        runs: [{ runId: 'RUN-old', value: 2 }],
      },
    ),
    [
      { runId: 'RUN-old', value: 2 },
      { runId: 'RUN-new', value: 1 },
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

void test('first-render Candidate recovery keeps the newest revision', () => {
  const old = {
    id: 'CANDIDATE-one',
    startedAt: '2026-09-01T00:00:00.000Z',
    candidate: { revision: 1 },
  };
  const revised = {
    id: 'CANDIDATE-one',
    startedAt: '2026-09-02T00:00:00.000Z',
    candidate: { revision: 2 },
  };
  assert.deepEqual(
    mergeLatestCandidatePreview(mergeLatestCandidatePreview([], revised), old),
    [revised],
  );
});

void test('proposal focus includes all append Runs and projects hidden origins', () => {
  assert.deepEqual(
    proposalFocusNodeIds(
      [
        {
          id: 'CANDIDATE-one',
          sourceNodeId: 'NODE-hidden',
          derivedFrom: ['NODE-hidden'],
        },
        {
          id: 'CANDIDATE-two',
          sourceNodeId: 'NODE-visible',
          derivedFrom: ['NODE-visible'],
        },
      ],
      {
        visibleNodeIds: new Set(['NODE-visible']),
        projectedRootId: 'NODE-source',
      },
    ),
    ['NODE-source', 'CANDIDATE-one', 'NODE-visible', 'CANDIDATE-two'],
  );
});
