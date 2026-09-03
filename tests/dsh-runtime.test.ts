import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  bootRuntime,
  buildDeepseekPatches,
  renderDeepseekContext,
  summarize,
  type DshModules,
} from '../lib/dsh/runtime.ts';

type Patch = { id?: string; disabled?: boolean; config?: unknown };

void test('DeepSeek patches pin read-only sandboxing and disable tools', () => {
  const patches = buildDeepseekPatches(
    [{ id: 'kept', config: {} }],
    '/tmp/project',
  ) as Patch[];
  const sandbox = patches.find((patch) => patch.id === 'sandbox-policy');
  assert.deepEqual(sandbox, {
    id: 'sandbox-policy',
    config: { mode: 'read-only', workspaceRoot: '/tmp/project' },
  });
  const disabled = new Set(
    patches.filter((patch) => patch.disabled).map((patch) => patch.id),
  );
  for (const id of [
    'tool-bash',
    'tool-pwsh',
    'tool-jobs',
    'tool-fs',
    'tool-fs-search',
    'tool-web',
    'tool-subagent',
    'tool-subagent-fork',
    'tool-workflow',
    'tool-ralph',
  ])
    assert.ok(disabled.has(id), `${id} should be disabled`);
});

void test('DeepSeek write patches keep file and shell tools and drop delegation', () => {
  const patches = buildDeepseekPatches(
    [{ id: 'kept', config: {} }],
    '/tmp/project',
    'workspace-write',
  ) as Patch[];
  const sandbox = patches.find((patch) => patch.id === 'sandbox-policy');
  assert.deepEqual(sandbox, {
    id: 'sandbox-policy',
    config: { mode: 'workspace-write', workspaceRoot: '/tmp/project' },
  });
  const disabled = new Set(
    patches.filter((patch) => patch.disabled).map((patch) => patch.id),
  );
  for (const id of ['tool-bash', 'tool-fs', 'tool-fs-search'])
    assert.ok(!disabled.has(id), `${id} should stay enabled for writes`);
  for (const id of ['tool-subagent', 'tool-subagent-fork', 'tool-ralph'])
    assert.ok(disabled.has(id), `${id} should be disabled`);
});

void test('DeepSeek receives only regular files from the frozen Context index', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'praxis-dsh-context-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'input'));
  await writeFile(path.join(root, 'input', 'request.md'), '# Request\n');
  await writeFile(
    path.join(root, 'index.json'),
    JSON.stringify({
      schemaVersion: 1,
      primary: [
        {
          logicalPath: 'input/request.md',
          workspacePath: 'input/request.md',
        },
      ],
      related: [],
    }),
  );
  assert.match(await renderDeepseekContext(root), /## input\/request\.md/);

  const outside = path.join(path.dirname(root), 'outside.md');
  await writeFile(outside, 'private');
  t.after(() => rm(outside, { force: true }));
  await symlink(outside, path.join(root, 'input', 'linked.md'));
  await writeFile(
    path.join(root, 'index.json'),
    JSON.stringify({
      schemaVersion: 1,
      primary: [
        {
          logicalPath: 'input/linked.md',
          workspacePath: 'input/linked.md',
        },
      ],
      related: [],
    }),
  );
  await assert.rejects(renderDeepseekContext(root), /regular file/);
});

void test('summarize keeps the last assistant text after the turn started', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: {} },
    {
      seq: 1,
      type: 'assistant/message',
      data: {
        message: {
          content: [{ type: 'text', text: 'first' }],
        },
      },
    },
    {
      seq: 2,
      type: 'assistant/message',
      data: {
        message: {
          content: [{ type: 'tool_use' }, { type: 'text', text: 'final' }],
        },
      },
    },
  ];
  assert.equal(summarize(events, 0), 'final');
});

function makeFake() {
  const createCalls: unknown[] = [];
  const resumeCalls: unknown[] = [];
  const canceled: unknown[] = [];
  const agent = {
    session: {
      id: 'session-1',
      seq: 0,
      events: [
        { seq: 0, type: 'turn/start' },
        {
          seq: 1,
          type: 'assistant/message',
          data: { message: { content: [{ type: 'text', text: 'done' }] } },
        },
      ],
    },
    whenIdle: async () => {},
    followup: () => {},
    cancel: (cause: unknown) => {
      canceled.push(cause);
    },
  };
  const handle = { agent, dispose: async () => {} };
  const agents = {
    create: async (options: unknown) => {
      createCalls.push(options);
      return handle;
    },
    resume: async (options: unknown) => {
      resumeCalls.push(options);
      return handle;
    },
  };
  const ctx = {
    fiber: { dispose: async () => {} },
    get: (name: string) =>
      name === 'agents' ? agents : name === 'sessions' ? sessions : undefined,
  };
  const sessions = { flush: async () => {} };
  const modules: DshModules = {
    boot: async () => ctx,
    loadOverlayPatches: () => [],
    SessionId: (id) => id,
    createUserMessage: (message) => message,
    ReasoningEffortId: (effort) => effort,
    installModelSelection: () => {},
  };
  return { modules, createCalls, resumeCalls, canceled };
}

void test('a fresh run creates an agent with the selected model and cwd', async () => {
  const fake = makeFake();
  const runtime = await bootRuntime('/tmp/project', async () => fake.modules);
  const result = await runtime.runTurn({
    prompt: 'plan',
    model: 'deepseek-v4-pro',
    effort: 'high',
    workingDirectory: '/tmp/project',
  });
  assert.equal(result.sessionId, 'session-1');
  assert.equal(result.finalOutput, 'done');
  assert.equal(fake.resumeCalls.length, 0);
  const options = fake.createCalls[0] as {
    sessionId: string;
    meta: { cwd: string };
    agentOptions: { provider: string; model: string };
  };
  assert.equal(options.agentOptions.provider, 'deepseek-official');
  assert.equal(options.agentOptions.model, 'deepseek-v4-pro');
  assert.equal(options.meta.cwd, '/tmp/project');
  await runtime.close();
});

void test('a resumed run resumes the stored session id', async () => {
  const fake = makeFake();
  const runtime = await bootRuntime('/tmp/project', async () => fake.modules);
  await runtime.runTurn({
    prompt: 'continue',
    resumeSessionId: 'session-1',
    workingDirectory: '/tmp/project',
  });
  assert.equal(fake.createCalls.length, 0);
  assert.equal(fake.resumeCalls.length, 1);
  await runtime.close();
});

void test('an aborted signal cancels the agent and rejects the run', async () => {
  const fake = makeFake();
  const runtime = await bootRuntime('/tmp/project', async () => fake.modules);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.runTurn(
      { prompt: 'plan', workingDirectory: '/tmp/project' },
      controller.signal,
    ),
    /canceled/,
  );
  assert.deepEqual(fake.canceled, [{ kind: 'user' }]);
  await runtime.close();
});

void test('a tree without Agent services fails to boot', async () => {
  const modules: DshModules = {
    ...makeFake().modules,
    boot: async () => ({
      fiber: { dispose: async () => {} },
      get: () => undefined,
    }),
  };
  await assert.rejects(
    bootRuntime('/tmp/project', async () => modules),
    /Agent/,
  );
});

void test(
  'the installed DSH runtime boots and closes without a provider turn',
  { timeout: 20_000 },
  async (t) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'praxis-dsh-boot-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const runtime = await bootRuntime(root);
    await runtime.close();
  },
);
