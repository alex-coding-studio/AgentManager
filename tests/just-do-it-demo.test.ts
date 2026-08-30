import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canExecute,
  createDemoState,
  demoReducer,
  demoSourceHref,
  findDemoSource,
  createLibraryGoal,
  goalComplete,
  planningFor,
  validDemoResources,
  unmetDependencies,
  type DemoState,
  type DemoEvent,
} from '../lib/just-do-it-demo.ts';

void test('source links identify the right module and unique sample node without resolving deleted or foreign sources', () => {
  const goals = [...createDemoState().goals, createLibraryGoal()];
  assert.equal(new Set(goals.map((goal) => goal.sourceId)).size, goals.length);
  for (const goal of goals) {
    assert.match(goal.sourceId, /^NODE-[0-9a-f]{8}$/);
    const url = new URL(demoSourceHref('project-id', goal), 'http://localhost');
    assert.equal(
      url.pathname,
      `/projects/project-id/${goal.source === "What's Next" ? 'whats-next' : 'decomposition'}`,
    );
    assert.equal(url.searchParams.get('node'), goal.sourceId);
    assert.equal(url.searchParams.get('preview'), 'implementation-source');
    assert.equal(
      findDemoSource(goal.source, goal.sourceId)?.id,
      goal.sourceDeleted ? undefined : goal.id,
    );
    assert.equal(
      findDemoSource(
        goal.source === "What's Next" ? 'Break It Down' : "What's Next",
        goal.sourceId,
      ),
      undefined,
    );
  }
  assert.equal(findDemoSource("What's Next", '../../unknown'), undefined);
});

function target(state: DemoState, goalId = 'website', actionId = 'interface') {
  return state.goals
    .find((item) => item.id === goalId)!
    .actions.find((item) => item.id === actionId)!;
}
function run(
  state: DemoState,
  kind: 'execute' | 'review',
  goalId = 'website',
  actionId = 'interface',
  simulation: 'success' | 'error' | 'blocked' = 'success',
) {
  const next = demoReducer(state, {
    type: 'start',
    goalId,
    actionId,
    kind,
    input: '用户补充要求',
    simulation,
  });
  const job = target(next, goalId, actionId).job;
  assert.ok(job);
  return demoReducer(next, { type: 'settle', goalId, actionId, jobId: job.id });
}

void test('review feedback and correction remain in one Action; only explicit merge verifies', () => {
  let state = createDemoState();
  const count = state.goals[0].actions.length;
  state = run(state, 'review');
  assert.equal(target(state).result, 'changes');
  assert.equal(target(state).job, undefined);
  assert.equal(target(state).rounds.length, 1);
  assert.equal(
    demoReducer(state, {
      type: 'merge',
      goalId: 'website',
      actionId: 'interface',
    }),
    state,
  );
  state = run(state, 'execute');
  assert.equal(target(state).rounds.length, 2);
  assert.match(target(state).rounds[1].input, /用户补充要求/);
  assert.match(target(state).rounds[1].input, /Review 阻塞意见/);
  assert.match(target(state).rounds[1].input, /深色模式/);
  state = run(state, 'review');
  assert.equal(target(state).result, 'approved');
  assert.equal(target(state).stage, 'output');
  state = demoReducer(state, {
    type: 'merge',
    goalId: 'website',
    actionId: 'interface',
  });
  assert.equal(target(state).stage, 'verified');
  assert.equal(state.goals[0].actions.length, count);
  assert.equal(goalComplete(state.goals[0]), false);
});

void test('unconfirmed plans, unmet external prerequisites and earlier Actions block execution', () => {
  const state = createDemoState();
  const dep = state.goals.find((item) => item.id === 'integration')!;
  assert.deepEqual(unmetDependencies(state, dep), ['website']);
  assert.equal(canExecute(state, dep, dep.actions[0]), false);
  assert.equal(
    canExecute(state, state.goals[0], target(state, 'website', 'validation')),
    false,
  );
  const next = demoReducer(state, { type: 'add-goal' });
  const added = next.goals.at(-1)!;
  assert.equal(canExecute(next, added, added.actions[0]), false);
  assert.equal(
    demoReducer(next, {
      type: 'start',
      goalId: 'library',
      actionId: 'empty-state',
      kind: 'execute',
      simulation: 'success',
      input: '',
    }),
    next,
  );
});

void test('verified upstream delivery unlocks execution and is included in downstream input', () => {
  let state = createDemoState();
  for (const id of ['interface', 'validation']) {
    if (id === 'validation') state = run(state, 'execute', 'website', id);
    state = demoReducer(state, {
      type: 'configure',
      goalId: 'website',
      actionId: id,
      verification: 'manual',
    });
    state = demoReducer(state, {
      type: 'merge',
      goalId: 'website',
      actionId: id,
    });
  }
  assert.equal(goalComplete(state.goals[0]), true);
  state = generatePlan(state, 'integration');
  state = demoReducer(state, { type: 'plan-accept', goalId: 'integration' });
  assert.deepEqual(unmetDependencies(state, state.goals[1]), []);
  state = run(state, 'execute', 'integration', 'transport');
  assert.match(
    target(state, 'integration', 'transport').rounds[0].input,
    /最小工程与启动说明已准备好/,
  );
});

function generatePlan(
  state: DemoState,
  goalId = 'library',
  variant: 'standard' | 'compact' | 'error' = 'standard',
) {
  const next = demoReducer(state, { type: 'plan-start', goalId, variant });
  const job = next.goals.find((item) => item.id === goalId)!.planning!.job!;
  assert.ok(job);
  return demoReducer(next, { type: 'plan-settle', goalId, jobId: job.id });
}

void test('only whole-plan confirmation materializes the exact draft contracts as Actions', () => {
  let state = demoReducer(createDemoState(), { type: 'add-goal' });
  assert.deepEqual(state.goals.at(-1)!.actions, []);
  assert.equal(
    demoReducer(state, { type: 'plan-accept', goalId: 'library' }),
    state,
  );
  state = generatePlan(state);
  const goal = state.goals.at(-1)!;
  assert.equal(goal.planConfirmed, false);
  assert.deepEqual(goal.actions, []);
  assert.equal(planningFor(goal).steps.length, 3);
  const steps = planningFor(goal).steps.map((item, index) =>
    index === 0
      ? { ...item, output: `${item.output}\n补充经过用户确认的交付文件。` }
      : item,
  );
  state = demoReducer(state, { type: 'plan-update', goalId: 'library', steps });
  state = demoReducer(state, { type: 'plan-accept', goalId: 'library' });
  assert.equal(state.goals.at(-1)!.planConfirmed, true);
  assert.deepEqual(
    state.goals
      .at(-1)!
      .actions.map(({ id, title, input, output, validation }) => ({
        id,
        title,
        input,
        output,
        validation,
      })),
    steps,
  );
});

void test('plan adjustments replace the current draft without retaining response or revision history', () => {
  let state = demoReducer(createDemoState(), { type: 'add-goal' });
  state = generatePlan(state);
  state = demoReducer(state, {
    type: 'plan-update',
    goalId: 'library',
    feedback: '减少步骤，但保持验收边界。',
    profile: { agent: 'Claude', model: 'reasoning-demo', effort: 'high' },
  });
  state = generatePlan(state, 'library', 'compact');
  const plan = state.goals.at(-1)!.planning!;
  assert.equal(plan.steps.length, 2);
  assert.equal('responses' in plan, false);
  assert.equal('revision' in plan, false);
  assert.match(plan.guidance!, /减少步骤/);
  assert.equal(plan.profile.agent, 'Claude');
  assert.deepEqual(state.goals.at(-1)!.actions, []);
});

void test('canceled or failed planning cannot confirm stale draft or apply late results', () => {
  let state = demoReducer(createDemoState(), { type: 'add-goal' });
  state = generatePlan(state);
  state = demoReducer(state, {
    type: 'plan-start',
    goalId: 'library',
    variant: 'standard',
  });
  const jobId = state.goals.at(-1)!.planning!.job!.id;
  state = demoReducer(state, { type: 'plan-cancel', goalId: 'library' });
  assert.equal(
    demoReducer(state, { type: 'plan-settle', goalId: 'library', jobId }),
    state,
  );
  assert.equal(
    demoReducer(state, { type: 'plan-accept', goalId: 'library' }),
    state,
  );
  state = generatePlan(state, 'library', 'error');
  assert.equal(state.goals.at(-1)!.planning!.steps.length, 3);
  assert.equal('responses' in state.goals.at(-1)!.planning!, false);
  assert.equal(
    demoReducer(state, { type: 'plan-accept', goalId: 'library' }),
    state,
  );
});

void test('a targeted planning update leaves siblings untouched and adding a step creates no Action', () => {
  let state = generatePlan(
    demoReducer(createDemoState(), { type: 'add-goal' }),
  );
  const initial = state.goals.at(-1)!.planning!.steps;
  state = demoReducer(state, {
    type: 'plan-update',
    goalId: 'library',
    feedback: '不安装全局依赖。',
  });
  state = demoReducer(state, {
    type: 'plan-start',
    goalId: 'library',
    variant: 'standard',
    targetId: initial[0].id,
  });
  const jobId = state.goals.at(-1)!.planning!.job!.id;
  state = demoReducer(state, { type: 'plan-settle', goalId: 'library', jobId });
  const steps = state.goals.at(-1)!.planning!.steps;
  assert.equal(steps[1], initial[1]);
  assert.equal(steps[2], initial[2]);
  assert.equal(steps[0].guidance, '不安装全局依赖。');
  state = demoReducer(state, {
    type: 'plan-add-step',
    goalId: 'library',
    step: {
      title: '检查启动说明',
      input: 'README',
      output: '可复现的启动说明',
      validation: '按说明能打开首页',
    },
  });
  assert.equal(state.goals.at(-1)!.planning!.steps.length, 4);
  assert.equal(state.goals.at(-1)!.actions.length, 0);
  state = demoReducer(state, { type: 'plan-accept', goalId: 'library' });
  assert.equal(state.goals.at(-1)!.actions.length, 4);
  assert.equal(state.goals.at(-1)!.actions[0].guidance, '不安装全局依赖。');
});

void test('planning resources are bounded in UTF-8 bytes and remain input to the accepted Action', () => {
  let state = demoReducer(createDemoState(), { type: 'add-goal' });
  const resources = [
    { id: 'reference', name: 'boundary.md', content: '本轮不接真实 AI。' },
  ];
  assert.equal(validDemoResources(resources), true);
  assert.equal(
    validDemoResources([{ ...resources[0], content: '测'.repeat(90_000) }]),
    false,
  );
  assert.equal(
    validDemoResources([{ ...resources[0], name: 'binary.exe' }]),
    false,
  );
  state = demoReducer(state, {
    type: 'plan-update',
    goalId: 'library',
    resources,
  });
  state = generatePlan(state);
  state = demoReducer(state, { type: 'plan-accept', goalId: 'library' });
  state = run(state, 'execute', 'library', 'environment');
  assert.match(
    target(state, 'library', 'environment').rounds[0].input,
    /boundary.md/,
  );
  assert.match(
    target(state, 'library', 'environment').rounds[0].input,
    /本轮不接真实 AI/,
  );
  assert.equal('responses' in state.goals.at(-1)!.planning!, false);
});

void test('independent execution and review profiles are captured on the output they produced', () => {
  let state = createDemoState();
  state = demoReducer(state, {
    type: 'configure',
    goalId: 'website',
    actionId: 'interface',
    executionProfile: {
      agent: 'Codex',
      model: 'efficient-demo',
      effort: 'low',
    },
    reviewProfile: { agent: 'Claude', model: 'reasoning-demo', effort: 'high' },
  });
  state = run(state, 'execute');
  state = run(state, 'review');
  const result = target(state).rounds.at(-1)!;
  assert.equal(result.profile?.model, 'efficient-demo');
  assert.equal(result.reviewProfile?.agent, 'Claude');
  assert.equal(result.reviewProfile?.effort, 'high');
});

void test('Issue Todos retain source Action and round without changing delivery or Plan progress', () => {
  let state = createDemoState();
  const before = state.goals[0].actions;
  state = demoReducer(state, {
    type: 'todo-add',
    goalId: 'website',
    actionId: 'interface',
    text: '拖拽排序',
    reason: '新增需求，本轮不包含',
    acceptance: '排序在刷新后保留',
  });
  const issue = state.goals[0].todos.at(-1)!;
  assert.equal(issue.actionId, 'interface');
  assert.equal(issue.round, 1);
  assert.ok(issue.issueNumber);
  assert.equal(issue.acceptance, '排序在刷新后保留');
  assert.equal(state.goals[0].actions, before);
  state = demoReducer(state, {
    type: 'todo-toggle',
    goalId: 'website',
    todoId: issue.id,
  });
  assert.equal(state.goals[0].todos.at(-1)!.done, true);
  assert.equal(state.goals[0].actions, before);
});

void test('default reviewer is independent from the selected executor and plan confirmation retains ready-step configuration', () => {
  let state = createDemoState();
  state = demoReducer(state, {
    type: 'configure',
    goalId: 'website',
    actionId: 'interface',
    agent: 'Claude',
    executionProfile: {
      agent: 'Claude',
      model: 'efficient-demo',
      effort: 'low',
    },
  });
  state = run(state, 'review');
  assert.equal(target(state).rounds.at(-1)!.reviewProfile?.agent, 'Codex');
  state = demoReducer(state, {
    type: 'configure',
    goalId: 'website',
    actionId: 'validation',
    executionProfile: {
      agent: 'Claude',
      model: 'efficient-demo',
      effort: 'low',
    },
  });
  state = generatePlan(state, 'website');
  state = demoReducer(state, { type: 'plan-accept', goalId: 'website' });
  assert.equal(
    target(state, 'website', 'validation').executionProfile?.model,
    'efficient-demo',
  );
});

void test('cancel rejects late results and retry gets a distinct run identity', () => {
  let state = createDemoState();
  state = demoReducer(state, {
    type: 'start',
    goalId: 'website',
    actionId: 'interface',
    kind: 'execute',
    simulation: 'success',
    input: '修正',
  });
  const oldJob = target(state).job!.id;
  state = demoReducer(state, {
    type: 'cancel',
    goalId: 'website',
    actionId: 'interface',
  });
  assert.equal(target(state).rounds.length, 1);
  const stale: DemoEvent = {
    type: 'settle',
    goalId: 'website',
    actionId: 'interface',
    jobId: oldJob,
  };
  assert.equal(demoReducer(state, stale), state);
  state = demoReducer(state, {
    type: 'start',
    goalId: 'website',
    actionId: 'interface',
    kind: 'execute',
    simulation: 'success',
    input: '重试',
  });
  assert.notEqual(target(state).job!.id, oldJob);
  assert.equal(demoReducer(state, stale), state);
});

void test('failed and blocked attempts retain existing output but cannot be merged', () => {
  for (const simulation of ['error', 'blocked'] as const) {
    let state = run(
      createDemoState(),
      'execute',
      'website',
      'interface',
      simulation,
    );
    assert.equal(target(state).result, simulation);
    assert.equal(target(state).rounds.length, 1);
    state = demoReducer(state, {
      type: 'configure',
      goalId: 'website',
      actionId: 'interface',
      verification: 'manual',
    });
    assert.equal(
      demoReducer(state, {
        type: 'merge',
        goalId: 'website',
        actionId: 'interface',
      }),
      state,
    );
    state = run(state, 'execute');
    assert.equal(target(state).rounds.length, 2);
  }
});

void test('source deletion preserves progress, input context and Action history', () => {
  const state = createDemoState();
  const next = demoReducer(state, {
    type: 'source-deleted',
    goalId: 'website',
  });
  assert.equal(next.goals[0].sourceDeleted, true);
  assert.equal(next.goals[0].actions, state.goals[0].actions);
  assert.equal(next.goals[0].requirements, state.goals[0].requirements);
  assert.equal(next.goals[0].sourceId, state.goals[0].sourceId);
});

void test('plan edits preserve verified Actions and reject changes while running', () => {
  const state = createDemoState();
  const event: DemoEvent = {
    type: 'confirm-plan',
    goalId: 'website',
    requirements: '补充说明',
    titles: ['不能改已验收项', '新的后续步骤', '验证'],
  };
  const next = demoReducer(state, event);
  assert.equal(next.goals[0].actions[0], state.goals[0].actions[0]);
  assert.equal(next.goals[0].actions[1].title, '新的后续步骤');
  const running = demoReducer(next, {
    type: 'start',
    goalId: 'website',
    actionId: 'interface',
    kind: 'execute',
    simulation: 'success',
    input: '',
  });
  assert.equal(demoReducer(running, event), running);
});

void test('imports are idempotent; Todos and drafts stay scoped to their owners', () => {
  let state = demoReducer(createDemoState(), { type: 'add-goal' });
  assert.equal(demoReducer(state, { type: 'add-goal' }), state);
  state = demoReducer(state, {
    type: 'todo-add',
    goalId: 'library',
    text: '以后支持快捷键',
  });
  state = demoReducer(state, {
    type: 'draft',
    goalId: 'website',
    actionId: 'interface',
    value: '请修正焦点返回',
  });
  assert.equal(target(state).draft, '请修正焦点返回');
  assert.equal(target(state, 'website', 'validation').draft, undefined);
  assert.equal(state.goals.at(-1)!.todos[0].text, '以后支持快捷键');
  assert.equal(state.goals[1].todos.length, 0);
  assert.equal(goalComplete(state.goals.at(-1)!), false);
});

void test('concurrent results update the originating Action only', () => {
  let state = createDemoState();
  state = demoReducer(state, {
    type: 'start',
    goalId: 'website',
    actionId: 'interface',
    kind: 'execute',
    simulation: 'success',
    input: 'A',
  });
  const first = target(state).job!.id;
  state = demoReducer(state, {
    type: 'start',
    goalId: 'checks',
    actionId: 'retry-command',
    kind: 'execute',
    simulation: 'error',
    input: 'B',
  });
  const second = target(state, 'checks', 'retry-command').job!.id;
  state = demoReducer(state, {
    type: 'settle',
    goalId: 'checks',
    actionId: 'retry-command',
    jobId: second,
  });
  assert.equal(target(state).job!.id, first);
  assert.equal(target(state, 'checks', 'retry-command').result, 'error');
  state = demoReducer(state, {
    type: 'settle',
    goalId: 'website',
    actionId: 'interface',
    jobId: first,
  });
  assert.equal(target(state).rounds.length, 2);
});

void test('reset cannot reuse a pending job identity, and Plan edits do not rewrite saved output', () => {
  let state = createDemoState();
  const previous = target(state).rounds[0];
  state = demoReducer(state, {
    type: 'confirm-plan',
    goalId: 'website',
    requirements: '新要求',
    titles: state.goals[0].actions.map((item) => `${item.title}（调整）`),
  });
  assert.equal(target(state).rounds[0], previous);
  assert.equal(previous.snapshot?.title, '走通第一条页面交互');
  const start: DemoEvent = {
    type: 'start',
    goalId: 'website',
    actionId: 'interface',
    kind: 'execute',
    simulation: 'success',
    input: '执行',
  };
  state = demoReducer(state, start);
  const oldId = target(state).job!.id;
  state = demoReducer(state, { type: 'reset' });
  state = demoReducer(state, start);
  assert.notEqual(target(state).job!.id, oldId);
  assert.equal(
    demoReducer(state, {
      type: 'settle',
      goalId: 'website',
      actionId: 'interface',
      jobId: oldId,
    }),
    state,
  );
});
