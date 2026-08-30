import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCardHarnessPrompt,
  createCardHarnessRequest,
  parseCardHarnessResult,
  JUST_DO_IT_HARNESS_REVISION,
  type CardHarnessContext,
  type CardHarnessRequest,
  type ExecutionStage,
} from '../lib/just-do-it-harness.ts';
import {
  appendCardWorkRecord,
  readCardWorklog,
} from '../lib/just-do-it-worklog.ts';

const cardId = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const outputId = '44444444-4444-4444-8444-444444444444';
const artifact = 'git:0123456789abcdef';

function context(): CardHarnessContext {
  return {
    cardId,
    contextRevision: 0,
    goal: '先跑起可操作的本地网站骨架；这轮不接真实 AI。',
    moduleInstructions:
      'Review uses the local review Skill. Stop before merge.',
    skills: [{ name: 'local-review', path: 'skills/local-review/SKILL.md' }],
    resources: [
      { ref: 'source/output.md', description: 'Accepted source goal' },
    ],
    handoffMarkdown:
      '# Current state\nPlan not finalized. Read references on demand.',
    plan: {
      status: 'draft',
      overview: '先准备环境，再走通页面交互。',
      steps: [
        {
          id: first,
          title: '准备基础开发环境',
          input: '当前项目和相关代码',
          output: '能在本地打开网站',
          validation: '启动并打开首页',
        },
        {
          id: second,
          title: '走通页面交互',
          input: '已完成的网站骨架',
          output: '能输入目标并选择示例任务',
          validation: '操作输入、列表及选择流程',
        },
      ],
    },
    acceptedActionIds: [],
    currentOutput: null,
    execution: {
      running: false,
      hasOutput: false,
      effects: 'clean',
      rollbackConfirmed: false,
      consumedByCardIds: [],
    },
  };
}

function request(stage: ExecutionStage = 'planning') {
  const ctx = context();
  if (stage === 'execution' || stage === 'review')
    ctx.plan!.status = 'finalized';
  if (stage === 'review') {
    ctx.currentOutput = { id: outputId, actionId: first, refs: [artifact] };
    ctx.execution.hasOutput = true;
  }
  return createCardHarnessRequest(
    ctx,
    stage,
    '先把当前这一步做好。',
    stage === 'execution' || stage === 'review' ? first : null,
  );
}

function response(req: CardHarnessRequest): Record<string, unknown> {
  const base = {
    harnessRevision: JUST_DO_IT_HARNESS_REVISION,
    requestId: req.requestId,
    cardId,
    contextRevision: req.context.contextRevision,
    inputFingerprint: req.inputFingerprint,
    handoffSummary: 'Current scope remains local-only.',
    stage: req.stage,
  };
  switch (req.stage) {
    case 'planning':
      return {
        ...base,
        overview: req.context.plan!.overview,
        steps: structuredClone(req.context.plan!.steps),
      };
    case 'execution':
      return {
        ...base,
        actionId: first,
        outcome: 'delivered',
        summary: 'Local homepage runs.',
        artifactRefs: [artifact],
        checks: [
          { summary: 'Build', status: 'passed', evidenceRefs: [artifact] },
        ],
        remaining: [],
      };
    case 'review':
      return {
        ...base,
        actionId: first,
        outputId,
        verdict: 'ready',
        summary: 'Reviewed the homepage.',
        findings: [],
        advisories: [],
        checks: [],
      };
    case 'todo':
      return {
        ...base,
        outcome: 'issue-draft',
        title: '多端登录',
        summary: '后续支持多端登录。',
        bodyMarkdown: '用户要求留待后续，不扩展当前计划。',
        labels: ['todo'],
        sourceRefs: ['source/output.md'],
      };
  }
}

function parse(
  value: unknown,
  req: CardHarnessRequest,
  revision = req.context.contextRevision,
  refs: string[] = [],
) {
  return parseCardHarnessResult(JSON.stringify(value), req, revision, refs);
}

void test('four stages prepare bounded role-specific prompts without invoking a provider', () => {
  for (const stage of ['planning', 'execution', 'review', 'todo'] as const) {
    const req = request(stage);
    const prompt = buildCardHarnessPrompt(req);
    assert.ok(prompt.includes(req.inputFingerprint));
    assert.match(prompt, /provider Sessions are replaceable workers/);
    assert.match(prompt, /host\/system permissions first/);
    assert.match(prompt, /summary is advisory/);
    assert.match(prompt, /Stop after|Stop at/);
    assert.match(prompt, /skills\/local-review\/SKILL.md/);
    assert.equal(parse(response(req), req, 0, [artifact]).stage, stage);
  }
});

void test('semantic plans need no filename inventory or arbitrary five-step minimum', () => {
  const req = request();
  const value = response(req);
  value.steps = req.context.plan!.steps.slice(0, 1);
  assert.equal(parse(value, req).stage, 'planning');
  const many = response(req);
  many.steps = Array.from({ length: 12 }, (_, index) => ({
    ...req.context.plan!.steps[0],
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }));
  assert.equal(parse(many, req).stage, 'planning');
  assert.match(buildCardHarnessPrompt(req), /not a questionnaire/);
});

void test('malformed, wrong-revision, extra completion and empty contract results are rejected', () => {
  const req = request();
  assert.throws(() => parseCardHarnessResult('not JSON', req, 0));
  assert.throws(() => parse({ ...response(req), harnessRevision: 99 }, req));
  assert.throws(() => parse({ ...response(req), completed: true }, req));
  const blank = response(req);
  blank.steps = [{ ...req.context.plan!.steps[0], output: ' ' }];
  assert.throws(() => parse(blank, req));
});

void test('cross-Card, stale-context and wrong-request responses cannot be accepted', () => {
  const req = request();
  assert.throws(
    () => parse({ ...response(req), cardId: second }, req),
    /another request/,
  );
  assert.throws(
    () => parse({ ...response(req), requestId: second }, req),
    /another request/,
  );
  assert.throws(() => parse(response(req), req, 1), /Stale/);
  assert.throws(
    () => parse({ ...response(req), inputFingerprint: 'a'.repeat(64) }, req),
    /another request/,
  );
});

void test('request snapshots isolate caller mutations and detect packet tampering', () => {
  const ctx = context();
  const req = createCardHarnessRequest(ctx, 'planning', 'Original');
  ctx.goal = 'Unrelated goal';
  assert.notEqual(req.context.goal, ctx.goal);
  req.context.goal = ctx.goal;
  assert.throws(() => buildCardHarnessPrompt(req), /changed after/);
});

void test('single-step adjustment preserves siblings, IDs, order and Overview', () => {
  const req = createCardHarnessRequest(
    context(),
    'planning',
    '第一步只配置环境。',
    first,
  );
  const steps = structuredClone(req.context.plan!.steps);
  steps[0].input = 'Inspect existing runtime configuration';
  assert.equal(parse({ ...response(req), steps }, req).stage, 'planning');
  steps[1].output = 'Add real AI';
  assert.throws(() => parse({ ...response(req), steps }, req), /sibling/);
  assert.throws(
    () =>
      parse(
        { ...response(req), steps: [...req.context.plan!.steps].reverse() },
        req,
      ),
    /sibling/,
  );
  assert.throws(
    () => parse({ ...response(req), overview: 'New goal' }, req),
    /sibling/,
  );
  assert.throws(
    () => parse({ ...response(req), steps: [steps[0], steps[0]] }, req),
    /Duplicate/,
  );
});

void test('planning cannot mutate finalized Plans or run concurrently', () => {
  const ctx = context();
  ctx.plan!.status = 'finalized';
  assert.throws(() => createCardHarnessRequest(ctx, 'planning', ''), /Reopen/);
  ctx.plan!.status = 'draft';
  ctx.execution.running = true;
  assert.throws(
    () => createCardHarnessRequest(ctx, 'planning', ''),
    /active run/,
  );
});

void test('no-output is not permission to edit after changed or unknown side effects', () => {
  for (const effects of ['changed', 'unknown'] as const) {
    const ctx = context();
    ctx.execution.effects = effects;
    assert.throws(
      () => createCardHarnessRequest(ctx, 'planning', ''),
      /not clean/,
    );
  }
});

void test('Plan edits after outputs require clean rollback and no downstream consumers', () => {
  const ctx = context();
  ctx.execution.hasOutput = true;
  assert.throws(
    () => createCardHarnessRequest(ctx, 'planning', ''),
    /rollback/,
  );
  ctx.execution.rollbackConfirmed = true;
  ctx.execution.consumedByCardIds = [second];
  assert.throws(
    () => createCardHarnessRequest(ctx, 'planning', ''),
    /downstream/,
  );
  ctx.execution.consumedByCardIds = [];
  ctx.acceptedActionIds = [first];
  assert.throws(
    () => createCardHarnessRequest(ctx, 'planning', ''),
    /withdraw/,
  );
  ctx.acceptedActionIds = [];
  assert.equal(createCardHarnessRequest(ctx, 'planning', '').stage, 'planning');
});

void test('execution requires finalization and cannot skip an unaccepted Action', () => {
  const ctx = context();
  assert.throws(
    () => createCardHarnessRequest(ctx, 'execution', '', first),
    /finalized/,
  );
  ctx.plan!.status = 'finalized';
  assert.throws(
    () => createCardHarnessRequest(ctx, 'execution', '', second),
    /first unaccepted/,
  );
  ctx.acceptedActionIds = [first];
  assert.equal(
    createCardHarnessRequest(ctx, 'execution', '', second).actionId,
    second,
  );
});

void test('review is bound to the selected Action and exact output version', () => {
  const req = request('review');
  assert.equal(
    parse(
      {
        ...response(req),
        advisories: ['A future keyboard shortcut could help.'],
      },
      req,
    ).stage,
    'review',
  );
  assert.throws(
    () => parse({ ...response(req), outputId: second }, req),
    /output version/,
  );
  assert.throws(
    () => parse({ ...response(req), actionId: second }, req),
    /Wrong Action/,
  );
  assert.throws(
    () =>
      parse(
        { ...response(req), verdict: 'ready', findings: ['Homepage crashes'] },
        req,
      ),
    /contradicts/,
  );
  const ctx = context();
  ctx.plan!.status = 'finalized';
  assert.throws(
    () => createCardHarnessRequest(ctx, 'review', '', first),
    /current Action output/,
  );
});

void test('artifact claims require observed references and do not grant acceptance', () => {
  const req = request('execution');
  assert.throws(() => parse(response(req), req), /Unobserved/);
  const result = parse(response(req), req, 0, [artifact]);
  assert.equal(result.stage, 'execution');
  assert.equal('accepted' in result, false);
  assert.throws(() =>
    parse({ ...response(req), accepted: true }, req, 0, [artifact]),
  );
  assert.throws(
    () => parse({ ...response(req), artifactRefs: [], checks: [] }, req),
    /requires an observed/,
  );
});

void test('blocked and failed Responses may retain partial outputs without completing anything', () => {
  const req = request('execution');
  for (const outcome of ['blocked', 'error']) {
    assert.equal(
      parse(
        {
          ...response(req),
          outcome,
          artifactRefs: [],
          checks: [],
          remaining: ['Need user input'],
        },
        req,
      ).stage,
      'execution',
    );
  }
});

void test('Todo is an Issue draft or a decision request, not a write or completion command', () => {
  const req = request('todo');
  assert.equal(
    parse({ ...response(req), outcome: 'needs-decision' }, req).stage,
    'todo',
  );
  assert.throws(() =>
    parse(
      { ...response(req), issueUrl: 'https://github.com/o/r/issues/1' },
      req,
    ),
  );
  assert.throws(
    () => parse({ ...response(req), sourceRefs: ['invented.md'] }, req),
    /Unknown Todo/,
  );
});

void test('recording a later idea does not require stopping the current Action', () => {
  const ctx = context();
  ctx.execution.running = true;
  assert.equal(
    createCardHarnessRequest(ctx, 'todo', '以后再做多端登录。', first).stage,
    'todo',
  );
});

void test('oversized responses fail before parsing', () => {
  const req = request();
  assert.throws(
    () => parseCardHarnessResult('x'.repeat(1_048_577), req, 0),
    /size limit/,
  );
});

async function temp(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'just-do-it-worklog-test-'),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

void test('worklog survives a fresh reader and keeps full user input in references, not the main handoff', async (t) => {
  const root = await temp(t);
  const original = '先不做深色模式。'.repeat(100);
  const firstLog = await appendCardWorkRecord(root, cardId, 0, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: original,
  });
  const secondLog = await appendCardWorkRecord(root, cardId, 1, {
    kind: 'agent-note',
    stage: 'planning',
    actionId: null,
    basedOnRevision: 1,
    summary: '优先走通任务卡片。',
    currentState: 'Plan awaiting user sign-off. Dark mode is excluded.',
  });
  const loaded = await readCardWorklog(root, cardId);
  assert.equal(loaded.revision, 2);
  assert.equal(loaded.handoffPath, secondLog.handoffPath);
  assert.match(loaded.handoffMarkdown, /Dark mode is excluded/);
  assert.equal(loaded.handoffMarkdown.includes(original), false);
  const reference = await readFile(
    path.join(path.dirname(firstLog.handoffPath!), 'reference.md'),
    'utf8',
  );
  assert.ok(reference.includes(original));
  assert.match(loaded.handoffMarkdown, /\.\.\/00000001\/reference.md/);
  assert.match(loaded.handoffMarkdown, /not lifecycle authority/);
});

void test('new facts make summary coverage explicit without rewriting original feedback', async (t) => {
  const root = await temp(t);
  await appendCardWorkRecord(root, cardId, 0, {
    kind: 'agent-note',
    stage: 'planning',
    actionId: null,
    basedOnRevision: 0,
    summary: 'Initial plan',
    currentState: 'Draft only',
  });
  const log = await appendCardWorkRecord(root, cardId, 1, {
    kind: 'system-event',
    stage: 'planning',
    actionId: null,
    event: 'plan-finalized',
    text: 'User confirmed the whole Plan.',
    refs: ['plan.md'],
  });
  assert.match(log.handoffMarkdown, /Summary covers facts through revision 0/);
  assert.match(log.handoffMarkdown, /plan-finalized/);
  await assert.rejects(
    () =>
      appendCardWorkRecord(root, cardId, 2, {
        kind: 'agent-note',
        stage: 'planning',
        actionId: null,
        basedOnRevision: 0,
        summary: 'Stale',
        currentState: 'Stale',
      }),
    /current revision/,
  );
});

void test('Agent notes cannot smuggle system event fields into the worklog', async (t) => {
  const root = await temp(t);
  const record = {
    kind: 'agent-note' as const,
    stage: 'planning' as const,
    actionId: null,
    basedOnRevision: 0,
    summary: 'Claimed acceptance',
    currentState: 'Agent says done',
    event: 'user-accepted',
  };
  await assert.rejects(
    () => appendCardWorkRecord(root, cardId, 0, record),
    /Invalid Card work record/,
  );
  assert.equal((await readCardWorklog(root, cardId)).revision, 0);
});

void test('worklog compare-and-swap prevents concurrent or stale overwrites', async (t) => {
  const root = await temp(t);
  const record = {
    kind: 'user-input' as const,
    stage: 'planning' as const,
    actionId: null,
    text: 'Original request',
  };
  const results = await Promise.allSettled([
    appendCardWorkRecord(root, cardId, 0, record),
    appendCardWorkRecord(root, cardId, 0, {
      ...record,
      text: 'Competing request',
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal((await readCardWorklog(root, cardId)).revision, 1);
  await assert.rejects(
    () => appendCardWorkRecord(root, cardId, 0, record),
    /revision conflict/,
  );
});

void test('interrupted uncommitted writes are ignored; committed corruption fails closed', async (t) => {
  const root = await temp(t);
  await mkdir(path.join(root, cardId, '.pending-interrupted'), {
    recursive: true,
  });
  assert.equal((await readCardWorklog(root, cardId)).revision, 0);
  const log = await appendCardWorkRecord(root, cardId, 0, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: 'User words',
  });
  await writeFile(log.handoffPath!, 'Invented completion');
  await assert.rejects(
    () => readCardWorklog(root, cardId),
    /differs from recorded/,
  );
});

void test('foreign identities, unsafe paths and symlinked Cards cannot become work records', async (t) => {
  const root = await temp(t);
  await assert.rejects(() => readCardWorklog(root, '../escape'), /UUID/);
  await mkdir(path.join(root, 'other'));
  await symlink(path.join(root, 'other'), path.join(root, cardId));
  await assert.rejects(() => readCardWorklog(root, cardId), /Invalid Card/);
});

void test('worklog rejects revision gaps and foreign Card records', async (t) => {
  const root = await temp(t);
  const log = await appendCardWorkRecord(root, cardId, 0, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: 'Original',
  });
  const file = path.join(path.dirname(log.handoffPath!), 'event.json');
  const event = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify({ ...event, cardId: second }));
  await assert.rejects(
    () => readCardWorklog(root, cardId),
    /identity mismatch/,
  );
  await writeFile(file, JSON.stringify(event));
  await mkdir(path.join(root, cardId, '00000003'));
  await assert.rejects(() => readCardWorklog(root, cardId), /revision gap/);
});

void test('invalid acceptance order cannot bypass sequential execution', () => {
  const ctx = context();
  ctx.plan!.status = 'finalized';
  ctx.acceptedActionIds = [second];
  assert.throws(
    () => createCardHarnessRequest(ctx, 'execution', '', first),
    /contiguous prefix/,
  );
});

void test('main handoff stays bounded while the index preserves every stage reference', async (t) => {
  const root = await temp(t);
  for (let index = 0; index < 10; index++) {
    await appendCardWorkRecord(root, cardId, index, {
      kind: 'system-event',
      stage: 'execution',
      actionId: first,
      event: 'run-ended',
      text: 'A long detailed execution result '.repeat(100),
      refs: [artifact],
    });
  }
  const log = await readCardWorklog(root, cardId);
  assert.ok(log.handoffMarkdown.length < 3000);
  assert.equal((log.handoffMarkdown.match(/reference\.md/g) ?? []).length, 3);
  const index = await readFile(
    path.join(path.dirname(log.handoffPath!), 'INDEX.md'),
    'utf8',
  );
  assert.equal((index.match(/reference\.md/g) ?? []).length, 10);
  assert.equal(
    (await readdir(path.join(root, cardId))).filter((name) =>
      name.startsWith('.pending-'),
    ).length,
    0,
  );
});

void test('persisted feedback supports fresh planning and rejects a response after new feedback arrives', async (t) => {
  const root = await temp(t);
  const log = await appendCardWorkRecord(root, cardId, 0, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: '把本地网站做出来，不接真实 AI。',
  });
  const ctx = context();
  ctx.contextRevision = log.revision;
  ctx.handoffMarkdown = log.handoffMarkdown;
  ctx.resources.push({
    ref: log.handoffPath!,
    description: 'Read references relative to this handoff document',
  });
  const req = createCardHarnessRequest(ctx, 'planning', '先做两步即可。');
  assert.equal(parse(response(req), req, 1).stage, 'planning');
  const newer = await appendCardWorkRecord(root, cardId, 1, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: '先不做深色模式。',
  });
  assert.throws(() => parse(response(req), req, newer.revision), /Stale/);
});
