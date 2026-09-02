import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import test from 'node:test';
import os from 'node:os';
import {
  readCodexSkills,
  parseSkillCatalog,
  executionAccessFromConfig,
  withSkillCatalog,
  type SkillCatalog,
} from '../lib/local-agent-skills.ts';
import {
  startCodexRun,
  buildCodexArguments,
  type LocalAgentRun,
} from '../lib/local-agent-transport.ts';

const cwd = '/tmp/skill-fixture';
const catalog: SkillCatalog = {
  skills: [
    {
      name: 'ios-dev-agent:setup',
      description: 'Create an iOS project when needed.',
      path: '/installed/ios/setup/SKILL.md',
      enabled: true,
    },
    {
      name: 'disabled',
      description: 'Disabled by the user.',
      path: '/installed/disabled/SKILL.md',
      enabled: false,
    },
  ],
};
const payload = { data: [{ cwd, skills: catalog.skills, errors: [] }] };
function fake(
  onMessage: (
    m: { id?: number; method?: string; params?: unknown },
    reply: (value: unknown) => void,
  ) => void,
) {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const messages: Array<{ id?: number; method?: string; params?: unknown }> =
    [];
  let killed = false;
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      const m = JSON.parse(chunk.toString());
      messages.push(m);
      queueMicrotask(() =>
        onMessage(m, (value) =>
          child.stdout.emit('data', JSON.stringify(value) + '\n'),
        ),
      );
      callback();
    },
  });
  child.kill = () => {
    killed = true;
    queueMicrotask(() => child.emit('exit', 0));
    return true;
  };
  return { child, messages, killed: () => killed };
}

void test('native Skills discovery reads the project catalog without creating a Session or model turn', async () => {
  const f = fake((m, reply) => {
    if (m.id === 1) reply({ id: 1, result: {} });
    if (m.id === 2) reply({ id: 2, result: payload });
    if (m.id === 3)
      reply({ id: 3, result: { config: { sandbox_mode: 'workspace-write' } } });
  });
  const result = await readCodexSkills(cwd, {
    start: (directory, args) => {
      assert.equal(directory, cwd);
      assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
      return f.child;
    },
  });
  assert.deepEqual(result, { ...catalog, executionAccess: 'workspace-write' });
  assert.deepEqual(
    f.messages.map((m) => m.method),
    ['initialize', 'initialized', 'skills/list', 'config/read'],
  );
  assert.deepEqual(f.messages[2].params, { cwds: [cwd], forceReload: true });
  assert.deepEqual(f.messages[3].params, {
    cwd: os.homedir(),
    includeLayers: false,
  });
  assert.equal(f.killed(), true);
});

void test('catalog injection includes only enabled metadata and preserves the requested task', () => {
  const prompt = withSkillCatalog('Plan only. Do not execute.', catalog);
  assert.ok(prompt.startsWith('Plan only. Do not execute.'));
  assert.ok(prompt.includes('ios-dev-agent:setup'));
  assert.ok(prompt.includes('/installed/ios/setup/SKILL.md'));
  assert.ok(!prompt.includes('/installed/disabled'));
  assert.ok(prompt.includes('not a request to invoke'));
  assert.throws(() => parseSkillCatalog({ data: [] }, cwd), /project/);
  assert.throws(
    () =>
      parseSkillCatalog(
        { data: [{ cwd, skills: [], errors: ['unreadable'] }] },
        cwd,
      ),
    /could not be loaded/,
  );
  assert.throws(
    () =>
      parseSkillCatalog(
        {
          data: [
            {
              cwd,
              skills: [{ ...catalog.skills[0], path: 'relative/path' }],
              errors: [],
            },
          ],
        },
        cwd,
      ),
    /Invalid/,
  );
});

void test('discovery errors and timeout terminate the helper instead of silently starting without Skills', async () => {
  for (const mode of ['timeout', 'error', 'malformed']) {
    const f = fake((m, reply) => {
      if (mode === 'timeout') return;
      if (m.id === 1) reply({ id: 1, result: {} });
      if (m.id === 2)
        reply(
          mode === 'error'
            ? { id: 2, error: { message: 'failed' } }
            : { id: 2, result: {} },
        );
    });
    await assert.rejects(
      readCodexSkills(cwd, { start: () => f.child, timeoutMs: 10 }),
    );
    assert.equal(f.killed(), true);
  }
});

void test('cancel during discovery kills the helper and never launches an execution', async () => {
  const controller = new AbortController();
  const f = fake(() => {});
  const pending = readCodexSkills(cwd, {
    start: () => f.child,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, /canceled/);
  assert.equal(f.killed(), true);
  let resolve!: (catalog: SkillCatalog) => void;
  let launches = 0;
  const run = startCodexRun(
    { workingDirectory: cwd, prompt: 'task' },
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
    () => {
      launches++;
      throw new Error('Must not launch');
    },
  );
  run.cancel();
  resolve(catalog);
  await assert.rejects(run.completion, /canceled/);
  assert.equal(launches, 0);
});

void test('new and resumed Codex sessions receive metadata without removing execution isolation or disabled Skill settings', async () => {
  for (const resumeSessionId of [undefined, 'existing-session']) {
    let canceled = false;
    const run = startCodexRun(
      { workingDirectory: cwd, prompt: 'original task', resumeSessionId },
      async () => catalog,
      (input, discovered) => {
        assert.ok(input.prompt.includes('ios-dev-agent:setup'));
        assert.ok(!input.prompt.includes('/installed/disabled'));
        const args = buildCodexArguments(input, discovered);
        assert.ok(args.includes('--ignore-user-config'));
        assert.ok(args.includes('--ignore-rules'));
        assert.ok(
          args.includes(
            'skills.config=[{path="/installed/disabled/SKILL.md",enabled=false}]',
          ),
        );
        if (resumeSessionId) assert.ok(args.includes(resumeSessionId));
        else assert.ok(args.includes('read-only'));
        return {
          completion: Promise.resolve({
            agentSessionId: 'session',
            finalOutput: 'done',
            usage: null,
          }),
          cancel: () => {
            canceled = true;
          },
        } as LocalAgentRun;
      },
    );
    assert.equal((await run.completion).finalOutput, 'done');
    run.cancel();
    assert.equal(canceled, true);
  }
  const args = buildCodexArguments(
    {
      workingDirectory: cwd,
      prompt: 'task',
      access: 'workspace-write',
      protectedPath: '/tmp/skill-fixture/.praxis',
    },
    catalog,
  );
  assert.ok(args.includes('approval_policy="never"'));
  assert.ok(args.includes('default_permissions="praxis_action"'));
  assert.ok(
    args.some((arg) => arg.includes('"/tmp/skill-fixture/.praxis"="read"')),
  );
});

void test('failed discovery does not invoke the provider', async () => {
  let launched = false;
  const run = startCodexRun(
    { workingDirectory: cwd, prompt: 'task' },
    async () => {
      throw new Error('Catalog unavailable');
    },
    () => {
      launched = true;
      throw new Error('Must not launch');
    },
  );
  await assert.rejects(run.completion, /Catalog unavailable/);
  assert.equal(launched, false);
});

void test('only explicit local Full Access enables unrestricted execution; planning remains read-only', async () => {
  assert.equal(
    executionAccessFromConfig({
      config: { sandbox_mode: 'danger-full-access', default_permissions: null },
    }),
    'full-access',
  );
  assert.equal(
    executionAccessFromConfig({
      config: { default_permissions: ':danger-full-access' },
    }),
    'full-access',
  );
  assert.equal(
    executionAccessFromConfig({
      config: {
        sandbox_mode: 'danger-full-access',
        default_permissions: ':workspace',
      },
    }),
    'workspace-write',
  );
  assert.throws(
    () =>
      executionAccessFromConfig({
        config: {
          sandbox_mode: 'danger-full-access',
          default_permissions: 'custom-restricted',
        },
      }),
    /will not replace/,
  );
  assert.equal(
    executionAccessFromConfig({ config: { sandbox_mode: 'read-only' } }),
    'read-only',
  );
  assert.throws(() => executionAccessFromConfig(null), /permission settings/);
  const full = { ...catalog, executionAccess: 'full-access' as const };
  const args = buildCodexArguments(
    { workingDirectory: cwd, prompt: '', access: 'workspace-write' },
    full,
  );
  assert.ok(args.includes('danger-full-access'));
  assert.ok(!args.some((arg) => arg.startsWith('permissions.praxis_action=')));
  const planning = buildCodexArguments(
    { workingDirectory: cwd, prompt: '', access: 'read-only' },
    full,
  );
  assert.ok(planning.includes('read-only'));
  assert.ok(!planning.includes('danger-full-access'));
  const readOnly = buildCodexArguments(
    { workingDirectory: cwd, prompt: '', access: 'workspace-write' },
    { ...catalog, executionAccess: 'read-only' },
  );
  assert.ok(readOnly.includes('read-only'));
  let received = '';
  const run = startCodexRun(
    {
      workingDirectory: cwd,
      prompt: 'Implement only this Action.',
      access: 'workspace-write',
    },
    async () => full,
    (input) => {
      received = input.prompt;
      return {
        completion: Promise.resolve({
          agentSessionId: 'fixture',
          finalOutput: '{}',
          usage: null,
        }),
        cancel: () => {},
      };
    },
  );
  assert.equal((await run.completion).executionAccess, 'full-access');
  assert.match(received, /no OS filesystem sandbox/);
});
