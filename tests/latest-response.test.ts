import assert from 'node:assert/strict';
import test from 'node:test';
import type { WhatsNextRunRecord } from '../lib/whats-next-runs.ts';
import { latestWhatsNextResponse } from '../lib/latest-response.ts';

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
