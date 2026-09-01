import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  prepareCardEnvironment,
  publishCardCandidate,
  type HostCommandRunner,
} from '../lib/card-host-operations.ts';
import type { CardWorkspace } from '../lib/just-do-it-worktree.ts';

const execute = promisify(execFile);

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'card-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repository');
  const workspacePath = path.join(root, 'workspace');
  await mkdir(repository);
  await execute('git', ['init', '-q', '--initial-branch=main', repository]);
  await execute('git', ['-C', repository, 'config', 'user.name', 'Agent Bot']);
  await execute('git', [
    '-C',
    repository,
    'config',
    'user.email',
    'agent@example.invalid',
  ]);
  await writeFile(path.join(repository, 'README.md'), 'base\n');
  await execute('git', ['-C', repository, 'add', 'README.md']);
  await execute('git', ['-C', repository, 'commit', '-q', '-m', 'base']);
  const baseSha = (
    await execute('git', ['-C', repository, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  const branch = 'agentmanager/card-fixture';
  await execute('git', [
    '-C',
    repository,
    'worktree',
    'add',
    '-q',
    '-b',
    branch,
    workspacePath,
    baseSha,
  ]);
  const common = (
    await execute('git', [
      '-C',
      repository,
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
  ).stdout.trim();
  const workspace: CardWorkspace = {
    path: await realpath(workspacePath),
    repository: await realpath(repository),
    branch,
    baseCommit: baseSha,
    gitDirectory: await realpath(common),
  };
  return { root, repository, workspace, baseSha };
}

function runner(state: {
  headSha?: string;
  created?: boolean;
}): HostCommandRunner {
  return async (command, arguments_, options) => {
    if (command === 'git') {
      if (arguments_.includes('push')) return '';
      return (
        await execute(command, arguments_, {
          cwd: options?.cwd,
          env: options?.env,
        })
      ).stdout.trim();
    }
    assert.equal(command, 'gh');
    const joined = arguments_.join(' ');
    if (joined === 'api user --jq .login') return 'agent-bot';
    if (joined.includes('.permissions.push')) return 'true';
    if (arguments_[0] === 'pr' && arguments_[1] === 'create') {
      state.created = true;
      return 'https://github.com/example/repository/pull/7';
    }
    if (arguments_[0] === 'pr' && arguments_[1] === 'list')
      return state.created
        ? JSON.stringify([
            {
              number: 7,
              url: 'https://github.com/example/repository/pull/7',
              state: 'OPEN',
              isDraft: true,
              headRefOid: state.headSha,
            },
          ])
        : '[]';
    throw new Error(`Unexpected command: ${command} ${joined}`);
  };
}

void test('Environment Manifest is reusable and records Host-verified facts', async (t) => {
  const f = await fixture(t);
  const outputPath = path.join(f.root, 'environment.json');
  const state = {};
  const intercepted = runner(state);
  const environment = await prepareCardEnvironment(
    {
      cardId: 'card-fixture',
      projectId: 'project-fixture',
      workspace: f.workspace,
      roles: {
        commit: 'agent-bot',
        delivery: 'bot',
        approval: 'user',
        expectedGitHubLogin: 'agent-bot',
      },
      outputPath,
    },
    async (command, arguments_, options) => {
      if (arguments_.includes('get-url'))
        return 'https://github.com/example/repository.git';
      if (arguments_.includes('symbolic-ref')) return 'origin/main';
      return intercepted(command, arguments_, options);
    },
  );
  assert.equal(environment.workspace.headSha, f.baseSha);
  assert.equal(environment.workspace.clean, true);
  assert.equal(environment.repository.defaultBranch, 'main');
  assert.equal(environment.git.authorName, 'Agent Bot');
  const repeated = await prepareCardEnvironment(
    {
      cardId: 'card-fixture',
      projectId: 'project-fixture',
      workspace: f.workspace,
      roles: environment.roles,
      outputPath,
    },
    async (command, arguments_, options) => {
      if (arguments_.includes('get-url'))
        return 'https://github.com/example/repository.git';
      if (arguments_.includes('symbolic-ref')) return 'origin/main';
      return intercepted(command, arguments_, options);
    },
  );
  assert.equal(repeated.environmentId, environment.environmentId);
  assert.equal(
    JSON.parse(await readFile(outputPath, 'utf8')).environmentId,
    environment.environmentId,
  );
});

void test('Candidate Publisher handles multiple commits as one idempotent HEAD', async (t) => {
  const f = await fixture(t);
  const state: { headSha?: string; created?: boolean } = {};
  const intercepted = runner(state);
  const environment = await prepareCardEnvironment(
    {
      cardId: 'card-fixture',
      projectId: 'project-fixture',
      workspace: f.workspace,
      roles: {
        commit: 'agent-bot',
        delivery: 'bot',
        approval: 'user',
        expectedGitHubLogin: 'agent-bot',
      },
    },
    async (command, arguments_, options) => {
      if (arguments_.includes('get-url'))
        return 'https://github.com/example/repository.git';
      if (arguments_.includes('symbolic-ref')) return 'origin/main';
      return intercepted(command, arguments_, options);
    },
  );
  for (const [file, content] of [
    ['one.txt', 'one'],
    ['two.txt', 'two'],
  ]) {
    await writeFile(path.join(f.workspace.path, file), content);
    await execute('git', ['-C', f.workspace.path, 'add', file]);
    await execute('git', [
      '-C',
      f.workspace.path,
      'commit',
      '-q',
      '-m',
      `add ${file}`,
    ]);
  }
  state.headSha = (
    await execute('git', ['-C', f.workspace.path, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  const request = {
    environment,
    actionId: 'action-1',
    roundId: 'round-1',
    baseSha: f.baseSha,
    headSha: state.headSha,
    title: 'Candidate',
    body: 'Candidate body',
    draft: true,
  };
  const publication = await publishCardCandidate(request, intercepted);
  assert.equal(publication.commitCount, 2);
  assert.deepEqual(publication.changedFiles, ['one.txt', 'two.txt']);
  assert.equal(publication.pullRequest.number, 7);
  const repeated = await publishCardCandidate(request, intercepted);
  assert.equal(repeated.candidateId, publication.candidateId);
  assert.equal(repeated.pullRequest.number, 7);
});

void test('Candidate Publisher rejects generated output before GitHub writes', async (t) => {
  const f = await fixture(t);
  const state: { headSha?: string; created?: boolean } = {};
  const intercepted = runner(state);
  const environment = await prepareCardEnvironment(
    {
      cardId: 'card-fixture',
      projectId: 'project-fixture',
      workspace: f.workspace,
      roles: {
        commit: 'agent-bot',
        delivery: 'bot',
        approval: 'user',
      },
    },
    async (command, arguments_, options) => {
      if (arguments_.includes('get-url'))
        return 'https://github.com/example/repository.git';
      if (arguments_.includes('symbolic-ref')) return 'origin/main';
      return intercepted(command, arguments_, options);
    },
  );
  await mkdir(path.join(f.workspace.path, 'build'));
  await writeFile(path.join(f.workspace.path, 'build/output.txt'), 'generated');
  await execute('git', [
    '-C',
    f.workspace.path,
    'add',
    '-f',
    'build/output.txt',
  ]);
  await execute('git', [
    '-C',
    f.workspace.path,
    'commit',
    '-q',
    '-m',
    'generated',
  ]);
  state.headSha = (
    await execute('git', ['-C', f.workspace.path, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  await assert.rejects(
    publishCardCandidate(
      {
        environment,
        actionId: 'action-1',
        roundId: 'round-1',
        baseSha: f.baseSha,
        headSha: state.headSha,
        title: 'Candidate',
        body: 'Candidate body',
        draft: true,
      },
      intercepted,
    ),
    /generated or secret files/,
  );
  assert.equal(state.created, undefined);
});
