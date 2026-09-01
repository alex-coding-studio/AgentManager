import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  createSystemValidationFixPacket,
  runSystemValidation,
} from '../lib/system-validation-runner.ts';

const execute = promisify(execFile);

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'system-validation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  await execute('git', ['init', '-q', '--initial-branch=main', workspace]);
  await execute('git', ['-C', workspace, 'config', 'user.name', 'Fixture']);
  await execute('git', [
    '-C',
    workspace,
    'config',
    'user.email',
    'fixture@example.invalid',
  ]);
  await writeFile(path.join(workspace, 'input.txt'), 'input\n');
  await execute('git', ['-C', workspace, 'add', 'input.txt']);
  await execute('git', ['-C', workspace, 'commit', '-q', '-m', 'input']);
  const candidateSha = (
    await execute('git', ['-C', workspace, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  return { root, workspace, candidateSha };
}

void test('System validation caches an exact candidate result', async (t) => {
  const f = await fixture(t);
  const counter = path.join(f.root, 'counter.txt');
  const request = {
    projectId: 'project',
    cardId: 'card',
    candidateSha: f.candidateSha,
    workspace: f.workspace,
    cacheRoot: path.join(f.root, 'cache'),
    environmentFingerprint: 'xcode-fixture',
    profile: {
      id: 'required',
      executable: process.execPath,
      arguments: [
        '-e',
        `require('fs').appendFileSync(${JSON.stringify(counter)},'run\\n')`,
      ],
      blocking: true,
      resource: 'build',
    },
  };
  const first = await runSystemValidation(request);
  const second = await runSystemValidation(request);
  assert.equal(first.status, 'passed');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal((await readFile(counter, 'utf8')).trim().split('\n').length, 1);
});

void test('Optional failed UI run creates at most one bounded Fix Packet', async (t) => {
  const f = await fixture(t);
  const result = await runSystemValidation({
    projectId: 'project',
    cardId: 'card',
    candidateSha: f.candidateSha,
    workspace: f.workspace,
    cacheRoot: path.join(f.root, 'cache'),
    environmentFingerprint: 'simulator-fixture',
    profile: {
      id: 'ui-regression',
      executable: process.execPath,
      arguments: ['-e', 'process.exit(3)'],
      blocking: false,
      resource: 'ios-simulator',
      testIds: ['AppUITests/Journey/testFlow'],
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.blocking, false);
  const packet = createSystemValidationFixPacket(result, 0);
  assert.equal(packet?.repairAttempt, 1);
  assert.deepEqual(packet?.failedTestIds, ['AppUITests/Journey/testFlow']);
  assert.equal(createSystemValidationFixPacket(result, 1), null);
});

void test('System validation rejects stale or dirty candidates', async (t) => {
  const f = await fixture(t);
  const request = {
    projectId: 'project',
    cardId: 'card',
    candidateSha: '0'.repeat(40),
    workspace: f.workspace,
    cacheRoot: path.join(f.root, 'cache'),
    environmentFingerprint: 'fixture',
    profile: {
      id: 'required',
      executable: process.execPath,
      arguments: ['-e', ''],
      blocking: true,
      resource: 'build',
    },
  };
  await assert.rejects(runSystemValidation(request), /stale/);
  await writeFile(path.join(f.workspace, 'dirty.txt'), 'dirty');
  await assert.rejects(
    runSystemValidation({ ...request, candidateSha: f.candidateSha }),
    /clean candidate/,
  );
});
