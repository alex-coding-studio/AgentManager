import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import test from 'node:test';
import {
  createModelCatalogCache,
  parseModels,
  readLocalModels,
} from '../lib/local-agent-models.ts';
import { validatePlanningProfile } from '../lib/just-do-it-planning-service.ts';
import {
  buildClaudeArguments,
  buildCodexArguments,
} from '../lib/local-agent-transport.ts';

type Message = {
  id?: number;
  method?: string;
  request_id?: string;
  params?: { cursor?: string };
  request?: { subtype?: string };
};

function fake(
  onMessage: (message: Message, reply: (message: unknown) => void) => void,
) {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const messages: Message[] = [];
  let killed = false;
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      const message = JSON.parse(chunk.toString());
      messages.push(message);
      queueMicrotask(() =>
        onMessage(message, (reply) =>
          child.stdout.emit('data', JSON.stringify(reply) + '\n'),
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

void test('normalizes native catalogs, hides hidden models, and keeps provider effort options', () => {
  assert.deepEqual(
    parseModels('codex', [
      {
        model: 'test-model',
        displayName: 'Test',
        supportedReasoningEfforts: [
          { reasoningEffort: 'max' },
          { reasoningEffort: 'ultra' },
        ],
      },
      { model: 'hidden', hidden: true },
      { model: '--bad' },
    ]),
    [
      {
        id: 'test-model',
        name: 'Test',
        description: '',
        efforts: ['max', 'ultra'],
      },
    ],
  );
  assert.deepEqual(
    parseModels('claude', [
      { value: 'opus[1m]', supportedEffortLevels: ['low', 'max'] },
      { value: 'haiku' },
    ]).map((item) => item.efforts),
    [['low', 'max'], []],
  );
  assert.throws(() => parseModels('codex', {}));
});

void test('Codex discovery initializes and paginates without starting a thread or turn', async () => {
  const process = fake((message, reply) => {
    if (message.id === 1) reply({ id: 1, result: {} });
    if (message.id === 2)
      reply({
        id: 2,
        result: { data: [{ model: 'first' }], nextCursor: 'next' },
      });
    if (message.id === 3)
      reply({
        id: 3,
        result: { data: [{ model: 'second' }], nextCursor: null },
      });
  });
  const catalog = await readLocalModels('codex', () => process.child);
  assert.deepEqual(
    catalog.models.map((item) => item.id),
    ['first', 'second'],
  );
  assert.deepEqual(
    process.messages.map((item) => item.method),
    ['initialize', 'initialized', 'model/list', 'model/list'],
  );
  assert.equal(process.messages[3].params?.cursor, 'next');
  assert.equal(process.killed(), true);
});

void test('Claude discovery uses initialization only and disables tools and customizations', async () => {
  const process = fake((message, reply) =>
    reply({
      type: 'control_response',
      response: {
        request_id: message.request_id,
        subtype: 'success',
        response: { models: [{ value: 'sonnet' }] },
      },
    }),
  );
  const catalog = await readLocalModels('claude', (_agent, args) => {
    assert.ok(args.includes('--safe-mode'));
    assert.ok(args.includes('--no-session-persistence'));
    assert.equal(args[args.indexOf('--tools') + 1], '');
    return process.child;
  });
  assert.equal(catalog.models[0].id, 'sonnet');
  assert.equal(process.messages.length, 1);
  assert.equal(process.messages[0].request?.subtype, 'initialize');
  assert.equal(process.killed(), true);
});

void test('failed, malformed, timed-out, and looping catalog responses stop their process', async () => {
  for (const response of [
    { id: 1, error: { message: 'Denied' } },
    { id: 2, result: { data: {} } },
  ]) {
    const process = fake((_message, reply) => reply(response));
    await assert.rejects(readLocalModels('codex', () => process.child));
    assert.equal(process.killed(), true);
  }
  const stalled = fake(() => {});
  await assert.rejects(
    readLocalModels('codex', () => stalled.child, 5),
    /timed out/,
  );
  assert.equal(stalled.killed(), true);
  const looping = fake((message, reply) => {
    if (message.id === 1) reply({ id: 1, result: {} });
    else if (message.id)
      reply({ id: message.id, result: { data: [], nextCursor: 'same' } });
  });
  await assert.rejects(readLocalModels('codex', () => looping.child));
  assert.equal(looping.killed(), true);
});

void test('concurrent catalog reads share a bounded cache and expired entries refresh', async () => {
  let time = 0;
  let count = 0;
  const get = createModelCatalogCache(
    async (agent) => {
      count++;
      return { agent, models: [] };
    },
    () => time,
  );
  await Promise.all([get('codex'), get('codex')]);
  assert.equal(count, 1);
  await get('claude');
  assert.equal(count, 2);
  time = 60001;
  await get('codex');
  assert.equal(count, 3);
});

void test('catalog model IDs and effort settings reach execution arguments unchanged', () => {
  const profile = {
    agent: 'claude' as const,
    model: 'opus[1m]',
    effort: 'max' as const,
  };
  validatePlanningProfile(profile);
  const args = buildClaudeArguments(undefined, profile);
  assert.equal(args[args.indexOf('--model') + 1], 'opus[1m]');
  assert.equal(args[args.indexOf('--effort') + 1], 'max');
  validatePlanningProfile({
    agent: 'codex',
    model: 'test-model',
    effort: 'ultra',
  });
  assert.ok(
    buildCodexArguments({
      workingDirectory: '/tmp',
      prompt: '',
      model: 'test-model',
      effort: 'ultra',
    }).includes('model_reasoning_effort="ultra"'),
  );
  assert.throws(() =>
    validatePlanningProfile({ ...profile, model: 'bad;command' }),
  );
  assert.throws(() =>
    validatePlanningProfile({ ...profile, effort: 'invented' as 'max' }),
  );
});
