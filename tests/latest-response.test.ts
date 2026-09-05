import assert from 'node:assert/strict';
import test from 'node:test';
import type { WhatsNextRunRecord } from '../lib/modules/product-discovery/runs.ts';
import type { TaskDecompositionRunRecord } from '../lib/modules/scope-decomposition/runs.ts';
import {
  latestTaskDecompositionResponse,
  latestTerminalTaskDecompositionRun,
  latestWhatsNextResponse,
} from '../lib/latest-response.ts';

function run(
  status: WhatsNextRunRecord['status'],
  result: WhatsNextRunRecord['result'] = null,
  error: string | null = null,
) {
  return { status, result, error } as WhatsNextRunRecord;
}

void test('ordinary proposal and no-change responses are Completed', () => {
  const proposal = latestWhatsNextResponse(
    run('proposal', {
      outcome: 'proposal',
      reflection: {
        markdown: '# Reflection\n\nA useful direction.',
        continuationAdvice: {
          action: 'continue',
          recommendedFocus: 'expand',
          reason: 'Continue.',
        },
      },
      candidates: [],
    } as never),
  );
  assert.deepEqual(proposal, {
    tone: 'completed',
    attention: 'none',
    statusLabel: 'Continue',
    summary: 'A useful direction.',
    icon: 'success',
  });

  const noChange = latestWhatsNextResponse(
    run('no-change', {
      outcome: 'no-change',
      reason: 'Already covered.',
    } as never),
  );
  assert.equal(noChange.tone, 'completed');
  assert.equal(noChange.statusLabel, 'No change');
  assert.equal(noChange.summary, 'Already covered.');
});

void test('clarification requires attention without becoming an error', () => {
  const presentation = latestWhatsNextResponse(
    run('clarification', {
      outcome: 'clarification',
      clarification: { question: 'Which behavior should win?' },
    } as never),
  );
  assert.equal(presentation.tone, 'warning');
  assert.equal(presentation.attention, 'action-required');
  assert.equal(presentation.statusLabel, 'Answer needed');
  assert.equal(presentation.icon, 'warning');
});

void test('failure is Fail while cancellation is a Warning', () => {
  const failed = latestWhatsNextResponse(
    run('failed', null, 'The response was invalid.'),
  );
  assert.equal(failed.tone, 'fail');
  assert.equal(failed.attention, 'action-required');
  assert.equal(failed.summary, 'The response was invalid.');

  const canceled = latestWhatsNextResponse(run('canceled'));
  assert.equal(canceled.tone, 'warning');
  assert.equal(canceled.attention, 'none');
  assert.equal(canceled.statusLabel, 'Canceled');
  assert.equal(canceled.icon, 'warning');
});

void test('decomposition outcomes use the shared response tones', () => {
  const proposal = latestTaskDecompositionResponse({
    status: 'proposal',
    result: {
      outcome: 'proposal',
      candidates: [{}, {}],
    },
    error: null,
  } as TaskDecompositionRunRecord);
  assert.equal(proposal.statusLabel, 'Review');
  assert.match(proposal.summary, /2 Candidate boundaries/);

  const evidence = latestTaskDecompositionResponse({
    status: 'insufficient-evidence',
    result: {
      outcome: 'insufficient-evidence',
      missingEvidence: ['Product boundary'],
    },
    error: null,
  } as TaskDecompositionRunRecord);
  assert.equal(evidence.attention, 'action-required');
  assert.equal(evidence.statusLabel, 'More evidence needed');

  const canceled = latestTaskDecompositionResponse({
    status: 'canceled',
    result: null,
    error: null,
  } as TaskDecompositionRunRecord);
  assert.equal(canceled.tone, 'warning');
  assert.equal(canceled.statusLabel, 'Canceled');
});

void test('a running decomposition keeps the newest terminal response visible', () => {
  const terminal = {
    runId: 'RUN-terminal',
    status: 'no-change',
    startedAt: '2026-09-02T00:00:00.000Z',
  } as TaskDecompositionRunRecord;
  const running = {
    runId: 'RUN-running',
    status: 'running',
    startedAt: '2026-09-02T00:01:00.000Z',
  } as TaskDecompositionRunRecord;
  assert.equal(
    latestTerminalTaskDecompositionRun([terminal, running])?.runId,
    terminal.runId,
  );
});
