import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DesktopService,
  localNavigation,
  notificationTransitions,
  readResponses,
} from '../desktop/runtime.mjs';

const response = (patch = {}) => ({
  key: 'project/card',
  runId: 'one',
  status: 'running',
  title: 'Running',
  ...patch,
});

void test('notifications follow each owner once per run without replaying history or cancellation', () => {
  let result = notificationTransitions(
    new Map(),
    [response({ status: 'completed' })],
    false,
  );
  assert.equal(result.notifications.length, 0);
  result = notificationTransitions(
    result.next,
    [response({ runId: 'two' }), response({ key: 'other/card' })],
    true,
  );
  assert.equal(result.notifications.length, 0);
  result = notificationTransitions(
    result.next,
    [
      response({ runId: 'two', status: 'warning' }),
      response({ key: 'other/card', status: 'fail' }),
    ],
    true,
  );
  assert.equal(result.notifications.length, 2);
  result = notificationTransitions(
    result.next,
    [response({ runId: 'two', status: 'completed' })],
    true,
  );
  assert.equal(result.notifications.length, 0);
  result = notificationTransitions(
    result.next,
    [response({ runId: 'three', status: 'warning', title: 'Canceled' })],
    true,
  );
  assert.equal(result.notifications.length, 0);
});

void test('notification links stay on the configured server', () => {
  const origin = 'http://localhost:3101';
  assert.equal(
    localNavigation('/projects/one/logs/card/run', origin),
    `${origin}/projects/one/logs/card/run`,
  );
  for (const url of [
    'https://example.com',
    '//example.com',
    'file:///tmp/a',
    'javascript:alert(1)',
    'http://localhost:3102',
    'http://user@localhost:3101',
  ]) {
    assert.equal(localNavigation(url, origin), null);
  }
});

async function fixture(t) {
  const home = await mkdtemp(path.join(tmpdir(), 'praxis-desktop-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, 'run'));
  const config = {
    root: home,
    node: process.execPath,
    mode: 'dev',
    port: 3101,
  };
  const state = { pid: 1234, startMarker: 'original' };
  const save = (value) =>
    writeFile(path.join(home, 'run/praxis-3101.json'), JSON.stringify(value));
  return { home, config, state, save };
}

void test('connecting and quitting does not stop a server started elsewhere', async (t) => {
  const f = await fixture(t);
  await f.save(f.state);
  const commands = [];
  const service = new DesktopService(f.config, f.home, async (_node, args) => {
    commands.push(args[1]);
    return { stdout: '  PID: 1234' };
  });
  assert.equal(await service.start(), 'connected');
  await service.stop();
  assert.deepEqual(commands, ['status']);
});

void test('desktop starts via the LAN-aware CLI and stops only the same owned process', async (t) => {
  const f = await fixture(t);
  const commands = [];
  const service = new DesktopService(f.config, f.home, async (_node, args) => {
    commands.push(args.slice(1));
    if (args[1] === 'status')
      throw Object.assign(new Error('not running'), {
        code: 1,
        stdout: 'No managed background Praxis server',
      });
    if (args[1] === 'dev') await f.save(f.state);
    return { stdout: '' };
  });
  assert.equal(await service.start(), 'started');
  assert.deepEqual(commands[1], ['dev', '--port', '3101', '-d', '--lan']);
  await f.save({ ...f.state, startMarker: 'replacement' });
  await assert.rejects(() => service.stop(), /replaced/);
  assert.equal(commands.length, 2);
  await f.save(f.state);
  await service.stop();
  assert.equal(commands.at(-1)[0], 'stop');
});

void test('response discovery reads modules and Cards without traversing historic packets', async (t) => {
  const f = await fixture(t);
  const planningPath = path.join(f.home, 'planning');
  await writeFile(
    path.join(f.home, 'config.json'),
    JSON.stringify({ projects: [{ name: 'Demo', planningPath }] }),
  );
  for (const relative of [
    'whats-next',
    'implementation/cards/card-a',
    'implementation/cards/card-a/00000001',
  ]) {
    await mkdir(path.join(planningPath, relative), { recursive: true });
    await writeFile(
      path.join(planningPath, relative, 'latest-response.json'),
      JSON.stringify(response()),
    );
  }
  assert.equal((await readResponses(f.home)).length, 2);
});
