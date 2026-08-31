import { githubReader } from '../lib/github-delivery.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  rename,
  realpath,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ensureCardWorkspace,
  verifyCardWorkspace,
  restartCardWorkspace,
} from '../lib/just-do-it-worktree.ts';
import { createExecutionService } from '../lib/just-do-it-execution-service.ts';
import {
  createPlanningService,
  type PlanningCard,
} from '../lib/just-do-it-planning-service.ts';
import { appendCardWorkRecord } from '../lib/just-do-it-worklog.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type {
  LocalAgentResult,
  startLocalAgentRun,
} from '../lib/local-agent-transport.ts';
import type { CardHarnessRequest } from '../lib/just-do-it-harness.ts';

const exec = promisify(execFile);
const git = async (directory: string, ...args: string[]) =>
  (await exec('git', ['-C', directory, ...args])).stdout.trim();
async function fixture(
  t: { after: (callback: () => Promise<void>) => void },
  reader = githubReader,
) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'card-worktrees-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const rootPath = path.join(base, 'project');
  const project: RegisteredProject = {
    id: randomUUID(),
    kind: 'standalone',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.agent-manager'),
    name: 'Fixture',
    description: '',
    createdAt: '',
  };
  await mkdir(project.planningPath, { recursive: true });
  const actions = [1, 2].map((n) => ({
    id: randomUUID(),
    title: `Action ${n}`,
    input: 'Workspace',
    output: 'Working file',
    validation: 'Check file',
    acceptanceCriteria: [
      {
        id: 'AC-01',
        criterion: 'Working output',
        passCondition: 'The expected output is readable',
        evidence: 'Output reference',
      },
    ],
  }));
  const card: PlanningCard = {
    schemaVersion: 1,
    id: randomUUID(),
    revision: 1,
    source: {
      module: 'whats-next',
      id: 'NODE-fixture',
      uid: randomUUID(),
      title: 'Fixture Card',
      summary: 'Test worktree isolation',
      dependsOn: [],
      derivedFrom: [],
      outputPaths: [],
    },
    sourceRef: 'source.md',
    requirements: '',
    resources: [],
    plan: { status: 'finalized', overview: 'Two steps', steps: actions },
    actions,
    run: null,
    createdAt: '',
    updatedAt: '',
    finalizedAt: new Date().toISOString(),
  };
  await appendCardWorkRecord(
    path.join(project.planningPath, 'implementation/cards'),
    card.id,
    0,
    {
      kind: 'system-event',
      stage: 'planning',
      actionId: null,
      event: 'plan-finalized',
      text: 'Fixture confirmation',
      refs: [],
    },
    { 'planning-state.json': JSON.stringify(card) },
  );
  const calls: Array<{
    options: Parameters<typeof startLocalAgentRun>[1];
    request: CardHarnessRequest;
    resolve: (result: LocalAgentResult) => void;
    reject: (error: Error) => void;
  }> = [];
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    const request = JSON.parse(
      options.prompt
        .split('\nREQUEST DATA')[1]
        .split(':\n')[1]
        .split('\n\nExecution runtime:')[0],
    );
    let resolve!: (result: LocalAgentResult) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<LocalAgentResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    calls.push({ options, request, resolve, reject });
    return { completion, cancel: () => reject(new Error('Fixture canceled')) };
  };
  const store = createPlanningService(undefined, new Map());
  let failResetPersistence = false;
  const service = createExecutionService(
    store,
    transport,
    new Map(),
    1800000,
    reader,
    undefined,
    async (...args) => {
      if (
        failResetPersistence &&
        args[3].kind === 'system-event' &&
        args[3].event === 'rollback-confirmed'
      )
        throw new Error('Fixture reset persistence failed');
      return appendCardWorkRecord(...args);
    },
  );
  const input = {
    cardId: card.id,
    actionId: actions[0].id,
    expectedRevision: 1,
    instruction: '',
    profile: {
      agent: 'codex' as const,
      model: 'fixture',
      effort: 'low' as const,
    },
  };
  async function settled() {
    for (let i = 0; i < 200; i++) {
      const current = await store.read(project, card.id);
      if (current.execution?.runs.at(-1)?.status !== 'running') return current;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Fixture did not settle');
  }
  return {
    project,
    card,
    actions,
    calls,
    store,
    service,
    input,
    settled,
    failReset: () => {
      failResetPersistence = true;
    },
  };
}
function delivered(request: CardHarnessRequest): LocalAgentResult {
  return {
    agentSessionId: 'fixture',
    usage: null,
    finalOutput: JSON.stringify({
      harnessRevision: request.harnessRevision,
      requestId: request.requestId,
      cardId: request.context.cardId,
      contextRevision: request.context.contextRevision,
      inputFingerprint: request.inputFingerprint,
      handoffSummary: 'Fixture file written',
      stage: 'execution',
      actionId: request.actionId,
      outcome: 'delivered',
      summary: 'File written in Card worktree',
      artifactRefs: ['file:app.txt'],
      checks: [
        {
          criterionId: 'AC-01',
          summary: 'Read app',
          status: 'passed',
          evidenceRefs: ['file:app.txt'],
        },
      ],
      remaining: [],
    }),
  };
}
void test('empty bootstrap needs explicit confirmation and Actions reuse one isolated Card worktree', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    () => f.service.start(f.project, f.input),
    /EMPTY_REPOSITORY_CONFIRMATION_REQUIRED/,
  );
  await assert.rejects(
    () => readFile(path.join(f.project.rootPath, '.git/HEAD')),
    /ENOENT/,
  );
  assert.equal(f.calls.length, 0);
  await f.service.start(f.project, { ...f.input, initializeRepository: true });
  const directory = f.calls[0].options.workingDirectory;
  assert.notEqual(directory, f.project.rootPath);
  const common = await realpath(path.join(f.project.rootPath, '.git'));
  assert.ok(
    f.calls[0].options.gitWritePaths?.includes(path.join(common, 'objects')),
  );
  assert.ok(!f.calls[0].options.gitWritePaths?.includes(common));
  assert.ok(
    !f.calls[0].options.gitWritePaths?.includes(path.join(common, 'HEAD')),
  );
  assert.ok(
    !f.calls[0].options.gitWritePaths?.includes(path.join(common, 'index')),
  );
  assert.ok(
    !f.calls[0].options.gitWritePaths?.includes(
      path.join(common, 'refs/heads/main'),
    ),
  );
  assert.equal(f.calls[0].options.protectedPath, f.project.planningPath);
  const main = await git(f.project.rootPath, 'rev-parse', 'HEAD');
  await writeFile(path.join(directory, 'app.txt'), 'first Action');
  f.calls[0].resolve(delivered(f.calls[0].request));
  let current = await f.settled();
  assert.equal(current.execution?.runs[0].status, 'succeeded');
  assert.equal(await git(f.project.rootPath, 'rev-parse', 'HEAD'), main);
  await assert.rejects(
    () => readFile(path.join(f.project.rootPath, 'app.txt')),
    /ENOENT/,
  );
  current = await f.service.update(
    f.project,
    f.card.id,
    current.revision,
    'accept',
    current.execution!.runs[0].id,
  );
  await f.service.start(f.project, {
    ...f.input,
    actionId: f.actions[1].id,
    expectedRevision: current.revision,
  });
  assert.equal(f.calls[1].options.workingDirectory, directory);
  assert.equal(
    await readFile(path.join(directory, 'app.txt'), 'utf8'),
    'first Action',
  );
  await writeFile(path.join(directory, 'app.txt'), 'second Action');
  f.calls[1].resolve(delivered(f.calls[1].request));
  current = await f.settled();
  assert.equal(current.execution?.runs[1].status, 'succeeded');
  assert.equal(current.execution?.workspace?.path, directory);
});
void test('different Cards have distinct branches, and dirty primary checkout content is never copied or overwritten', async (t) => {
  const f = await fixture(t);
  const first = await ensureCardWorkspace(f.project, f.card, true);
  await writeFile(
    path.join(f.project.rootPath, 'personal.txt'),
    'primary only',
  );
  await git(f.project.rootPath, 'add', 'personal.txt');
  const before = await git(f.project.rootPath, 'diff', '--cached');
  const other = { ...f.card, id: randomUUID() };
  await mkdir(
    path.join(f.project.planningPath, 'implementation/cards', other.id),
  );
  const second = await ensureCardWorkspace(f.project, other);
  assert.notEqual(first.path, second.path);
  assert.notEqual(first.branch, second.branch);
  await assert.rejects(
    () => readFile(path.join(second.path, 'personal.txt')),
    /ENOENT/,
  );
  assert.equal(await git(f.project.rootPath, 'diff', '--cached'), before);
  assert.equal(
    await readFile(path.join(f.project.rootPath, 'personal.txt'), 'utf8'),
    'primary only',
  );
});
void test('failed Card restart preserves untracked and ignored files plus history and never auto-starts', async (t) => {
  const f = await fixture(t);
  await f.service.start(f.project, { ...f.input, initializeRepository: true });
  const directory = f.calls[0].options.workingDirectory;
  await writeFile(path.join(directory, 'app.txt'), 'partial');
  await mkdir(path.join(directory, 'node_modules'));
  await writeFile(
    path.join(directory, 'node_modules/keep.bin'),
    'ignored output',
  );
  f.calls[0].reject(new Error('Fixture failed'));
  let current = await f.settled();
  await f.service.resetWorkspace(f.project, f.card.id, current.revision);
  const preview = (
    await f.service.resetWorkspace(f.project, f.card.id, current.revision)
  ).preview!;
  await writeFile(path.join(directory, 'app.txt'), 'later edit');
  await assert.rejects(
    () =>
      f.service.resetWorkspace(
        f.project,
        f.card.id,
        current.revision,
        preview.token,
      ),
    /Workspace changed/,
  );
  const freshPreview = (
    await f.service.resetWorkspace(f.project, f.card.id, current.revision)
  ).preview!;
  current = (
    await f.service.resetWorkspace(
      f.project,
      f.card.id,
      current.revision,
      freshPreview.token,
    )
  ).card!;
  assert.equal(current.execution?.runs.length, 0);
  assert.equal(current.plan?.status, 'finalized');
  assert.equal(f.calls.length, 1);
  assert.notEqual(current.execution?.workspace?.path, directory);
  const backup = current.execution!.workspaceBackups![0];
  assert.equal(
    await readFile(path.join(backup.path, 'app.txt'), 'utf8'),
    'later edit',
  );
  assert.equal(
    await readFile(path.join(backup.path, 'node_modules/keep.bin'), 'utf8'),
    'ignored output',
  );
  await verifyCardWorkspace(backup);
  await assert.rejects(
    () => readFile(path.join(current.execution!.workspace!.path, 'app.txt')),
    /ENOENT/,
  );
  await f.service.start(f.project, {
    ...f.input,
    expectedRevision: current.revision,
  });
  assert.equal(f.calls.length, 2);
  f.calls[1].reject(new Error('Fixture ends'));
  await f.settled();
});
void test('missing and branch-switched worktrees block continuation rather than silently changing directories', async (t) => {
  const f = await fixture(t);
  const workspace = await ensureCardWorkspace(f.project, f.card, true);
  await git(workspace.path, 'checkout', '-b', 'unexpected');
  await assert.rejects(
    () => ensureCardWorkspace(f.project, f.card),
    /identity changed/,
  );
  await git(workspace.path, 'checkout', workspace.branch);
  await rename(workspace.path, workspace.path + '-missing');
  await assert.rejects(() => ensureCardWorkspace(f.project, f.card), /ENOENT/);
});
void test('already merged Card commits cannot be reset as unmerged work', async (t) => {
  const f = await fixture(t);
  const workspace = await ensureCardWorkspace(f.project, f.card, true);
  await writeFile(path.join(workspace.path, 'app.txt'), 'delivered');
  await git(workspace.path, 'add', 'app.txt');
  await git(
    workspace.path,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'delivered',
  );
  await git(f.project.rootPath, 'merge', '--ff-only', workspace.branch);
  await assert.rejects(
    () =>
      restartCardWorkspace(f.project, {
        ...f.card,
        execution: { workspace, runs: [], acceptedActionIds: [] },
      }),
    /already in the primary/,
  );
});

void test('empty remote permits local reset without requiring a remote default branch', async (t) => {
  const f = await fixture(t, {
    repository: async () => {
      throw new Error('No default branch');
    },
    pullRequest: async () => {
      throw new Error('No PR');
    },
    branchPullRequests: async () => [],
  });
  await f.service.start(f.project, { ...f.input, initializeRepository: true });
  await git(
    f.calls[0].options.workingDirectory,
    'remote',
    'add',
    'origin',
    'https://github.com/example/empty',
  );
  f.calls[0].reject(new Error('Failed before first push'));
  const current = await f.settled();
  const preview = (
    await f.service.resetWorkspace(f.project, f.card.id, current.revision)
  ).preview!;
  assert.equal(preview.repositoryUrl, 'https://github.com/example/empty');
  const reset = (
    await f.service.resetWorkspace(
      f.project,
      f.card.id,
      current.revision,
      preview.token,
    )
  ).card!;
  assert.equal(reset.execution?.runs.length, 0);
});

void test('reset persistence failure restores the previous active worktree and state', async (t) => {
  const f = await fixture(t);
  await f.service.start(f.project, { ...f.input, initializeRepository: true });
  const directory = f.calls[0].options.workingDirectory;
  await writeFile(path.join(directory, 'app.txt'), 'must survive');
  f.calls[0].reject(new Error('Fixture failure'));
  const current = await f.settled();
  const preview = (
    await f.service.resetWorkspace(f.project, f.card.id, current.revision)
  ).preview!;
  f.failReset();
  await assert.rejects(
    () =>
      f.service.resetWorkspace(
        f.project,
        f.card.id,
        current.revision,
        preview.token,
      ),
    /persistence failed/,
  );
  assert.equal(
    await readFile(path.join(directory, 'app.txt'), 'utf8'),
    'must survive',
  );
  assert.equal(
    (await f.store.read(f.project, f.card.id)).revision,
    current.revision,
  );
  const existing = await ensureCardWorkspace(f.project, current);
  assert.equal(existing.path, directory);
});

void test('sidecar write failure during reset does not strand the old worktree path', async (t) => {
  const f = await fixture(t);
  const workspace = await ensureCardWorkspace(f.project, f.card, true);
  const sidecar = path.join(
    f.project.planningPath,
    'implementation/cards',
    f.card.id,
    'workspace.json',
  );
  await rename(sidecar, sidecar + '.saved');
  await mkdir(sidecar);
  await assert.rejects(() =>
    restartCardWorkspace(f.project, {
      ...f.card,
      execution: { workspace, runs: [], acceptedActionIds: [] },
    }),
  );
  await verifyCardWorkspace(workspace);
  await rm(sidecar, { recursive: true });
  await rename(sidecar + '.saved', sidecar);
  assert.equal(
    (await ensureCardWorkspace(f.project, f.card)).path,
    workspace.path,
  );
});
