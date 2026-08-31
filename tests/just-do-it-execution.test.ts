import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  utimes,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { githubReader } from '../lib/github-delivery.ts';
import {
  checkpointWorkspace,
  includeInGitHistory,
  readCheckpointDiff,
} from '../lib/just-do-it-git.ts';
import { createExecutionService } from '../lib/just-do-it-execution-service.ts';
import {
  createPlanningService,
  savePlanningInstructions,
  type PlanningCard,
} from '../lib/just-do-it-planning-service.ts';
import { appendCardWorkRecord } from '../lib/just-do-it-worklog.ts';
import {
  captureLocalAcceptanceArtifacts,
  observedChanges,
  snapshotWorkspace,
} from '../lib/just-do-it-artifacts.ts';
import {
  buildCodexArguments,
  buildClaudeArguments,
  type LocalAgentRun,
  type LocalAgentResult,
  type startLocalAgentRun,
} from '../lib/local-agent-transport.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type { CardHarnessRequest } from '../lib/just-do-it-harness.ts';
import { CoordinationRunError } from '../lib/just-do-it-coordination-runner.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const one = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const two = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  reader = githubReader,
) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'jdi-execution-test-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id,
    name: 'Execution fixture',
    kind: 'standalone',
    rootPath,
    planningPath: path.join(rootPath, '.agent-manager'),
    codePath: null,
    description: '',
    createdAt: new Date().toISOString(),
  };
  await mkdir(project.planningPath);
  const actions = [one, two].map((id, index) => ({
    id,
    title: `Step ${index + 1}`,
    input: 'Current project',
    output: 'A working file',
    validation: 'Read its contents',
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
    id,
    revision: 1,
    source: {
      module: 'whats-next',
      id: 'NODE-aaaaaaaa',
      uid: id,
      title: 'Coding fixture',
      summary: 'Write a tiny module',
      dependsOn: [],
      derivedFrom: [],
      outputPaths: [],
    },
    sourceRef: `implementation/cards/${id}/00000001/source.md`,
    planRef: `implementation/cards/${id}/00000001/plan.md`,
    requirements: 'Use local files only.',
    resources: [],
    plan: {
      status: 'finalized',
      overview: 'Two independent deliveries in sequence.',
      steps: actions,
    },
    actions,
    run: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finalizedAt: new Date().toISOString(),
  };
  await appendCardWorkRecord(
    path.join(project.planningPath, 'implementation/cards'),
    id,
    0,
    {
      kind: 'system-event',
      stage: 'planning',
      actionId: null,
      event: 'plan-finalized',
      text: 'Fixture user confirmed Plan.',
      refs: [],
    },
    {
      'planning-state.json': JSON.stringify(card),
      'source.md': 'Coding fixture',
      'plan.md': JSON.stringify(card.plan),
    },
  );
  const store = createPlanningService(undefined, new Map());
  const calls: Array<{
    request: CardHarnessRequest;
    options: Parameters<typeof startLocalAgentRun>[1];
    resolve: (result: LocalAgentResult) => void;
    reject: (error: Error) => void;
    canceled: boolean;
  }> = [];
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    const request = JSON.parse(
      options.prompt
        .split('\nREQUEST DATA')[1]
        .split(':\n')[1]
        .split('\n\nExecution runtime:')[0],
    ) as CardHarnessRequest;
    let resolve!: (result: LocalAgentResult) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<LocalAgentResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const call = { request, options, resolve, reject, canceled: false };
    calls.push(call);
    return {
      completion,
      cancel: () => {
        call.canceled = true;
        reject(new Error('Canceled'));
      },
    } as LocalAgentRun;
  };
  const service = createExecutionService(
    store,
    transport,
    new Map(),
    1800000,
    reader,
    async () => undefined,
    undefined,
    (input) => input.transport!(input.workerAgent, input.workerOptions),
  );
  const input = {
    cardId: id,
    actionId: one,
    expectedRevision: 1,
    instruction: 'Create the first module',
    profile: {
      agent: 'codex' as const,
      model: 'test-model',
      effort: 'low' as const,
    },
  };
  return { project, card, store, service, transport, calls, input };
}

function delivered(
  request: CardHarnessRequest,
  refs = ['file:module.txt'],
): LocalAgentResult {
  return {
    agentSessionId: 'fixture-session',
    usage: null,
    finalOutput: JSON.stringify({
      harnessRevision: request.harnessRevision,
      requestId: request.requestId,
      cardId: id,
      contextRevision: request.context.contextRevision,
      inputFingerprint: request.inputFingerprint,
      handoffSummary: 'Preserve the user choice: compact display.',
      stage: 'execution',
      actionId: request.actionId,
      outcome: 'delivered',
      summary: 'The module is ready for user validation.',
      artifactRefs: refs,
      checks: [
        {
          criterionId: 'AC-01',
          summary: 'Read the file',
          status: 'passed',
          evidenceRefs: refs,
        },
      ],
      remaining: [],
    }),
  };
}
async function settled(
  store: ReturnType<typeof createPlanningService>,
  project: RegisteredProject,
) {
  for (let i = 0; i < 100; i++) {
    const card = await store.read(project, id);
    if (card.execution?.runs.at(-1)?.status !== 'running') return card;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Fixture did not settle.');
}

void test('coding output persists, feedback creates another round, and only user acceptance unlocks the next Action', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await savePlanningInstructions(project, 'Use local development rules.');
  await assert.rejects(
    () => service.start(project, { ...input, actionId: two }),
    /first unaccepted/,
  );
  let card = await service.start(project, input);
  assert.equal(calls[0].options.access, 'workspace-write');
  assert.equal(calls[0].options.protectedPath, project.planningPath);
  assert.equal(
    calls[0].request.context.moduleInstructions,
    'Use local development rules.',
  );
  await assert.rejects(
    () => service.start(project, { ...input, expectedRevision: card.revision }),
    /running Action/,
  );
  await writeFile(path.join(project.rootPath, 'module.txt'), 'first');
  calls[0].resolve(delivered(calls[0].request));
  card = await settled(store, project);
  assert.equal(
    card.execution?.runs[0].status,
    'succeeded',
    card.execution?.runs[0].error ?? '',
  );
  assert.match(card.execution!.git!.baseline, /^[0-9a-f]{40}$/);
  assert.match(card.execution!.runs[0].commit!, /^[0-9a-f]{40}$/);
  assert.equal(
    card.execution!.runs[0].parentCommit,
    card.execution!.git!.baseline,
  );
  assert.deepEqual(card.execution?.acceptedActionIds, []);
  await assert.rejects(
    () => store.update(project, id, card.revision, 'reopen'),
    /rollback/,
  );
  await assert.rejects(
    () =>
      service.start(project, {
        ...input,
        expectedRevision: card.revision,
        actionId: two,
      }),
    /first unaccepted/,
  );
  card = await service.start(project, {
    ...input,
    expectedRevision: card.revision,
    instruction: 'Use a compact display.',
  });
  assert.equal(
    calls[1].request.context.currentOutput?.id,
    calls[0].request.requestId,
  );
  await writeFile(path.join(project.rootPath, 'module.txt'), 'compact');
  calls[1].resolve(delivered(calls[1].request));
  card = await settled(store, project);
  const gitDir = path.join(
    project.planningPath,
    'implementation/cards',
    id,
    'versions.git',
  );
  const git = promisify(execFile);
  assert.equal(
    (
      await git('git', [
        '--git-dir',
        gitDir,
        'show',
        `${card.execution!.runs[0].commit}:module.txt`,
      ])
    ).stdout,
    'first',
  );
  assert.equal(
    (
      await git('git', [
        '--git-dir',
        gitDir,
        'show',
        `${card.execution!.runs[1].commit}:module.txt`,
      ])
    ).stdout,
    'compact',
  );
  assert.equal(
    card.execution!.runs[1].parentCommit,
    card.execution!.runs[0].commit,
  );
  await assert.rejects(
    () =>
      service.update(
        project,
        id,
        card.revision,
        'accept',
        calls[0].request.requestId,
      ),
    /output changed/,
  );
  card = await service.update(
    project,
    id,
    card.revision,
    'accept',
    calls[1].request.requestId,
  );
  assert.deepEqual(card.execution?.acceptedActionIds, [one]);
  const fresh = createPlanningService(undefined, new Map());
  assert.equal((await fresh.read(project, id)).execution?.runs.length, 2);
  await service.start(project, {
    ...input,
    expectedRevision: card.revision,
    actionId: two,
  });
  assert.ok(
    calls[2].request.context.resources.some((item) =>
      item.description.startsWith('Accepted Action'),
    ),
  );
  assert.match(calls[2].request.context.handoffMarkdown, /compact display/);
  calls[2].reject(new Error('Stop fixture'));
  await settled(store, project);
});

void test('cancellation preserves partial files and never accepts late output', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  let card = await service.start(project, input);
  await writeFile(path.join(project.rootPath, 'partial.txt'), 'partial');
  card = await service.update(
    project,
    id,
    card.revision,
    'cancel',
    calls[0].request.requestId,
  );
  assert.equal(card.execution?.runs[0].status, 'canceled');
  assert.match(card.execution!.runs[0].commit!, /^[0-9a-f]{40}$/);
  assert.equal(calls[0].canceled, true);
  assert.equal(
    await readFile(path.join(project.rootPath, 'partial.txt'), 'utf8'),
    'partial',
  );
  assert.deepEqual(
    (await store.read(project, id)).execution?.acceptedActionIds,
    [],
  );
});

void test('existing workspace files are version references rather than new changes and interruption still locks replanning', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await writeFile(path.join(project.rootPath, 'module.txt'), 'existing');
  await service.start(project, input);
  calls[0].resolve(delivered(calls[0].request));
  const card = await settled(store, project);
  assert.equal(card.execution?.runs[0].status, 'succeeded');
  assert.deepEqual(card.execution?.runs[0].verifiedVersionRefs, [
    'file:module.txt',
  ]);
  assert.equal(
    card.execution!.runs[0].observedRefs.includes('file:module.txt'),
    false,
  );
  assert.deepEqual(card.execution?.acceptedActionIds, []);
  await service.start(project, { ...input, expectedRevision: card.revision });
  const fresh = createExecutionService(store, undefined, new Map());
  const recovered = await fresh.refresh(project, await store.read(project, id));
  assert.equal(recovered.execution?.runs.at(-1)?.status, 'failed');
  assert.match(recovered.execution!.runs.at(-1)!.error!, /interrupted/);
  calls[1].reject(new Error('Stop fixture'));
  await assert.rejects(
    () => store.update(project, id, recovered.revision, 'reopen'),
    /rollback/,
  );
});

void test('workspace evidence excludes the planning store and does not follow symlinks', async (t) => {
  const { project } = await fixture(t);
  const before = await snapshotWorkspace(project);
  await symlink(
    project.planningPath,
    path.join(project.rootPath, 'linked-store'),
  );
  await writeFile(path.join(project.rootPath, 'output.txt'), 'new output');
  const after = await snapshotWorkspace(project);
  assert.deepEqual(observedChanges(before, after), [
    'file:linked-store',
    'file:output.txt',
  ]);
  assert.equal(
    Object.keys(after.files).some((name) => name.startsWith('linked-store/')),
    false,
  );
  assert.deepEqual(Object.keys(before.files), []);
});

void test('execution permissions do not broaden planning and explicit execution cannot resume a read-only Session', () => {
  const input = { workingDirectory: '/tmp/example', prompt: '' };
  assert.ok(buildCodexArguments(input).includes('read-only'));
  const execution = buildCodexArguments({
    ...input,
    access: 'workspace-write',
    protectedPath: '/tmp/example/.agent-manager',
  });
  assert.ok(execution.includes('default_permissions="agent_manager_action"'));
  assert.ok(
    execution.some((arg) =>
      arg.includes('"/tmp/example/.agent-manager"="read"'),
    ),
  );
  assert.ok(!execution.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.throws(
    () =>
      buildCodexArguments({
        ...input,
        access: 'workspace-write',
        resumeSessionId: 'old',
      }),
    /fresh Session/,
  );
  assert.equal(buildClaudeArguments().includes('acceptEdits'), false);
  assert.ok(
    buildClaudeArguments(undefined, { access: 'workspace-write' }).includes(
      'acceptEdits',
    ),
  );
});

void test('timeout ends the Action without acceptance or rolling back partial files', async (t) => {
  const { project, store, transport, calls, input } = await fixture(t);
  const service = createExecutionService(
    store,
    transport,
    new Map(),
    5,
    undefined,
    async () => undefined,
    undefined,
    (input) => input.transport!(input.workerAgent, input.workerOptions),
  );
  await service.start(project, input);
  const card = await settled(store, project);
  assert.equal(card.execution?.runs[0].status, 'failed');
  assert.match(card.execution!.runs[0].error!, /timed out/);
  assert.equal(calls[0].canceled, true);
  assert.deepEqual(card.execution?.acceptedActionIds, []);
});

void test('source dependencies prevent execution before prerequisite acceptance', async (t) => {
  const { project, card, service, calls, input } = await fixture(t);
  const next = {
    ...card,
    revision: 2,
    source: { ...card.source, dependsOn: ['NODE-deadbeef'] },
  };
  await appendCardWorkRecord(
    path.join(project.planningPath, 'implementation/cards'),
    id,
    1,
    {
      kind: 'user-input',
      stage: 'planning',
      actionId: null,
      text: 'Fixture adds a prerequisite.',
    },
    { 'planning-state.json': JSON.stringify(next) },
  );
  await assert.rejects(
    () => service.start(project, { ...input, expectedRevision: 2 }),
    /Accept prerequisite NODE-deadbeef/,
  );
  assert.equal(calls.length, 0);
});

void test('Git checkpoints preserve exact bytes and deletions without changing the project Git index or branch', async (t) => {
  const { project } = await fixture(t);
  const git = promisify(execFile);
  await writeFile(
    path.join(project.rootPath, '.gitignore'),
    '.agent-manager/\n',
  );
  await writeFile(path.join(project.rootPath, 'existing.txt'), 'existing');
  await git('git', ['init', '--initial-branch=fixture'], {
    cwd: project.rootPath,
  });
  await git('git', ['add', '.gitignore', 'existing.txt'], {
    cwd: project.rootPath,
  });
  await git(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@localhost',
      'commit',
      '-m',
      'Fixture baseline',
    ],
    { cwd: project.rootPath },
  );
  await writeFile(
    path.join(project.rootPath, 'existing.txt'),
    'staged user change',
  );
  await git('git', ['add', 'existing.txt'], { cwd: project.rootPath });
  const originalIndex = (
    await git('git', ['write-tree'], { cwd: project.rootPath })
  ).stdout;
  const originalHead = (
    await git('git', ['rev-parse', 'HEAD'], { cwd: project.rootPath })
  ).stdout;
  const first = await checkpointWorkspace(
    project,
    id,
    await snapshotWorkspace(project),
    null,
    randomUUID(),
    'Baseline',
  );
  const binary = Buffer.from([0, 1, 255, 13, 10]);
  await writeFile(path.join(project.rootPath, '中文 空格.bin'), binary);
  await writeFile(
    path.join(project.rootPath, 'line-endings.txt'),
    'one\r\ntwo\r\n',
  );
  await writeFile(path.join(project.rootPath, '.env'), 'SECRET=do-not-record');
  await symlink(
    '../external-tools/format-config',
    path.join(project.rootPath, 'format-link'),
  );
  await rm(path.join(project.rootPath, 'existing.txt'));
  const second = await checkpointWorkspace(
    project,
    id,
    await snapshotWorkspace(project),
    first,
    randomUUID(),
    'Round one',
  );
  const gitDir = path.join(
    project.planningPath,
    'implementation/cards',
    id,
    'versions.git',
  );
  assert.deepEqual(
    (
      await git(
        'git',
        ['--git-dir', gitDir, 'show', `${second}:中文 空格.bin`],
        { encoding: 'buffer' },
      )
    ).stdout,
    binary,
  );
  assert.equal(
    (
      await git('git', [
        '--git-dir',
        gitDir,
        'show',
        `${second}:line-endings.txt`,
      ])
    ).stdout,
    'one\r\ntwo\r\n',
  );
  assert.equal(
    (await git('git', ['--git-dir', gitDir, 'show', `${first}:existing.txt`]))
      .stdout,
    'staged user change',
  );
  await assert.rejects(
    git('git', ['--git-dir', gitDir, 'show', `${second}:existing.txt`]),
  );
  await assert.rejects(
    git('git', ['--git-dir', gitDir, 'show', `${second}:.env`]),
  );
  assert.equal(
    (await git('git', ['--git-dir', gitDir, 'show', `${second}:format-link`]))
      .stdout,
    '../external-tools/format-config',
  );
  assert.equal(
    (await git('git', ['write-tree'], { cwd: project.rootPath })).stdout,
    originalIndex,
  );
  assert.equal(
    (await git('git', ['rev-parse', 'HEAD'], { cwd: project.rootPath })).stdout,
    originalHead,
  );
  assert.equal(
    (
      await git('git', ['branch', '--show-current'], { cwd: project.rootPath })
    ).stdout.trim(),
    'fixture',
  );
  assert.match(
    await readCheckpointDiff(project, id, first, second),
    /deleted file mode/,
  );
  assert.equal(includeInGitHistory('.env.example'), true);
  assert.equal(includeInGitHistory('certificates/private.p12'), false);
});

void test('Git checkpoint rejects changed input bytes and linked history stores', async (t) => {
  const { project } = await fixture(t);
  await writeFile(path.join(project.rootPath, 'test.txt'), 'before');
  const snapshot = await snapshotWorkspace(project);
  await writeFile(path.join(project.rootPath, 'test.txt'), 'after');
  await assert.rejects(
    () =>
      checkpointWorkspace(
        project,
        id,
        snapshot,
        null,
        randomUUID(),
        'Raced snapshot',
      ),
    /Workspace changed/,
  );
  const secondId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const parent = path.join(
    project.planningPath,
    'implementation/cards',
    secondId,
  );
  await mkdir(parent);
  const outside = path.join(project.rootPath, 'outside-history');
  await mkdir(outside);
  await symlink(outside, path.join(parent, 'versions.git'));
  await assert.rejects(
    async () =>
      checkpointWorkspace(
        project,
        secondId,
        await snapshotWorkspace(project),
        null,
        randomUUID(),
        'Linked store',
      ),
    /Invalid Git history/,
  );
});

void test('a no-code-change round can report its real Git checkpoint without relabeling unchanged inputs', async (t) => {
  const { project, service, store, calls, input } = await fixture(t);
  await writeFile(path.join(project.rootPath, 'module.txt'), 'already present');
  await service.start(project, input);
  calls[0].resolve(
    delivered(calls[0].request, [`checkpoint:${calls[0].request.requestId}`]),
  );
  const card = await settled(store, project);
  assert.equal(card.execution?.runs[0].status, 'succeeded');
  assert.match(card.execution!.runs[0].commit!, /^[0-9a-f]{40}$/);
  assert.deepEqual(card.execution?.acceptedActionIds, []);
});

void test('GitHub refresh persists remote state without accepting, starting, or changing checkpoint history', async (t) => {
  const { project, store, transport, calls } = await fixture(t);
  const hash = 'a'.repeat(40);
  const delivery = {
    repositoryUrl: 'https://github.com/example/fixture',
    outputHead: hash,
    outputBranch: 'feature',
    cleanAtOutput: true,
    requestedNumbers: [1],
    defaultBranch: 'main',
    pullRequests: [],
    checkedAt: new Date().toISOString(),
    error: null,
  };
  const runId = randomUUID();
  const laterId = randomUUID();
  const card = await store.read(project, id);
  const run = {
    id: runId,
    actionId: one,
    status: 'succeeded' as const,
    input: '',
    profile: { agent: 'codex' as const, model: '', effort: '' as const },
    startedAt: '',
    endedAt: '',
    hostPid: process.pid,
    agentSessionId: null,
    usage: null,
    result: null,
    error: null,
    observedRefs: [],
    outputRef: null,
    commit: hash,
    github: delivery,
  };
  await appendCardWorkRecord(
    path.join(project.planningPath, 'implementation/cards'),
    id,
    1,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId: one,
      event: 'output-recorded',
      text: 'Fixture outputs',
      refs: [],
    },
    {
      'planning-state.json': JSON.stringify({
        ...card,
        revision: 2,
        execution: {
          runs: [run, { ...run, id: laterId, commit: 'b'.repeat(40) }],
          acceptedActionIds: [],
          git: {
            baseline: hash,
            head: 'b'.repeat(40),
            firstTrackedRunId: runId,
          },
        },
      }),
    },
  );
  const service = createExecutionService(store, transport, new Map(), 1800000, {
    repository: async () => 'main',
    branchPullRequests: async () => [],
    pullRequest: async () => ({
      number: 1,
      url: 'https://github.com/example/fixture/pull/1',
      title: 'Fixture',
      state: 'MERGED',
      isDraft: false,
      headRefOid: hash,
      headRefName: 'feature',
      baseRefName: 'main',
      mergedAt: '2026-08-30T12:00:00Z',
    }),
  });
  const refreshed = await service.refreshGitHub(project, id, 2, runId);
  assert.equal(
    refreshed.execution?.runs[0].github?.pullRequests[0].state,
    'MERGED',
  );
  assert.deepEqual(refreshed.execution?.acceptedActionIds, []);
  assert.equal(refreshed.execution?.git?.head, 'b'.repeat(40));
  assert.equal(calls.length, 0);
  assert.equal((await store.read(project, id)).revision, 3);
  await assert.rejects(
    () => service.refreshGitHub(project, id, 2, runId),
    /Card changed/,
  );
});

void test('an Action-created repository and reported PR become durable output evidence automatically', async (t) => {
  const { project, store, service, calls, input } = await fixture(t, {
    repository: async () => 'main',
    branchPullRequests: async () => [],
    pullRequest: async () => ({
      number: 7,
      url: 'https://github.com/example/fixture/pull/7',
      title: 'Created by Action',
      state: 'OPEN',
      isDraft: false,
      headRefOid: 'a'.repeat(40),
      headRefName: 'feature',
      baseRefName: 'main',
      mergedAt: null,
    }),
  });
  await service.start(project, input);
  const exec = promisify(execFile);
  await exec('git', ['init', '-b', 'feature'], { cwd: project.rootPath });
  await writeFile(path.join(project.rootPath, 'module.txt'), 'implemented');
  await exec(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { cwd: project.rootPath },
  );
  await exec(
    'git',
    ['remote', 'add', 'origin', 'https://github.com/example/fixture.git'],
    { cwd: project.rootPath },
  );
  const result = delivered(calls[0].request);
  const output = JSON.parse(result.finalOutput);
  output.summary += ' https://github.com/example/fixture/pull/7';
  calls[0].resolve({ ...result, finalOutput: JSON.stringify(output) });
  const card = await settled(store, project);
  assert.equal(card.execution?.runs[0].status, 'succeeded');
  assert.equal(card.execution?.runs[0].github?.pullRequests[0].number, 7);
  assert.equal(card.execution?.runs[0].github?.cleanAtOutput, false);
  assert.deepEqual(card.execution?.acceptedActionIds, []);
  assert.equal(calls.length, 1);
});

void test('blocked reports retain intermediate commits and unverified check references without acceptance', async (t) => {
  const { project, service, store, calls, input } = await fixture(t);
  const exec = promisify(execFile);
  await service.start(project, input);
  const git = (...args: string[]) =>
    exec('git', ['-C', project.rootPath, ...args]);
  await git('init', '-b', 'feature');
  await writeFile(path.join(project.rootPath, 'module.txt'), 'one');
  await git('add', 'module.txt');
  await git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'first',
  );
  const first = (await git('rev-parse', 'HEAD')).stdout.trim();
  await writeFile(path.join(project.rootPath, 'module.txt'), 'two');
  await git('add', 'module.txt');
  await git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'second',
  );
  const last = (await git('rev-parse', 'HEAD')).stdout.trim();
  const response = delivered(calls[0].request, [
    `git:${first}`,
    `git:${last}`,
    'file:module.txt',
  ]);
  const report = JSON.parse(response.finalOutput);
  report.outcome = 'blocked';
  report.remaining = ['Device is unavailable'];
  report.checks = [
    {
      status: 'failed',
      summary: 'Device test blocked',
      evidenceRefs: [
        'command:device-test',
        'https://github.com/example/fixture',
      ],
    },
  ];
  calls[0].resolve({ ...response, finalOutput: JSON.stringify(report) });
  const card = await settled(store, project);
  const run = card.execution!.runs[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.result?.outcome, 'blocked');
  assert.equal(run.result?.remaining[0], 'Device is unavailable');
  assert.ok(run.observedRefs.includes(`git:${first}`));
  assert.ok(run.observedRefs.includes(`git:${last}`));
  assert.deepEqual(run.unverifiedCheckRefs, [
    'command:device-test',
    'https://github.com/example/fixture',
  ]);
  assert.deepEqual(card.execution!.acceptedActionIds, []);
});

void test('artifact verification warnings preserve the report and do not add an acceptance gate', async (t) => {
  const { project, service, store, calls, input } = await fixture(t);
  await service.start(project, input);
  await writeFile(path.join(project.rootPath, 'module.txt'), 'real change');
  const response = delivered(calls[0].request, ['file:invented.txt']);
  calls[0].resolve(response);
  const card = await settled(store, project);
  const run = card.execution!.runs[0];
  assert.equal(run.status, 'failed');
  assert.ok(run.result?.summary);
  assert.match(run.evidenceErrors![0], /invented.txt/);
  assert.ok(run.observedRefs.includes('file:module.txt'));
  const accepted = await service.update(
    project,
    id,
    card.revision,
    'accept',
    run.id,
  );
  assert.deepEqual(accepted.execution!.acceptedActionIds, [one]);
  assert.deepEqual(
    accepted.execution!.runs[0].evidenceErrors,
    run.evidenceErrors,
  );
  assert.equal(accepted.execution!.runs[0].status, 'failed');
});

void test('a verified repository-only blocked output is retained without pretending it is a changed file or acceptance', async (t) => {
  const { project, service, store, calls, input } = await fixture(t, {
    repository: async () => null,
    branchPullRequests: async () => [],
    pullRequest: async () => {
      throw new Error('No PR');
    },
  });
  await service.start(project, input);
  const exec = promisify(execFile);
  await exec('git', ['init', '-b', 'feature'], { cwd: project.rootPath });
  await exec(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { cwd: project.rootPath },
  );
  await exec(
    'git',
    ['remote', 'add', 'origin', 'https://github.com/example/empty'],
    { cwd: project.rootPath },
  );
  const response = delivered(calls[0].request, [
    'https://github.com/example/empty',
  ]);
  const result = JSON.parse(response.finalOutput);
  result.outcome = 'blocked';
  result.remaining = ['Push gate is blocked'];
  calls[0].resolve({ ...response, finalOutput: JSON.stringify(result) });
  const current = await settled(store, project);
  const run = current.execution!.runs[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.result?.outcome, 'blocked');
  assert.deepEqual(run.verifiedExternalRefs, [
    'https://github.com/example/empty',
  ]);
  assert.equal(
    run.observedRefs.includes('https://github.com/example/empty'),
    false,
  );
  assert.equal(run.github?.error, null);
  assert.deepEqual(current.execution!.acceptedActionIds, []);
});

async function legacyRejectedVersionFixture(t: {
  after: (fn: () => Promise<void>) => void;
}) {
  const f = await fixture(t);
  const exec = promisify(execFile);
  await exec('git', ['init', '-b', 'feature'], { cwd: f.project.rootPath });
  await exec(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'baseline',
    ],
    { cwd: f.project.rootPath },
  );
  const sha = (
    await exec('git', ['rev-parse', 'HEAD'], { cwd: f.project.rootPath })
  ).stdout.trim();
  await f.service.start(f.project, f.input);
  f.calls[0].resolve(delivered(f.calls[0].request, [`git:${sha}`]));
  const current = await settled(f.store, f.project);
  const run = current.execution!.runs[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.observedRefs.includes(`git:${sha}`), false);
  const legacy = {
    ...current,
    revision: current.revision + 1,
    execution: {
      ...current.execution!,
      runs: [
        {
          ...run,
          status: 'failed',
          error: 'Legacy evidence rejection',
          evidenceErrors: ['Legacy evidence rejection'],
          verifiedVersionRefs: undefined,
        },
      ],
    },
  };
  await appendCardWorkRecord(
    path.join(f.project.planningPath, 'implementation/cards'),
    id,
    current.revision,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId: one,
      event: 'run-ended',
      text: 'Fixture simulates the earlier validator rejecting an existing commit.',
      refs: [],
    },
    { 'planning-state.json': JSON.stringify(legacy) },
  );
  return { ...f, sha, legacy, run };
}

void test('recheck repairs legacy version-reference rejection without another Agent call or acceptance', async (t) => {
  const f = await legacyRejectedVersionFixture(t);
  const fixed = await f.service.recheckOutput(
    f.project,
    id,
    f.legacy.revision,
    f.run.id,
  );
  assert.equal(fixed.execution?.runs[0].status, 'succeeded');
  assert.equal(fixed.execution?.runs[0].error, null);
  assert.deepEqual(fixed.execution?.runs[0].verifiedVersionRefs, [
    `git:${f.sha}`,
  ]);
  assert.deepEqual(fixed.execution?.acceptedActionIds, []);
  assert.equal(fixed.execution?.runs[0].endedAt, f.run.endedAt);
  assert.equal(f.calls.length, 1);
  assert.ok(fixed.execution?.runs[0].outputRef);
  const old = JSON.parse(
    await readFile(
      path.join(
        f.project.planningPath,
        'implementation/cards',
        id,
        String(f.legacy.revision).padStart(8, '0'),
        'planning-state.json',
      ),
      'utf8',
    ),
  );
  assert.equal(old.execution.runs[0].status, 'failed');
});

void test('recheck refuses changed workspaces and stale Card revisions', async (t) => {
  const f = await legacyRejectedVersionFixture(t);
  await assert.rejects(
    () =>
      f.service.recheckOutput(f.project, id, f.legacy.revision - 1, f.run.id),
    /Card changed/,
  );
  await writeFile(path.join(f.project.rootPath, 'new-edit.txt'), 'keep');
  await assert.rejects(
    () => f.service.recheckOutput(f.project, id, f.legacy.revision, f.run.id),
    /Workspace changed/,
  );
  assert.equal((await f.store.read(f.project, id)).revision, f.legacy.revision);
  assert.equal(f.calls.length, 1);
});

void test('recheck preserves captured branch evidence for implicit PR discovery', async (t) => {
  const f = await legacyRejectedVersionFixture(t);
  const exec = promisify(execFile);
  await exec(
    'git',
    ['remote', 'add', 'origin', 'https://github.com/example/fixture'],
    { cwd: f.project.rootPath },
  );
  const github = {
    repositoryUrl: 'https://github.com/example/fixture',
    outputHead: f.sha,
    outputBranch: 'feature',
    cleanAtOutput: true,
    requestedNumbers: [],
    defaultBranch: 'main',
    pullRequests: [],
    checkedAt: new Date().toISOString(),
    error: null,
  };
  const current = await f.store.read(f.project, id);
  await appendCardWorkRecord(
    path.join(f.project.planningPath, 'implementation/cards'),
    id,
    current.revision,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId: one,
      event: 'output-recorded',
      text: 'Fixture retains captured branch evidence.',
      refs: [],
    },
    {
      'planning-state.json': JSON.stringify({
        ...current,
        revision: current.revision + 1,
        execution: {
          ...current.execution,
          runs: [{ ...current.execution!.runs[0], github }],
        },
      }),
    },
  );
  const service = createExecutionService(
    f.store,
    f.transport,
    new Map(),
    1800000,
    {
      repository: async () => 'main',
      pullRequest: async () => {
        throw new Error('No explicit PR');
      },
      branchPullRequests: async (_repo, branch) => {
        assert.equal(branch, 'feature');
        return [
          {
            number: 7,
            url: 'https://github.com/example/fixture/pull/7',
            title: 'Fixture',
            state: 'OPEN',
            isDraft: false,
            headRefOid: f.sha,
            headRefName: 'feature',
            baseRefName: 'main',
            mergedAt: null,
          },
        ];
      },
    },
  );
  const fixed = await service.recheckOutput(
    f.project,
    id,
    current.revision + 1,
    f.run.id,
  );
  assert.equal(fixed.execution?.runs[0].github?.outputBranch, 'feature');
  assert.equal(fixed.execution?.runs[0].github?.pullRequests[0].number, 7);
});

void test('required failure blocks acceptance; explicit user decision preserves failure and unlocks acceptance', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await service.start(project, input);
  await writeFile(path.join(project.rootPath, 'module.txt'), 'delivered');
  const response = delivered(calls[0].request);
  const report = JSON.parse(response.finalOutput);
  report.checks[0].status = 'failed';
  report.additionalChecks = [
    { summary: 'Optional probe', status: 'failed', evidenceRefs: [] },
  ];
  calls[0].resolve({ ...response, finalOutput: JSON.stringify(report) });
  let card = await settled(store, project);
  await assert.rejects(
    () =>
      service.update(
        project,
        id,
        card.revision,
        'accept',
        card.execution!.runs[0].id,
      ),
    /Required acceptance/,
  );
  await assert.rejects(
    () =>
      service.overrideRequiredCheck(
        project,
        id,
        card.revision,
        'unknown',
        'accept',
      ),
    /Select a required/,
  );
  card = await service.overrideRequiredCheck(
    project,
    id,
    card.revision,
    'AC-01',
    'I explicitly accept this limitation.',
  );
  assert.equal(card.execution!.runs[0].result!.checks[0].status, 'failed');
  card = await service.update(
    project,
    id,
    card.revision,
    'accept',
    card.execution!.runs[0].id,
  );
  assert.deepEqual(card.execution!.acceptedActionIds, [one]);
  await assert.rejects(
    () =>
      service.overrideRequiredCheck(
        project,
        id,
        card.revision,
        'AC-01',
        'accept',
      ),
    /finished, unaccepted/,
  );
});

void test('legacy checklist upgrade is one-time and cannot rewrite historical runs', async (t) => {
  const { project, store, service, input, card } = await fixture(t);
  const file = path.join(
    project.planningPath,
    `implementation/cards/${id}/00000001/planning-state.json`,
  );
  const criteria = card.actions[0].acceptanceCriteria!;
  for (const action of card.actions)
    delete (action as Partial<typeof action>).acceptanceCriteria;
  await writeFile(file, JSON.stringify(card));
  await assert.rejects(
    () => service.start(project, input),
    /Define the required/,
  );
  const upgraded = await service.bindLegacyChecklist(
    project,
    id,
    1,
    one,
    criteria,
    'User approved upgrade.',
  );
  assert.equal(upgraded.actions[0].acceptanceCriteria!.length, 1);
  await assert.rejects(
    () =>
      service.bindLegacyChecklist(
        project,
        id,
        upgraded.revision,
        one,
        criteria,
        'Again',
      ),
    /Only a legacy/,
  );
  const saved = await store.read(project, id);
  assert.equal(saved.execution?.runs.length ?? 0, 0);
});

void test('ignored acceptance attachments are archived and escaped or later-modified files are rejected', async (t) => {
  const { project } = await fixture(t);
  await mkdir(path.join(project.rootPath, 'build/acceptance'), {
    recursive: true,
  });
  const attachment = path.join(project.rootPath, 'build/acceptance/home.png');
  await writeFile(attachment, 'screenshot bytes');
  const completedAt = new Date(Date.now() + 1000).toISOString();
  const snapshot = await snapshotWorkspace(project);
  assert.equal(snapshot.files['build/acceptance/home.png'], undefined);
  const captured = await captureLocalAcceptanceArtifacts(
    snapshot,
    ['file:build/acceptance/home.png'],
    completedAt,
  );
  assert.equal(captured.length, 1);
  assert.equal(
    Buffer.from(captured[0].base64, 'base64').toString(),
    'screenshot bytes',
  );
  assert.match(captured[0].sha256, /^[0-9a-f]{64}$/);
  await symlink(
    attachment,
    path.join(project.rootPath, 'build/acceptance/link.png'),
  );
  assert.deepEqual(
    await captureLocalAcceptanceArtifacts(
      snapshot,
      [
        'file:build/acceptance/link.png',
        'file:build/acceptance/../../secret.txt',
        'file:build/secret.png',
      ],
      completedAt,
    ),
    [],
  );
  await utimes(attachment, new Date(), new Date(Date.now() + 10000));
  assert.deepEqual(
    await captureLocalAcceptanceArtifacts(
      snapshot,
      ['file:build/acceptance/home.png'],
      completedAt,
    ),
    [],
  );
});

void test('an ignored screenshot does not reject otherwise valid delivery and is retained outside the source repository', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await service.start(project, input);
  await mkdir(path.join(project.rootPath, 'build/acceptance'), {
    recursive: true,
  });
  await writeFile(
    path.join(project.rootPath, 'build/acceptance/home.png'),
    'image',
  );
  calls[0].resolve(
    delivered(calls[0].request, ['file:build/acceptance/home.png']),
  );
  const card = await settled(store, project);
  const run = card.execution!.runs[0];
  assert.equal(run.status, 'succeeded', run.error ?? '');
  const archived = JSON.parse(
    await readFile(
      path.join(
        project.planningPath,
        path.dirname(run.outputRef!),
        'local-artifacts.json',
      ),
      'utf8',
    ),
  );
  assert.equal(archived.artifacts[0].ref, 'file:build/acceptance/home.png');
  assert.equal(
    archived.artifacts[0].base64,
    Buffer.from('image').toString('base64'),
  );
});

void test('attachment timestamps compare at the recorded Round millisecond precision', async (t) => {
  const { project } = await fixture(t);
  await mkdir(path.join(project.rootPath, 'build/acceptance'), {
    recursive: true,
  });
  const file = path.join(project.rootPath, 'build/acceptance/home.png');
  await writeFile(file, 'image');
  await utimes(file, 1700000000.0005, 1700000000.0005);
  const snapshot = await snapshotWorkspace(project);
  const completedAt = new Date(1700000000000).toISOString();
  assert.equal(
    (
      await captureLocalAcceptanceArtifacts(
        snapshot,
        ['file:build/acceptance/home.png'],
        completedAt,
      )
    ).length,
    1,
  );
  await utimes(file, 1700000000.002, 1700000000.002);
  assert.equal(
    (
      await captureLocalAcceptanceArtifacts(
        snapshot,
        ['file:build/acceptance/home.png'],
        completedAt,
      )
    ).length,
    0,
  );
});

void test('unsupported app bundle retries stop before workspace and remote verification', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await service.start(project, input);
  await mkdir(path.join(project.rootPath, 'build/App.app'), {
    recursive: true,
  });
  calls[0].resolve(delivered(calls[0].request, ['file:build/App.app']));
  const card = await settled(store, project);
  assert.equal(card.execution!.runs[0].status, 'failed');
  await rm(project.rootPath + '/build', { recursive: true });
  await assert.rejects(
    () =>
      service.recheckOutput(
        project,
        id,
        card.revision,
        card.execution!.runs[0].id,
      ),
    /unsupported.*Retrying cannot/,
  );
  assert.equal((await store.read(project, id)).revision, card.revision);
  assert.equal(calls.length, 1);
});

void test('accepted reports with artifact warnings are handed to the next Action with their original evidence', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await service.start(project, input);
  calls[0].resolve(delivered(calls[0].request, ['file:unverified.txt']));
  let card = await settled(store, project);
  const original = structuredClone(card.execution!.runs[0]);
  card = await service.update(
    project,
    id,
    card.revision,
    'accept',
    original.id,
  );
  const accepted = card.execution!.runs[0];
  assert.ok(accepted.outputRef);
  assert.deepEqual(accepted.result, original.result);
  assert.deepEqual(accepted.evidenceErrors, original.evidenceErrors);
  assert.equal(accepted.status, 'failed');
  const text = await readFile(
    path.join(project.planningPath, accepted.outputRef),
    'utf8',
  );
  assert.match(text, /file:unverified.txt/);
  assert.match(text, /System verification findings/);
  assert.match(text, /Preserve the user choice: compact display/);
  await service.start(project, {
    ...input,
    actionId: two,
    expectedRevision: card.revision,
  });
  const resource = calls[1].request.context.resources.find((r) =>
    r.description.startsWith(`Accepted Action ${one}:`),
  );
  assert.equal(
    resource?.ref,
    path.join(project.planningPath, accepted.outputRef),
  );
  calls[1].reject(new Error('Fixture finished'));
  await settled(store, project);
});

void test('continuation repairs a legacy accepted report without changing history or rerunning it', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await service.start(project, input);
  calls[0].resolve(delivered(calls[0].request, ['file:unverified.txt']));
  let card = await settled(store, project);
  card = await service.update(
    project,
    id,
    card.revision,
    'accept',
    card.execution!.runs[0].id,
  );
  const legacy = structuredClone(card);
  legacy.revision++;
  legacy.execution!.runs[0].outputRef = null;
  await appendCardWorkRecord(
    path.join(project.planningPath, 'implementation/cards'),
    id,
    card.revision,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId: one,
      event: 'output-recorded',
      text: 'Fixture restores legacy accepted report without a handoff reference.',
      refs: [],
    },
    { 'planning-state.json': JSON.stringify(legacy) },
  );
  const running = await service.start(project, {
    ...input,
    actionId: two,
    expectedRevision: legacy.revision,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(running.execution!.acceptedActionIds, [one]);
  const repaired = running.execution!.runs[0];
  assert.ok(repaired.outputRef);
  assert.deepEqual(repaired.result, legacy.execution!.runs[0].result);
  assert.deepEqual(
    repaired.evidenceErrors,
    legacy.execution!.runs[0].evidenceErrors,
  );
  assert.equal(repaired.status, legacy.execution!.runs[0].status);
  const resource = calls[1].request.context.resources.find((r) =>
    r.description.startsWith(`Accepted Action ${one}:`),
  );
  assert.equal(
    resource?.ref,
    path.join(project.planningPath, repaired.outputRef),
  );
  assert.match(await readFile(resource!.ref, 'utf8'), /file:unverified.txt/);
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(
          project.planningPath,
          `implementation/cards/${id}/${String(legacy.revision).padStart(8, '0')}/planning-state.json`,
        ),
        'utf8',
      ),
    ).execution.runs[0].outputRef,
    null,
  );
  calls[1].reject(new Error('Fixture finished'));
  await settled(store, project);
});

void test('new executions always coordinate, persist role traces, and carry context into a coordinator-only next Action', async (t) => {
  const f = await fixture(t);
  const calls: Array<{ access: unknown; model: unknown }> = [];
  const requests: Array<
    import('../lib/just-do-it-coordination.ts').CoordinationRequest
  > = [];
  let current!: CardHarnessRequest;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls.push({ access: options.access, model: options.model });
    if (options.access === 'read-only') {
      const req = JSON.parse(
        options.prompt.split('COORDINATION REQUEST:\n')[1],
      );
      requests.push(req);
      current = req.task;
      const dispatch = req.phase === 'prepare' && req.task.actionId === one;
      const result = {
        version: 1,
        requestId: req.requestId,
        cardId: id,
        actionId: req.task.actionId,
        contextRevision: req.task.context.contextRevision,
        checklistVersion: req.task.context.acceptanceChecklist.version,
        decision: dispatch ? 'dispatch' : 'ready',
        summary: 'Verified fixture output',
        instructions: dispatch ? 'Write module.txt with ready.' : '',
        verificationPlan: [
          {
            criterionId: 'AC-01',
            mode: dispatch || req.workerReport ? 'worker' : 'coordinator',
            evidenceIds: [],
            rationale: 'Verified current fixture inputs.',
          },
        ],
        checks: dispatch
          ? []
          : [
              {
                criterionId: 'AC-01',
                summary: 'Read fixture output',
                status: 'passed',
                evidenceRefs: ['file:module.txt'],
              },
            ],
        artifactRefs: ['file:module.txt'],
        additionalFindings: [],
        scopeNotes: [],
        contextSummary:
          'Verified lesson: retain the fixture repository target.',
      };
      return {
        completion: Promise.resolve({
          agentSessionId: 'coordinator-session',
          usage: {
            inputTokens: 10,
            cachedInputTokens: 5,
            cacheWriteInputTokens: 0,
            outputTokens: 2,
            reasoningOutputTokens: 1,
          },
          finalOutput: JSON.stringify(result),
        }),
        cancel: () => {},
      };
    }
    options.onActivity?.({
      kind: 'tool',
      phase: 'started',
      summary: 'Writing fixture module',
    });
    return {
      completion: writeFile(
        path.join(f.project.rootPath, 'module.txt'),
        'ready',
      ).then(() => delivered(current)),
      cancel: () => {},
    };
  };
  const service = createExecutionService(
    f.store,
    transport,
    new Map(),
    1800000,
    undefined,
    async () => undefined,
  );
  await service.start(f.project, {
    ...f.input,
    coordination: {
      profile: { agent: 'codex', model: 'coordinator-model', effort: 'medium' },
    },
  });
  let card = await settled(f.store, f.project);
  const first = card.execution!.runs[0];
  assert.equal(first.status, 'succeeded', first.error ?? '');
  assert.deepEqual(
    calls.map((c) => c.access),
    ['read-only', 'workspace-write'],
  );
  assert.equal(calls[0].model, 'coordinator-model');
  assert.equal(calls[1].model, 'test-model');
  assert.equal(first.coordination?.attempts.length, 2);
  assert.ok(first.coordination?.logRef);
  assert.ok(first.activityRef);
  assert.equal(
    JSON.parse(
      await readFile(
        path.join(f.project.planningPath, first.coordination.logRef),
        'utf8',
      ),
    ).attempts.length,
    2,
  );
  assert.ok(
    (
      JSON.parse(
        await readFile(
          path.join(f.project.planningPath, first.activityRef),
          'utf8',
        ),
      ) as unknown[]
    ).length > 0,
  );
  card = await service.update(f.project, id, card.revision, 'accept', first.id);
  await service.start(f.project, {
    ...f.input,
    actionId: two,
    expectedRevision: card.revision,
    instruction: 'Only verify existing evidence.',
  });
  card = await settled(f.store, f.project);
  assert.equal(calls.length, 3);
  assert.match(
    requests.at(-1)!.previousContext,
    /retain the fixture repository target/,
  );
  assert.equal(card.execution!.runs.at(-1)!.coordination?.attempts.length, 1);
  assert.equal(card.execution!.runs.at(-1)!.status, 'succeeded');
});

void test('host preserves worker checklist when coordination recovery fails', async (t) => {
  const f = await fixture(t);
  const service = createExecutionService(
    f.store,
    f.transport,
    new Map(),
    1800000,
    undefined,
    async () => undefined,
    undefined,
    (input) => {
      const report = JSON.parse(delivered(input.request).finalOutput);
      report.outcome = 'blocked';
      report.checks[0].status = 'failed';
      const error = new CoordinationRunError(
        'Fixture recovery failed.',
        {
          profile: input.settings.profile,
          attempts: [],
          decisions: [],
          contextSummary: 'Fixture context',
        },
        {},
        report,
      );
      return {
        completion: Promise.reject(error),
        cancel: () => {},
      };
    },
  );
  await service.start(f.project, f.input);
  const card = await settled(f.store, f.project);
  const run = card.execution!.runs[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.error, 'Fixture recovery failed.');
  assert.equal(run.result?.checks[0].status, 'failed');
  assert.equal(run.result?.checks.length, 1);
});

void test('canceling coordinator preparation persists its partial record and never starts a worker', async (t) => {
  const f = await fixture(t);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  let stops = 0;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls++;
    assert.equal(options.access, 'read-only');
    let reject!: (error: Error) => void;
    const completion = new Promise<LocalAgentResult>((_resolve, fail) => {
      reject = fail;
    });
    options.onActivity?.({
      kind: 'tool',
      phase: 'started',
      summary: 'Reading current evidence',
    });
    started();
    return {
      completion,
      cancel: () => {
        stops++;
        reject(new Error('Stopped fixture coordinator'));
      },
    };
  };
  const service = createExecutionService(
    f.store,
    transport,
    new Map(),
    1800000,
    undefined,
    async () => undefined,
  );
  const running = await service.start(f.project, f.input);
  await ready;
  const saved = await service.update(
    f.project,
    id,
    running.revision,
    'cancel',
    running.execution!.runs.at(-1)!.id,
  );
  const canceled = saved.execution!.runs.at(-1)!;
  assert.equal(calls, 1);
  assert.equal(stops, 1);
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.coordination?.attempts.length, 1);
  assert.ok(canceled.coordination?.logRef);
  assert.ok(canceled.activityRef);
  const record = JSON.parse(
    await readFile(
      path.join(f.project.planningPath, canceled.coordination.logRef),
      'utf8',
    ),
  );
  assert.equal(record.attempts[0].role, 'coordinator');
  assert.match(record.attempts[0].error, /Stopped fixture/);
  assert.ok(record.attempts[0].endedAt);
  const activity = await readFile(
    path.join(f.project.planningPath, canceled.activityRef),
    'utf8',
  );
  assert.match(activity, /Reading current evidence/);
});

void test('coordinated app verification limitations retain diagnostics without failing a passed Round or blocking acceptance', async (t) => {
  const f = await fixture(t);
  await mkdir(path.join(f.project.rootPath, 'build/App.app'), {
    recursive: true,
  });
  let calls = 0;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls++;
    assert.equal(options.access, 'read-only');
    const req = JSON.parse(options.prompt.split('COORDINATION REQUEST:\n')[1]);
    return {
      completion: Promise.resolve({
        agentSessionId: 'coordinator',
        usage: null,
        finalOutput: JSON.stringify({
          version: 1,
          requestId: req.requestId,
          cardId: id,
          actionId: one,
          contextRevision: req.task.context.contextRevision,
          checklistVersion: req.task.context.acceptanceChecklist.version,
          decision: 'ready',
          summary: 'Existing simulator delivery meets required checks',
          instructions: '',
          verificationPlan: [
            {
              criterionId: 'AC-01',
              mode: 'coordinator',
              evidenceIds: [],
              rationale: 'Reviewed existing fixture test evidence',
            },
          ],
          checks: [
            {
              criterionId: 'AC-01',
              summary: 'Required simulator checks passed',
              status: 'passed',
              evidenceRefs: ['file:build/App.app'],
            },
          ],
          artifactRefs: ['file:build/App.app'],
          additionalFindings: [],
          scopeNotes: [],
          contextSummary:
            'Simulator delivery passed; host bundle inspection is optional.',
        }),
      }),
      cancel: () => {},
    };
  };
  const service = createExecutionService(
    f.store,
    transport,
    new Map(),
    1800000,
    undefined,
    async () => undefined,
  );
  await service.start(f.project, f.input);
  let card = await settled(f.store, f.project);
  const run = card.execution!.runs[0];
  assert.equal(calls, 1);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.error, null);
  assert.equal(run.result?.checks[0].status, 'passed');
  assert.ok(run.evidenceErrors?.length);
  card = await service.update(f.project, id, card.revision, 'accept', run.id);
  assert.deepEqual(card.execution!.acceptedActionIds, [one]);
  assert.deepEqual(card.execution!.runs[0].evidenceErrors, run.evidenceErrors);
  assert.equal(calls, 1);
});

void test('successor context includes only final accepted prerequisite reports, not superseded rounds', async (t) => {
  const f = await fixture(t);
  await f.service.start(f.project, f.input);
  await writeFile(path.join(f.project.rootPath, 'module.txt'), 'first attempt');
  f.calls[0].resolve(delivered(f.calls[0].request));
  let card = await settled(f.store, f.project);
  const superseded = card.execution!.runs[0].outputRef;
  await f.service.start(f.project, {
    ...f.input,
    expectedRevision: card.revision,
    instruction: 'Correct the first output before acceptance.',
  });
  await writeFile(
    path.join(f.project.rootPath, 'module.txt'),
    'accepted correction',
  );
  f.calls[1].resolve(delivered(f.calls[1].request));
  card = await settled(f.store, f.project);
  card = await f.service.update(
    f.project,
    id,
    card.revision,
    'accept',
    card.execution!.runs.at(-1)!.id,
  );
  await f.service.start(f.project, {
    ...f.input,
    expectedRevision: card.revision,
    actionId: two,
  });
  await writeFile(
    path.join(f.project.rootPath, 'module.txt'),
    'second accepted output',
  );
  f.calls[2].resolve(delivered(f.calls[2].request));
  card = await settled(f.store, f.project);
  card = await f.service.update(
    f.project,
    id,
    card.revision,
    'accept',
    card.execution!.runs.at(-1)!.id,
  );
  const successorId = randomUUID();
  const prefix = `implementation/cards/${successorId}/00000001`;
  const successor = {
    ...f.card,
    id: successorId,
    source: {
      ...f.card.source,
      uid: successorId,
      id: 'NODE-next',
      dependsOn: [id],
    },
    sourceRef: `${prefix}/source.md`,
    planRef: `${prefix}/plan.md`,
  };
  await appendCardWorkRecord(
    path.join(f.project.planningPath, 'implementation/cards'),
    successorId,
    0,
    {
      kind: 'system-event',
      stage: 'planning',
      actionId: null,
      event: 'plan-finalized',
      text: 'Successor fixture',
      refs: [],
    },
    {
      'planning-state.json': JSON.stringify(successor),
      'source.md': 'Successor',
      'plan.md': JSON.stringify(successor.plan),
    },
  );
  await f.service.start(f.project, { ...f.input, cardId: successorId });
  const resources = f.calls[3].request.context.resources.filter((r) =>
    r.description.startsWith('Accepted prerequisite'),
  );
  const expected = card.execution!.acceptedActionIds.map((actionId) =>
    path.join(
      f.project.planningPath,
      card.execution!.runs.findLast((r) => r.actionId === actionId)!.outputRef!,
    ),
  );
  assert.deepEqual(
    resources.map((r) => r.ref),
    expected,
  );
  assert.equal(resources.length, 2);
  assert.ok(
    !resources.some(
      (r) => r.ref === path.join(f.project.planningPath, superseded!),
    ),
  );
  f.calls[3].reject(new Error('Fixture finished'));
  for (let i = 0; i < 100; i++) {
    if (
      (await f.store.read(f.project, successorId)).execution!.runs.at(-1)!
        .status !== 'running'
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(
    (await f.store.read(f.project, successorId)).execution!.runs.at(-1)!.status,
    'failed',
  );
});
