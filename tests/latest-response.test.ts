import assert from 'node:assert/strict';
import test from 'node:test';
import type { WhatsNextRunRecord } from '../lib/whats-next-runs.ts';
import type { TaskDecompositionRunRecord } from '../lib/task-decomposition-runs.ts';
import {
  latestTaskDecompositionResponse,
  latestWhatsNextResponse,
} from '../lib/latest-response.ts';

function run(
  status: WhatsNextRunRecord['status'],
  result: WhatsNextRunRecord['result'] = null,
  error: string | null = null,
) {
  return { status, result, error } as WhatsNextRunRecord;
}

void test('ordinary proposal and no-change responses stay neutral', () => {
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
    tone: 'neutral',
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
  assert.equal(noChange.tone, 'neutral');
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
  assert.equal(presentation.tone, 'attention');
  assert.equal(presentation.attention, 'action-required');
  assert.equal(presentation.statusLabel, 'Answer needed');
  assert.equal(presentation.icon, 'attention');
});

void test('failure is prominent while cancellation remains neutral', () => {
  const failed = latestWhatsNextResponse(
    run('failed', null, 'The response was invalid.'),
  );
  assert.equal(failed.tone, 'error');
  assert.equal(failed.attention, 'action-required');
  assert.equal(failed.summary, 'The response was invalid.');

  const canceled = latestWhatsNextResponse(run('canceled'));
  assert.equal(canceled.tone, 'neutral');
  assert.equal(canceled.attention, 'none');
  assert.equal(canceled.icon, 'neutral');
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
  assert.equal(canceled.tone, 'neutral');
  assert.equal(canceled.statusLabel, 'Canceled');
});
