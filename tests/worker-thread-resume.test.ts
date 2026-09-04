import assert from 'node:assert/strict';
import test from 'node:test';
import { openWorkerThread } from '../lib/agents/event-driven-transport.ts';
import { buildCodexArguments } from '../lib/agents/transport.ts';
import type {
  AgentRuntimeThread,
  AgentRuntimeThreadInput,
  AgentSessionDriver,
} from '../lib/agents/runtime-driver.ts';

const threadInput: AgentRuntimeThreadInput = {
  profile: { agent: 'claude', model: 'sonnet', effort: 'high' },
  workingDirectory: '/fixture',
  access: 'workspace-write',
};

function fakeDriver(options: { resumeFails?: boolean } = {}) {
  const calls: string[] = [];
  let resumed: AgentRuntimeThread | undefined;
  const driver = {
    provider: 'claude',
    capabilities: {},
    async startThread(input: AgentRuntimeThreadInput) {
      calls.push('start');
      return { provider: 'claude', threadId: 'fresh-thread', ...input };
    },
    async resumeThread(thread: AgentRuntimeThread) {
      calls.push('resume');
      if (options.resumeFails) throw new Error('Session is gone.');
      resumed = thread;
      return thread;
    },
    startTurn() {
      throw new Error('unused');
    },
    async close() {},
  } as unknown as AgentSessionDriver;
  return { driver, calls, resumed: () => resumed };
}

void test('a round without a previous session opens a fresh thread', async () => {
  const f = fakeDriver();
  const thread = await openWorkerThread(f.driver, undefined, threadInput);
  assert.deepEqual(f.calls, ['start']);
  assert.equal(thread.threadId, 'fresh-thread');
});

void test('a previous session is resumed on the real driver, not started over', async () => {
  const f = fakeDriver();
  const thread = await openWorkerThread(
    f.driver,
    'previous-thread',
    threadInput,
  );
  assert.deepEqual(f.calls, ['resume']);
  assert.equal(thread.threadId, 'previous-thread');
  assert.equal(f.resumed()?.provider, 'claude');
  assert.equal(f.resumed()?.workingDirectory, '/fixture');
  assert.equal(f.resumed()?.access, 'workspace-write');
});

void test('a session the provider can no longer resume falls back to a fresh thread', async () => {
  const f = fakeDriver({ resumeFails: true });
  const thread = await openWorkerThread(
    f.driver,
    'expired-thread',
    threadInput,
  );
  assert.deepEqual(f.calls, ['resume', 'start']);
  assert.equal(thread.threadId, 'fresh-thread');
});

void test('the restricted Codex CLI refuses a resumed workspace-write session', () => {
  assert.throws(
    () =>
      buildCodexArguments({
        workingDirectory: '/fixture',
        prompt: 'p',
        access: 'workspace-write',
        resumeSessionId: 'previous-thread',
      }),
    /fresh Session/,
  );
});
