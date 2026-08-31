import { repositoryDefaultBranch } from '../lib/github-delivery.ts';
import { summarizeGitHub } from '../lib/github-delivery-summary.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  getGitHubRepositoryUrl,
  type RegisteredProject,
} from '../lib/project-registry.ts';
import {
  discoverGitHubDelivery,
  refreshGitHubDelivery,
  mergedDeliveryMatches,
  mentionedPullRequests,
  type GitHubReader,
  type GitHubPullRequest,
} from '../lib/github-delivery.ts';

const repo = 'example/fixture';
const url = `https://github.com/${repo}`;
const hash = 'a'.repeat(40);
const pr = (number = 1, headRefOid = hash): GitHubPullRequest => ({
  number,
  url: `${url}/pull/${number}`,
  title: `Output ${number}`,
  state: 'OPEN',
  isDraft: false,
  headRefOid,
  headRefName: 'feature',
  baseRefName: 'main',
  mergedAt: null,
});
const reader: GitHubReader = {
  repository: async () => 'main',
  pullRequest: async (_, number) => pr(number),
  branchPullRequests: async () => [pr()],
};
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'jdi-github-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'fixture',
    name: 'Fixture',
    description: '',
    kind: 'standalone',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.agent-manager'),
    createdAt: '',
  };
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', rootPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  return { project, git };
}
void test('standalone discovery detects a newly initialized repository without reconnecting and rejects an enclosing repository', async (t) => {
  const { project, git } = await fixture(t);
  assert.equal(getGitHubRepositoryUrl(project), null);
  git('init', '-b', 'feature');
  git('remote', 'add', 'origin', `git@github.com:${repo}.git`);
  assert.equal(getGitHubRepositoryUrl(project), url);
  const child = path.join(project.rootPath, 'child');
  await mkdir(child);
  assert.equal(getGitHubRepositoryUrl({ ...project, rootPath: child }), null);
  git('remote', 'set-url', 'origin', 'https://gitlab.com/example/fixture');
  assert.equal(getGitHubRepositoryUrl(project), null);
});
void test('reported PR links keep multiple independently verified associations without requiring one output HEAD', async (t) => {
  const { project, git } = await fixture(t);
  git('init', '-b', 'feature');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  );
  git('remote', 'add', 'origin', `${url}.git`);
  const head = git('rev-parse', 'HEAD');
  const output = `${url}/pull/1 ${url}/pull/2 https://github.com/other/repo/pull/3`;
  const delivery = await discoverGitHubDelivery(
    project,
    output,
    null,
    reader,
    head,
  );
  assert.deepEqual(
    delivery?.pullRequests.map((p) => p.number),
    [1, 2],
  );
  assert.equal(delivery?.outputHead, head);
  assert.equal(delivery?.cleanAtOutput, true);
  assert.equal(mergedDeliveryMatches(delivery!), false);
  await writeFile(path.join(project.rootPath, 'user.txt'), 'keep');
  assert.equal(
    (await discoverGitHubDelivery(project, output, null, reader, head))
      ?.cleanAtOutput,
    false,
  );
  assert.equal(
    (await discoverGitHubDelivery(project, output, null, reader, hash))
      ?.outputHead,
    null,
  );
});
void test('branch discovery requires changed output HEAD and unambiguous exact branch and commit', async (t) => {
  const { project, git } = await fixture(t);
  git('init', '-b', 'feature');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  );
  git('remote', 'add', 'origin', url);
  const head = git('rev-parse', 'HEAD');
  const matching = { ...reader, branchPullRequests: async () => [pr(1, head)] };
  assert.equal(
    (await discoverGitHubDelivery(project, '', null, matching))?.pullRequests
      .length,
    1,
  );
  assert.equal(
    (await discoverGitHubDelivery(project, '', head, matching))?.pullRequests
      .length,
    0,
  );
  assert.equal(
    (await discoverGitHubDelivery(project, '', null, reader))?.pullRequests
      .length,
    0,
  );
  assert.equal(
    (
      await discoverGitHubDelivery(project, '', null, {
        ...reader,
        branchPullRequests: async () => [pr(1, head), pr(2, head)],
      })
    )?.pullRequests.length,
    0,
  );
});
void test('failed discovery can retry frozen references and refresh failures keep explicitly stale remote evidence', async (t) => {
  const { project, git } = await fixture(t);
  git('init', '-b', 'feature');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  );
  git('remote', 'add', 'origin', url);
  const inaccessible = {
    ...reader,
    repository: async (): Promise<string> => {
      throw new Error('No login');
    },
  };
  const failed = await discoverGitHubDelivery(
    project,
    `${url}/pull/1`,
    null,
    inaccessible,
  );
  assert.ok(failed?.error);
  const recovered = await refreshGitHubDelivery(failed!, reader);
  assert.equal(recovered.error, null);
  assert.equal(recovered.pullRequests.length, 1);
  const merged = await refreshGitHubDelivery(recovered, {
    ...reader,
    pullRequest: async () => ({
      ...pr(1, recovered.outputHead!),
      state: 'MERGED',
      mergedAt: '2026-08-30T12:00:00Z',
    }),
  });
  assert.equal(mergedDeliveryMatches(merged), true);
  const stale = await refreshGitHubDelivery(merged, inaccessible);
  assert.deepEqual(stale.pullRequests, merged.pullRequests);
  assert.ok(stale.error);
  assert.equal(mergedDeliveryMatches(stale), false);
  const advanced = await refreshGitHubDelivery(merged, {
    ...reader,
    pullRequest: async () => ({
      ...pr(),
      state: 'MERGED',
      mergedAt: '2026-08-30T12:00:00Z',
    }),
  });
  assert.equal(mergedDeliveryMatches(advanced), false);
  const closed = await refreshGitHubDelivery(merged, {
    ...reader,
    pullRequest: async () => ({ ...pr(), state: 'CLOSED' }),
  });
  assert.equal(mergedDeliveryMatches(closed), false);
  const wrong = await refreshGitHubDelivery(merged, {
    ...reader,
    pullRequest: async () => pr(2),
  });
  assert.ok(wrong.error);
});
void test('PR extraction excludes foreign repos, duplicate links, and unsafe integers', () => {
  assert.deepEqual(
    mentionedPullRequests(
      url,
      `${url}/pull/1 ${url}/pull/1 ${url}/pull/2 ${url}/pull/999999999999999999999 https://github.com/other/repo/pull/3`,
    ),
    [1, 2],
  );
});

void test('Card summary uses newest query evidence even when an earlier round was refreshed', () => {
  const base = {
    repositoryUrl: url,
    outputHead: hash,
    outputBranch: 'feature',
    cleanAtOutput: true,
    requestedNumbers: [1],
    defaultBranch: 'main',
    error: null,
  };
  const result = summarizeGitHub([
    {
      github: {
        ...base,
        checkedAt: '2026-08-30T12:00:00Z',
        error: 'Offline',
        pullRequests: [
          { ...pr(), state: 'MERGED', mergedAt: '2026-08-30T11:00:00Z' },
        ],
      },
    },
    {
      github: {
        ...base,
        checkedAt: '2026-08-30T10:00:00Z',
        pullRequests: [pr()],
      },
    },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].pr.state, 'MERGED');
  assert.equal(result[0].stale, true);
});

void test('an empty remote remains valid repository evidence; unknown URLs and failed lookups do not', async (t) => {
  const { verifiedGitHubArtifactRefs } =
    await import('../lib/github-delivery.ts');
  const { project, git } = await fixture(t);
  git('init', '-b', 'feature');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  );
  git('remote', 'add', 'origin', url);
  const empty = {
    ...reader,
    repository: async () => null,
    branchPullRequests: async () => [],
  };
  const delivery = await discoverGitHubDelivery(project, '', null, empty);
  assert.equal(delivery?.error, null);
  assert.equal(delivery?.defaultBranch, null);
  assert.deepEqual(
    await verifiedGitHubArtifactRefs(
      project,
      [url, 'https://github.com/other/repo', 'command:fake'],
      hash,
      empty,
    ),
    [url],
  );
  assert.deepEqual(
    await verifiedGitHubArtifactRefs(project, [url], hash, {
      ...reader,
      repository: async () => {
        throw new Error('Unavailable');
      },
    }),
    [],
  );
  assert.deepEqual(
    await verifiedGitHubArtifactRefs(
      project,
      [`${url}/pull/1`],
      'b'.repeat(40),
      reader,
    ),
    [],
  );
});

void test('GitHub CLI empty repository response with an empty branch name is valid', () => {
  const metadata = { nameWithOwner: repo, url, isEmpty: true };
  assert.equal(
    repositoryDefaultBranch(repo, {
      ...metadata,
      defaultBranchRef: { name: '' },
    }),
    null,
  );
  assert.equal(
    repositoryDefaultBranch(repo, { ...metadata, defaultBranchRef: null }),
    null,
  );
  assert.throws(
    () =>
      repositoryDefaultBranch(repo, {
        ...metadata,
        isEmpty: false,
        defaultBranchRef: null,
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      repositoryDefaultBranch(repo, {
        ...metadata,
        url: 'https://github.com/other/repo',
        defaultBranchRef: null,
      }),
    /identity/,
  );
});
