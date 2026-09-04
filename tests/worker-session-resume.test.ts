import assert from 'node:assert/strict';
import test from 'node:test';
import { resumableWorkerSession } from '../lib/modules/implementation/execution-service.ts';
import type { ActionRun } from '../lib/modules/implementation/execution-types.ts';
import type { AgentProfile } from '../lib/agents/profile.ts';

const profile: AgentProfile = {
  agent: 'codex',
  model: 'gpt-5',
  effort: 'high',
};

const run = (patch: Partial<ActionRun> = {}): ActionRun => ({
  id: 'run-1',
  actionId: 'action-1',
  status: 'succeeded',
  input: 'do the thing',
  profile,
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: '2026-01-01T00:05:00Z',
  hostPid: 1,
  agentSessionId: 'session-1',
  usage: null,
  result: null,
  error: null,
  observedRefs: [],
  outputRef: null,
  ...patch,
});

void test('the latest succeeded run of the same Action supplies the session', () => {
  assert.equal(
    resumableWorkerSession(
      [run({ id: 'older', agentSessionId: 'session-older' }), run()],
      'action-1',
      profile,
    ),
    'session-1',
  );
});

void test('a run of another Action is not resumed into this one', () => {
  assert.equal(
    resumableWorkerSession(
      [run({ actionId: 'action-2' })],
      'action-1',
      profile,
    ),
    undefined,
  );
});

void test('an unsuccessful run is not resumed', () => {
  for (const status of ['failed', 'canceled', 'running'] as const)
    assert.equal(
      resumableWorkerSession([run({ status })], 'action-1', profile),
      undefined,
      status,
    );
});

void test('a run that recorded no session cannot be resumed', () => {
  assert.equal(
    resumableWorkerSession(
      [run({ agentSessionId: null })],
      'action-1',
      profile,
    ),
    undefined,
  );
});

void test('a session from another agent or model is not resumed', () => {
  assert.equal(
    resumableWorkerSession(
      [run({ profile: { ...profile, agent: 'claude' } })],
      'action-1',
      profile,
    ),
    undefined,
  );
  assert.equal(
    resumableWorkerSession(
      [run({ profile: { ...profile, model: 'other-model' } })],
      'action-1',
      profile,
    ),
    undefined,
  );
});

void test('a card that has never executed resumes nothing', () => {
  assert.equal(
    resumableWorkerSession(undefined, 'action-1', profile),
    undefined,
  );
  assert.equal(resumableWorkerSession([], 'action-1', profile), undefined);
});

void test('an unusable latest run stops the search instead of reaching further back', () => {
  for (const latest of [
    run({ status: 'failed' }),
    run({ status: 'canceled' }),
    run({ agentSessionId: null }),
    run({ profile: { ...profile, model: 'other-model' } }),
  ])
    assert.equal(
      resumableWorkerSession(
        [run({ id: 'good', agentSessionId: 'session-good' }), latest],
        'action-1',
        profile,
      ),
      undefined,
      latest.status,
    );
});

void test('a newer run of another Action does not hide this Action latest run', () => {
  assert.equal(
    resumableWorkerSession(
      [run({ agentSessionId: 'mine' }), run({ actionId: 'action-2' })],
      'action-1',
      profile,
    ),
    'mine',
  );
});
