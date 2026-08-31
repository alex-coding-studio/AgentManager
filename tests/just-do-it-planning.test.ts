import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
  readdir,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createPlanningService,
  readPlanningInstructions,
  savePlanningInstructions,
  type PlanningCard,
  type StartPlanningInput,
} from '../lib/just-do-it-planning-service.ts';
import {
  readCardWorklog,
  readCardWorkDocument,
  appendCardWorkRecord,
} from '../lib/just-do-it-worklog.ts';
import {
  listPlanningSources,
  readPlanningFile,
} from '../lib/just-do-it-planning-sources.ts';
import {
  buildCodexArguments,
  buildClaudeArguments,
  type LocalAgentResult,
} from '../lib/local-agent-transport.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type { CardHarnessRequest } from '../lib/just-do-it-harness.ts';
import { JUST_DO_IT_BUILT_IN_INSTRUCTIONS } from '../lib/just-do-it-harness.ts';

const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const step1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const step2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'jdi-planning-test-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: uid,
    kind: 'repository',
    name: 'Fixture',
    description: '',
    rootPath,
    codePath: rootPath,
    planningPath: path.join(rootPath, '.agent-manager'),
    createdAt: new Date().toISOString(),
  };
  const nodeDir = path.join(
    project.planningPath,
    'whats-next/nodes/NODE-aaaaaaaa',
  );
  await mkdir(nodeDir, { recursive: true });
  await writeFile(
    path.join(nodeDir, 'node.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'NODE-aaaaaaaa',
      uid,
      role: 'node',
      status: 'accepted',
      title: '本地网站骨架',
      summary: '可以操作任务卡片。',
      dependsOn: [],
      resources: [
        { kind: 'output', path: 'whats-next/nodes/NODE-aaaaaaaa/output.md' },
      ],
    }),
  );
  await writeFile(
    path.join(nodeDir, 'output.md'),
    '# 本地网站骨架\n不要接真实 AI。',
  );
  return project;
}

function controlled() {
  const calls: Array<{
    request: CardHarnessRequest;
    prompt: string;
    model?: string;
    effort?: string;
    resolve: (result: LocalAgentResult) => void;
    reject: (error: Error) => void;
    canceled: boolean;
  }> = [];
  const transport = (
    _agent: unknown,
    input: { prompt: string; model?: string; effort?: string },
  ) => {
    const request = JSON.parse(
      input.prompt
        .split('\nREQUEST DATA')[1]
        .split(':\n')[1]
        .split('\nPlanning-only runtime:')[0],
    ) as CardHarnessRequest;
    let resolve!: (result: LocalAgentResult) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<LocalAgentResult>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const call = { ...input, request, resolve, reject, canceled: false };
    calls.push(call);
    return {
      completion,
      cancel: () => {
        call.canceled = true;
      },
    };
  };
  return {
    calls,
    service: createPlanningService(transport, new Map(), 10_000),
    transport,
  };
}

function input(card: PlanningCard): StartPlanningInput {
  return {
    cardId: card.id,
    expectedRevision: card.revision,
    feedback: '',
    targetId: null,
    requirements: '先用演示数据，不接真实 AI。',
    profile: { agent: 'codex', model: '', effort: '' },
    files: [],
    contextRefs: [],
    retainRefs: card.resources.map((item) => item.ref),
  };
}
function result(request: CardHarnessRequest) {
  if (request.actionId) {
    return {
      agentSessionId: uid,
      usage: null,
      finalOutput: JSON.stringify({
        harnessRevision: request.harnessRevision,
        requestId: request.requestId,
        cardId: uid,
        contextRevision: request.context.contextRevision,
        inputFingerprint: request.inputFingerprint,
        stage: 'planning',
        step: request.context.plan!.steps.find(
          (step) => step.id === request.actionId,
        ),
        handoffSummary: 'Only the selected step was updated.',
      }),
    };
  }
  return {
    agentSessionId: uid,
    usage: {
      inputTokens: 12,
      cachedInputTokens: 3,
      cacheWriteInputTokens: 0,
      outputTokens: 6,
      reasoningOutputTokens: 0,
    },
    finalOutput: JSON.stringify({
      harnessRevision: request.harnessRevision,
      requestId: request.requestId,
      cardId: uid,
      contextRevision: request.context.contextRevision,
      inputFingerprint: request.inputFingerprint,
      stage: 'planning',
      overview: request.context.plan?.overview ?? '先跑环境，再做页面。',
      steps: request.context.plan?.steps ?? [
        {
          id: step1,
          title: '准备环境',
          input: '当前项目',
          output: '本地可运行网站',
          validation: '打开首页',
          acceptanceCriteria: [
            {
              id: 'AC-01',
              criterion: 'Working output',
              passCondition: 'The expected output is readable',
              evidence: 'Output reference',
            },
          ],
        },
        {
          id: step2,
          title: '卡片交互',
          input: '已有页面',
          output: '可选择卡片',
          validation: '实际选择',
          acceptanceCriteria: [
            {
              id: 'AC-01',
              criterion: 'Working output',
              passCondition: 'The expected output is readable',
              evidence: 'Output reference',
            },
          ],
        },
      ],
      handoffSummary:
        'Local-only draft. User review is next; no code execution.',
    }),
  };
}
async function settled(
  service: ReturnType<typeof createPlanningService>,
  project: RegisteredProject,
) {
  for (let index = 0; index < 100; index++) {
    const card = await service.read(project, uid);
    if (card.run?.status !== 'running') return card;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('Run did not settle.');
}

void test('imports accepted formal Nodes idempotently and never imports Candidates or mutates the source', async (t) => {
  const project = await fixture(t);
  const { service } = controlled();
  const nodeFile = path.join(
    project.planningPath,
    'whats-next/nodes/NODE-aaaaaaaa/node.json',
  );
  const before = await readFile(nodeFile, 'utf8');
  const card = await service.importSource(project, 'whats-next', uid);
  assert.equal(card.plan, null);
  assert.deepEqual(card.actions, []);
  assert.equal(
    (await service.importSource(project, 'whats-next', uid)).id,
    card.id,
  );
  assert.equal((await service.list(project)).length, 1);
  assert.equal(await readFile(nodeFile, 'utf8'), before);
  await writeFile(
    nodeFile,
    JSON.stringify({ ...JSON.parse(before), status: 'candidate' }),
  );
  assert.deepEqual(await listPlanningSources(project), []);
  assert.equal(
    (await service.read(project, uid)).source.title,
    card.source.title,
  );
});

void test('real planning transport input, validated draft and exact finalized Actions survive fresh service reads', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  let card = await service.importSource(project, 'whats-next', uid);
  card = await service.start(project, {
    ...input(card),
    profile: { agent: 'codex', model: 'test-model', effort: 'low' },
  });
  assert.equal(card.run?.status, 'running');
  assert.deepEqual(card.actions, []);
  assert.equal(calls[0].model, 'test-model');
  assert.equal(calls[0].effort, 'low');
  calls[0].resolve(result(calls[0].request));
  card = await settled(service, project);
  assert.equal(card.run?.status, 'succeeded');
  assert.equal(card.plan?.steps.length, 2);
  assert.deepEqual(card.actions, []);
  card = await service.update(project, uid, card.revision, 'finalize');
  assert.deepEqual(card.actions, card.plan?.steps);
  assert.equal(card.plan?.status, 'finalized');
  const fresh = createPlanningService(undefined, new Map());
  assert.deepEqual((await fresh.read(project, uid)).actions, card.actions);
  await assert.rejects(() => service.start(project, input(card)), /locked/);
  await assert.rejects(
    () => service.update(project, uid, card.revision, 'reopen'),
    /locked/,
  );
  assert.equal((await service.read(project, uid)).plan?.status, 'finalized');
});

void test('cancel rejects late results and retains the previous Plan for retry', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  let card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  calls[0].resolve(result(calls[0].request));
  card = await settled(service, project);
  const previous = card.plan;
  card = await service.start(project, {
    ...input(card),
    feedback: '调整第一步。',
    targetId: step1,
  });
  card = await service.update(project, uid, card.revision, 'cancel');
  assert.equal(calls[1].canceled, true);
  calls[1].resolve(result(calls[1].request));
  await new Promise((done) => setTimeout(done, 25));
  card = await service.read(project, uid);
  assert.equal(card.run?.status, 'canceled');
  assert.deepEqual(card.plan, previous);
  await assert.rejects(
    () => service.update(project, uid, card.revision, 'finalize'),
    /successful current/,
  );
  await service.start(project, { ...input(card), feedback: '重试' });
  calls[2].resolve(result(calls[2].request));
  assert.equal((await settled(service, project)).run?.status, 'succeeded');
});

void test('single-step wrong sibling output fails without changing the prior draft', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  let card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  calls[0].resolve(result(calls[0].request));
  card = await settled(service, project);
  const before = card.plan;
  await service.start(project, {
    ...input(card),
    targetId: step1,
    feedback: '只改第一步',
  });
  const bad = result(calls[1].request);
  const payload = JSON.parse(bad.finalOutput);
  payload.step.id = step2;
  bad.finalOutput = JSON.stringify(payload);
  calls[1].resolve(bad);
  card = await settled(service, project);
  assert.equal(card.run?.status, 'failed');
  assert.deepEqual(card.plan, before);
  assert.match(card.run.error!, /target step/);
});

void test('concurrent starts and stale finalize requests cannot overwrite a Card', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  const card = await service.importSource(project, 'whats-next', uid);
  const attempts = await Promise.allSettled([
    service.start(project, input(card)),
    service.start(project, input(card)),
  ]);
  assert.equal(
    attempts.filter((item) => item.status === 'fulfilled').length,
    1,
  );
  assert.equal(calls.length, 1);
  calls[0].resolve(result(calls[0].request));
  const done = await settled(service, project);
  await assert.rejects(
    () => service.update(project, uid, card.revision, 'finalize'),
    /changed/,
  );
  assert.equal(done.plan?.status, 'draft');
});

void test('resources and instruction snapshots are persisted before a provider can read them', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  const card = await service.importSource(project, 'whats-next', uid);
  await savePlanningInstructions(
    project,
    'Planning uses local rules. No implementation.',
  );
  await service.start(project, {
    ...input(card),
    files: [{ name: 'requirements.md', content: 'Do not add accounts.' }],
  });
  const request = calls[0].request;
  assert.match(request.context.moduleInstructions, /local rules/);
  const resource = request.context.resources.find(
    (item) => item.description === 'requirements.md',
  )!;
  assert.equal(await readFile(resource.ref, 'utf8'), 'Do not add accounts.');
  await savePlanningInstructions(project, 'New rule');
  assert.match(request.context.moduleInstructions, /local rules/);
  calls[0].resolve(result(request));
  const done = await settled(service, project);
  const logs = await readCardWorklog(
    path.join(project.planningPath, 'implementation/cards'),
    uid,
  );
  assert.ok(
    logs.entries.some(
      (entry) =>
        entry.record.kind === 'user-input' &&
        entry.record.text.includes('resourceNames'),
    ),
  );
  assert.equal(done.resources.length, 1);
  assert.equal(await readPlanningInstructions(project), 'New rule');
});

void test('missing runner after process interruption fails safely without auto-retry', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  const card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  const fresh = createPlanningService(undefined, new Map());
  const recovered = await fresh.read(project, uid);
  assert.equal(recovered.run?.status, 'failed');
  assert.match(recovered.run!.error!, /interrupted/);
  assert.equal(recovered.plan, null);
  calls[0].resolve(result(calls[0].request));
  await new Promise((done) => setTimeout(done, 20));
  assert.equal((await service.read(project, uid)).run?.status, 'failed');
});

void test('provider failures and timeouts keep input and cannot create Actions', async (t) => {
  const project = await fixture(t);
  const { transport, calls } = controlled();
  const service = createPlanningService(transport, new Map(), 20);
  let card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  calls[0].reject(new Error('Unsupported model'));
  card = await settled(service, project);
  assert.match(card.run!.error!, /Unsupported model/);
  assert.equal(card.requirements, input(card).requirements);
  await service.start(project, input(card));
  card = await settled(service, project);
  assert.match(card.run!.error!, /timed out/);
  assert.deepEqual(card.actions, []);
  assert.equal(calls[1].canceled, true);
});

void test('planning rejects unsafe resource paths, unknown retained files and unsupported profiles before spawning', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  const card = await service.importSource(project, 'whats-next', uid);
  await assert.rejects(() =>
    service.start(project, {
      ...input(card),
      contextRefs: ['context/../../secrets.md'],
    }),
  );
  await assert.rejects(
    () =>
      service.start(project, { ...input(card), retainRefs: ['not-owned.md'] }),
    /Unknown retained/,
  );
  await assert.rejects(
    () =>
      service.start(project, {
        ...input(card),
        profile: { agent: 'codex', model: '--dangerously-bypass', effort: '' },
      }),
    /configuration/,
  );
  await writeFile(path.join(project.rootPath, 'outside.md'), 'outside');
  await symlink(
    path.join(project.rootPath, 'outside.md'),
    path.join(project.planningPath, 'escaped.md'),
  );
  await assert.rejects(
    () => readPlanningFile(project, 'escaped.md'),
    /escapes/,
  );
  assert.equal(calls.length, 0);
});

void test('transactional documents publish with their record and reject reserved or escaping names', async (t) => {
  const project = await fixture(t);
  const storage = path.join(project.planningPath, 'transaction');
  const record = {
    kind: 'user-input' as const,
    stage: 'planning' as const,
    actionId: null,
    text: 'Request',
  };
  await assert.rejects(
    () =>
      appendCardWorkRecord(storage, uid, 0, record, { '../escape.json': '{}' }),
    /document name/,
  );
  await assert.rejects(
    () => appendCardWorkRecord(storage, uid, 0, record, { 'event.json': '{}' }),
    /Reserved/,
  );
  await appendCardWorkRecord(storage, uid, 0, record, {
    'planning-state.json': '{"state":"ready"}',
  });
  assert.equal(
    await readCardWorkDocument(storage, uid, 1, 'planning-state.json'),
    '{"state":"ready"}',
  );
  assert.equal((await readdir(path.join(storage, uid))).length, 1);
});

void test('CLI profile arguments preserve read-only behavior and existing defaults', () => {
  const codex = buildCodexArguments({
    workingDirectory: '/fixture',
    prompt: '',
    model: 'chosen-model',
    effort: 'low',
  });
  assert.deepEqual(
    codex.slice(codex.indexOf('--sandbox'), codex.indexOf('--sandbox') + 2),
    ['--sandbox', 'read-only'],
  );
  assert.ok(codex.includes('chosen-model'));
  assert.ok(codex.includes('model_reasoning_effort="low"'));
  assert.equal(codex.at(-1), '-');
  assert.ok(
    !buildCodexArguments({ workingDirectory: '/fixture', prompt: '' }).includes(
      '--model',
    ),
  );
  const claude = buildClaudeArguments(undefined, {
    model: 'chosen-model',
    effort: 'medium',
  });
  assert.ok(claude.includes('--restricted'));
  assert.ok(claude.includes('--safe-mode'));
  assert.ok(claude.includes('Read,Glob,Grep'));
  assert.deepEqual(claude.slice(-4), [
    '--model',
    'chosen-model',
    '--effort',
    'medium',
  ]);
});

void test('a valid scoped patch changes only its target and persists its original feedback', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  let card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  calls[0].resolve(result(calls[0].request));
  card = await settled(service, project);
  const original = structuredClone(card.plan!);
  await service.start(project, {
    ...input(card),
    targetId: step1,
    feedback: '只检查现有基础。',
  });
  const answer = result(calls[1].request);
  const patch = JSON.parse(answer.finalOutput);
  patch.step.output = '已有基础和需要补齐的清单';
  answer.finalOutput = JSON.stringify(patch);
  calls[1].resolve(answer);
  card = await settled(service, project);
  assert.equal(card.run?.status, 'succeeded');
  assert.equal(card.run.feedback, '只检查现有基础。');
  assert.equal(card.plan?.overview, original.overview);
  assert.deepEqual(card.plan?.steps[1], original.steps[1]);
  assert.equal(card.plan?.steps[0].output, patch.step.output);
  assert.equal(card.plan?.steps[0].id, original.steps[0].id);
  assert.match(card.planRef!, /plan\.md$/);
});

void test('scoped feedback cannot alter shared requirements or resources', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  let card = await service.importSource(project, 'whats-next', uid);
  await service.start(project, input(card));
  calls[0].resolve(result(calls[0].request));
  card = await settled(service, project);
  await assert.rejects(
    () =>
      service.start(project, {
        ...input(card),
        targetId: step1,
        requirements: 'Different product',
      }),
    /shared requirements/,
  );
  await assert.rejects(
    () =>
      service.start(project, {
        ...input(card),
        targetId: step1,
        files: [{ name: 'new.md', content: 'New scope' }],
      }),
    /shared requirements/,
  );
  assert.equal(calls.length, 1);
});

void test('own output is preferred and removing the source does not remove retained planning context', async (t) => {
  const project = await fixture(t);
  const { service } = controlled();
  const nodeDir = path.join(
    project.planningPath,
    'whats-next/nodes/NODE-aaaaaaaa',
  );
  const node = JSON.parse(
    await readFile(path.join(nodeDir, 'node.json'), 'utf8'),
  );
  node.resources.unshift({
    kind: 'output',
    path: 'whats-next/nodes/NODE-bbbbbbbb/output.md',
  });
  await writeFile(path.join(nodeDir, 'node.json'), JSON.stringify(node));
  const card = await service.importSource(project, 'whats-next', uid);
  await rm(nodeDir, { recursive: true });
  assert.deepEqual(await listPlanningSources(project), []);
  assert.match(
    await readPlanningFile(project, card.sourceRef),
    /不要接真实 AI/,
  );
  assert.equal((await service.read(project, uid)).id, card.id);
});

void test('custom instructions default to empty, preserve saved text, and can be cleared', async (t) => {
  const project = await fixture(t);
  assert.equal(await readPlanningInstructions(project), '');
  await assert.rejects(
    readFile(path.join(project.planningPath, 'implementation/instructions.md')),
    { code: 'ENOENT' },
  );
  const custom =
    'Use the local iOS setup Skill.\nKeep my additional requirements.\n';
  await savePlanningInstructions(project, custom);
  assert.equal(await readPlanningInstructions(project), custom);
  await savePlanningInstructions(project, JUST_DO_IT_BUILT_IN_INSTRUCTIONS);
  assert.equal(
    await readPlanningInstructions(project),
    JUST_DO_IT_BUILT_IN_INSTRUCTIONS,
  );
  await savePlanningInstructions(project, '');
  assert.equal(await readPlanningInstructions(project), '');
  await assert.rejects(
    () => savePlanningInstructions(project, 'x'.repeat(20001)),
    /at most 20000/,
  );
  assert.equal(await readPlanningInstructions(project), '');
});

void test('planning snapshots custom instructions independently of built-in rules', async (t) => {
  const project = await fixture(t);
  const { service, calls } = controlled();
  const card = await service.importSource(project, 'whats-next', uid);
  const custom = 'Use the local iOS setup Skill for engineering conventions.';
  await savePlanningInstructions(project, custom);
  await service.start(project, input(card));
  assert.equal(calls[0].request.context.moduleInstructions, custom);
  assert.equal(
    calls[0].prompt.split(JUST_DO_IT_BUILT_IN_INSTRUCTIONS).length,
    2,
  );
  await savePlanningInstructions(project, '');
  assert.equal(calls[0].request.context.moduleInstructions, custom);
  calls[0].resolve(result(calls[0].request));
  const current = await settled(service, project);
  await service.start(project, input(current));
  assert.equal(calls[1].request.context.moduleInstructions, '');
  assert.equal(
    calls[1].prompt.split(JUST_DO_IT_BUILT_IN_INSTRUCTIONS).length,
    2,
  );
  calls[1].resolve(result(calls[1].request));
  await settled(service, project);
});

void test('instructions cannot read or write through a directory outside the planning root', async (t) => {
  const project = await fixture(t);
  const outside = path.join(project.rootPath, 'external');
  await mkdir(outside);
  await writeFile(path.join(outside, 'instructions.md'), 'External content');
  await symlink(outside, path.join(project.planningPath, 'implementation'));
  await assert.rejects(() => readPlanningInstructions(project), /escapes/);
  await assert.rejects(
    () => savePlanningInstructions(project, 'Overwrite'),
    /escapes/,
  );
  const { service } = controlled();
  await assert.rejects(
    () => service.importSource(project, 'whats-next', uid),
    /storage directory/,
  );
  assert.deepEqual(await readdir(outside), ['instructions.md']);
  assert.equal(
    await readFile(path.join(outside, 'instructions.md'), 'utf8'),
    'External content',
  );
});
