import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
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

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const one = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const two = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
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
  const service = createExecutionService(store, transport, new Map());
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
        { summary: 'Read the file', status: 'passed', evidenceRefs: refs },
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

void test('unchanged input files cannot be claimed as new output and interrupted execution does not unlock replanning', async (t) => {
  const { project, store, service, calls, input } = await fixture(t);
  await writeFile(path.join(project.rootPath, 'module.txt'), 'existing');
  await service.start(project, input);
  calls[0].resolve(delivered(calls[0].request));
  const card = await settled(store, project);
  assert.equal(card.execution?.runs[0].status, 'failed');
  assert.match(card.execution!.runs[0].error!, /Unobserved/);
  await assert.rejects(
    () =>
      service.update(
        project,
        id,
        card.revision,
        'accept',
        calls[0].request.requestId,
      ),
    /observed output/,
  );
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
  const service = createExecutionService(store, transport, new Map(), 5);
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
