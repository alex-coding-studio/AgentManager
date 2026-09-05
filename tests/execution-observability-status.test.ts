import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyResponse,
  type ClassificationFacts,
} from '../lib/execution-observability/status.ts';
import { statusPresentation } from '../lib/execution-observability/status-presentation.ts';

const settled = (
  overrides: Partial<ClassificationFacts> = {},
): ClassificationFacts => ({
  surface: 'card',
  runState: 'settled',
  outcome: 'delivered',
  requiredChecks: { total: 3, passed: 3, failed: 0, notRun: 0 },
  ...overrides,
});

void test('every required condition passing is Completed', () => {
  const result = classifyResponse(settled({ summary: 'PR #4 is ready.' }));
  assert.equal(result.status, 'completed');
  assert.equal(result.title, 'Delivered');
  assert.equal(result.detail, 'PR #4 is ready.');
  assert.deepEqual(result.supplementaryWarnings, []);
  assert.deepEqual(result.recovery, ['log', 'continue', 'pass']);
});

void test('non-blocking findings stay inside the green response', () => {
  const result = classifyResponse(
    settled({ additionalFindings: ['Unused import in AppColor.swift', ''] }),
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.supplementaryWarnings, [
    'Unused import in AppColor.swift',
  ]);
});

void test('acceptance keeps Completed and only renames the title', () => {
  const result = classifyResponse(settled({ accepted: true }));
  assert.equal(result.status, 'completed');
  assert.equal(result.title, 'Accepted');
  assert.ok(!result.recovery.includes('pass'));
});

void test('clarification and missing evidence are Warning with concrete detail', () => {
  const clarification = classifyResponse(
    settled({
      surface: 'module',
      outcome: 'clarification',
      question: 'Which deployment target should be authoritative?',
    }),
  );
  assert.equal(clarification.status, 'warning');
  assert.equal(clarification.title, 'Answer needed');
  assert.equal(
    clarification.detail,
    'Which deployment target should be authoritative?',
  );
  assert.deepEqual(clarification.recovery, ['log', 'answer']);
  const evidence = classifyResponse(
    settled({
      surface: 'module',
      outcome: 'insufficient-evidence',
      missingEvidence: ['Repository README', 'Current Delivery Map'],
    }),
  );
  assert.equal(evidence.status, 'warning');
  assert.equal(evidence.title, 'More evidence needed');
  assert.match(evidence.detail, /Repository README; Current Delivery Map/);
});

void test('Coordinator semantic copy shapes Warning text but never the color', () => {
  const needsUser = classifyResponse(
    settled({
      coordinatorDecision: 'needs-user',
      outcome: 'blocked',
      semantic: {
        title: 'Deployment target needs confirmation',
        detail:
          'project.yml declares iOS 26.0 while the configuration declares iOS 26.1.',
      },
    }),
  );
  assert.equal(needsUser.status, 'warning');
  assert.equal(needsUser.title, 'Deployment target needs confirmation');
  const failedChecks = classifyResponse(
    settled({
      requiredChecks: { total: 2, passed: 1, failed: 1, notRun: 0 },
      semantic: { title: 'Everything is fine', detail: 'Trust me.' },
    }),
  );
  assert.equal(failedChecks.status, 'fail');
  assert.equal(failedChecks.title, 'Everything is fine');
  assert.deepEqual(failedChecks.recovery, ['log', 'continue', 'undo']);
});

void test('unexecuted required checks never produce Completed or Pass', () => {
  const claimed = classifyResponse(
    settled({
      outcome: 'delivered',
      requiredChecks: { total: 2, passed: 1, failed: 0, notRun: 1 },
    }),
  );
  assert.equal(claimed.status, 'warning');
  assert.equal(claimed.title, 'Required checks incomplete');
  assert.match(claimed.detail, /1 of 2 required checks did not run/);
  assert.deepEqual(claimed.recovery, ['log', 'continue', 'undo']);
  const short = classifyResponse(
    settled({
      requiredChecks: { total: 3, passed: 1, failed: 0, notRun: 0 },
    }),
  );
  assert.equal(short.status, 'warning');
  assert.ok(!short.recovery.includes('pass'));
  const clarification = classifyResponse(
    settled({
      outcome: 'clarification',
      question: 'Which target?',
      requiredChecks: { total: 2, passed: 0, failed: 0, notRun: 2 },
    }),
  );
  assert.equal(clarification.title, 'Answer needed');
});

void test('required check failure without Coordinator copy uses a Host title', () => {
  const result = classifyResponse(
    settled({ requiredChecks: { total: 2, passed: 1, failed: 1, notRun: 0 } }),
  );
  assert.equal(result.status, 'fail');
  assert.equal(result.title, 'Required checks failed');
  assert.match(result.detail, /1 of 2 required checks failed/);
});

void test('cancellation is a Warning titled Canceled with retained effects', () => {
  const result = classifyResponse(
    settled({
      runState: 'canceled',
      interruptedPhase: 'executing',
      retained: {
        changedFiles: 3,
        commits: [],
        checkpoint: null,
        pullRequests: ['https://github.com/org/repo/pull/2'],
        checksStarted: false,
      },
    }),
  );
  assert.equal(result.status, 'warning');
  assert.equal(result.title, 'Canceled');
  assert.match(result.detail, /during Worker execution/);
  assert.match(result.detail, /3 modified files and PR #2 were preserved/);
  assert.match(result.detail, /required checks had not started/);
  assert.deepEqual(result.recovery, ['log', 'continue', 'undo']);
});

void test('transport, parsing, persistence, publication and ownership loss are Fail', () => {
  const parse = classifyResponse(
    settled({ failure: { kind: 'parse', message: 'Unexpected token' } }),
  );
  assert.equal(parse.status, 'fail');
  assert.equal(parse.title, 'Saved result could not be verified');
  assert.doesNotMatch(parse.detail, /Unexpected token/);
  assert.deepEqual(parse.recovery, ['log', 'reread', 'undo']);
  for (const kind of ['transport', 'persistence', 'publication'] as const)
    assert.equal(
      classifyResponse(settled({ failure: { kind, message: 'x' } })).status,
      'fail',
    );
  const lost = classifyResponse(settled({ runState: 'ownership-lost' }));
  assert.equal(lost.status, 'fail');
  assert.equal(lost.title, 'Execution ownership lost');
  assert.deepEqual(lost.recovery, ['log', 'inspect-workspace']);
});

void test('unconfirmed termination outranks every other fact', () => {
  const result = classifyResponse(
    settled({
      runState: 'termination-unconfirmed',
      interruptedActor: 'WORKER',
      semantic: { title: 'All good', detail: 'Nothing to see.' },
    }),
  );
  assert.equal(result.status, 'fail');
  assert.equal(result.title, 'Execution could not be stopped');
  assert.match(result.detail, /could not confirm that the Worker exited/);
  assert.deepEqual(result.recovery, ['log', 'inspect-workspace']);
});

void test('external pending and partial results are Warning with their own recovery', () => {
  const pending = classifyResponse(
    settled({ externalPending: { label: 'PR #7 review' } }),
  );
  assert.equal(pending.status, 'warning');
  assert.equal(pending.title, 'Pending');
  assert.deepEqual(pending.recovery, ['log', 'refresh-external']);
  const partial = classifyResponse(settled({ outcome: 'partial' }));
  assert.equal(partial.status, 'warning');
  assert.equal(partial.title, 'Partial result preserved');
});

void test('Graph and Flow outcomes map to Completed titles without pass', () => {
  assert.equal(
    classifyResponse(settled({ surface: 'module', outcome: 'proposal' })).title,
    'Review',
  );
  assert.equal(
    classifyResponse(settled({ surface: 'module', outcome: 'applied' })).title,
    'Applied',
  );
  const noChange = classifyResponse(
    settled({
      surface: 'module',
      outcome: 'no-change',
      reason: 'Nothing new.',
    }),
  );
  assert.equal(noChange.title, 'No change');
  assert.equal(noChange.detail, 'Nothing new.');
  assert.deepEqual(noChange.recovery, ['log', 'continue']);
});

void test('presentation exposes four colors plus running', () => {
  assert.equal(statusPresentation('running').pulse, true);
  assert.equal(statusPresentation('completed').icon, 'success');
  assert.equal(statusPresentation('warning').icon, 'warning');
  assert.equal(statusPresentation('fail').icon, 'error');
  assert.match(statusPresentation('warning').dot, /amber/);
  assert.match(statusPresentation('fail').dot, /destructive/);
});
