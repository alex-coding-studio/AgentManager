export type DemoStage = 'ready' | 'output' | 'verified';
export type DemoResult =
  | 'delivered'
  | 'changes'
  | 'approved'
  | 'blocked'
  | 'error'
  | 'canceled';
export type DemoSimulation = 'success' | 'blocked' | 'error';
export type DemoRound = {
  number: number;
  input: string;
  summary: string;
  commit: string;
  snapshot?: { title: string; output: string; validation: string };
  review?: 'changes' | 'approved';
};
export type DemoAction = {
  id: string;
  title: string;
  input: string;
  process: string;
  output: string;
  validation: string;
  stage: DemoStage;
  result?: DemoResult;
  rounds: DemoRound[];
  agent: 'Codex' | 'Claude';
  verification: 'agent' | 'manual';
  draft?: string;
  job?: {
    id: number;
    kind: 'execute' | 'review';
    simulation: DemoSimulation;
    input: string;
  };
};
export type DemoGoal = {
  id: string;
  title: string;
  summary: string;
  source: "What's Next" | 'Break It Down';
  sourceId: string;
  sourceDeleted: boolean;
  dependencyIds: string[];
  requirements: string;
  planConfirmed: boolean;
  actions: DemoAction[];
  todos: { id: string; text: string; done: boolean }[];
};
export type DemoState = { goals: DemoGoal[]; sequence: number };

function action(id: string, title: string, output: string): DemoAction {
  return {
    id,
    title,
    output,
    input: '使用当前目标的说明、用户要求与已验收的前置成果。',
    process: '检查现有实现，完成这一步所需的最小改动，运行检查并整理交付说明。',
    validation: '在本地走通约定的流程；检查通过后合并对应 PR。',
    stage: 'ready',
    rounds: [],
    agent: 'Codex',
    verification: 'agent',
  };
}

function round(
  number: number,
  summary: string,
  review?: DemoRound['review'],
): DemoRound {
  return {
    number,
    input: '按已确认的计划完成本步，并保留可复现的验证步骤。',
    summary,
    commit: `demo-${number.toString().padStart(3, '0')}`,
    review,
  };
}

export function createDemoState(): DemoState {
  const environment = action(
    'environment',
    '准备基础开发环境',
    '一个可以启动并继续开发的最小工程，以及启动说明。',
  );
  environment.stage = 'verified';
  environment.rounds = [
    round(
      1,
      '最小工程与启动说明已准备好；版本检查和首页启动验证通过。',
      'approved',
    ),
  ];
  const interfaceAction = action(
    'interface',
    '走通第一条页面交互',
    '输入一个目标，查看示例任务卡，再选出准备开始的第一步。',
  );
  interfaceAction.stage = 'output';
  interfaceAction.result = 'delivered';
  interfaceAction.rounds = [
    round(
      1,
      '目标输入、示例任务和选择起点已串起来。现在可以检查页面是否符合预期。',
    ),
  ];
  const removed = action(
    'removed-notes',
    '整理本地启动说明',
    '一份包含启动命令和常见问题的 README。',
  );
  removed.result = 'blocked';
  const done = action(
    'dark-mode',
    '验证深色模式的阅读体验',
    '浅色与深色模式均可阅读，切换后保持用户偏好。',
  );
  done.stage = 'verified';
  done.rounds = [
    round(1, '深色界面与偏好恢复已验收，示例 PR 已合并。', 'approved'),
  ];
  const failed = action(
    'retry-command',
    '为本地流程补充自动检查',
    '能重复运行的验证命令和结果说明。',
  );
  failed.result = 'error';
  const changes = action(
    'keyboard-review',
    '补齐键盘操作',
    '不使用鼠标也能走通目标输入与卡片选择。',
  );
  changes.stage = 'output';
  changes.result = 'changes';
  changes.rounds = [
    round(1, '基本键盘路径已经加入，但焦点返回还需要修正。', 'changes'),
  ];
  const state: DemoState = {
    sequence: 10,
    goals: [
      {
        id: 'website',
        title: '先跑起一个可操作的本地网站骨架',
        summary:
          '用固定示例串起目标输入、任务卡片和选择第一步，先验证交互，再接真实 AI。',
        source: "What's Next",
        sourceId: 'sample-website',
        sourceDeleted: false,
        dependencyIds: [],
        requirements:
          '本地运行；优先桌面使用；支持深色模式与中英文界面。暂不接数据库和真实 Agent。',
        planConfirmed: true,
        actions: [
          environment,
          interfaceAction,
          action(
            'validation',
            '验证完整使用路径',
            '一份端到端验证记录，明确已可用的流程与仍为模拟的部分。',
          ),
        ],
        todos: [
          {
            id: 'shortcuts',
            text: '之后增加快捷键，当前不阻塞示例流程验收。',
            done: false,
          },
        ],
      },
      {
        id: 'integration',
        title: '把示例流程换成一次真实 AI 拆解',
        summary:
          '基于已验收的网站骨架接入一次真实请求，让等待、取消和失败都可以理解。',
        source: 'Break It Down',
        sourceId: 'sample-integration',
        sourceDeleted: false,
        dependencyIds: ['website'],
        requirements: '沿用本地网站的输入与卡片交互，不扩展到自动执行代码。',
        planConfirmed: false,
        actions: [
          action(
            'transport',
            '接入一次受控请求',
            '一条能返回真实拆解结果的本地请求路径。',
          ),
          action(
            'recovery',
            '验证取消与失败恢复',
            '取消和重试后仍保持可理解的请求状态。',
          ),
        ],
        todos: [],
      },
      {
        id: 'keyboard',
        title: '让主要流程可以用键盘操作',
        summary: '关注焦点顺序、对话框关闭后的焦点返回和可见反馈。',
        source: 'Break It Down',
        sourceId: 'sample-keyboard',
        sourceDeleted: false,
        dependencyIds: [],
        requirements: '先覆盖输入、选择和返回，不添加全局快捷键系统。',
        planConfirmed: true,
        actions: [changes],
        todos: [],
      },
      {
        id: 'checks',
        title: '让本地验证可以重复运行',
        summary:
          '执行遇到错误时保留上下文，通过反馈和重试继续完成同一个 Action。',
        source: 'Break It Down',
        sourceId: 'sample-checks',
        sourceDeleted: false,
        dependencyIds: [],
        requirements: '使用已有工具，不增加外部服务。',
        planConfirmed: true,
        actions: [failed],
        todos: [],
      },
      {
        id: 'notes',
        title: '整理新项目的启动说明',
        summary: '来源节点已删除，但目标内容、计划和执行记录仍然保留。',
        source: "What's Next",
        sourceId: 'sample-notes',
        sourceDeleted: true,
        dependencyIds: [],
        requirements:
          '说明面向第一次打开项目的人。需要用户补充约定的运行环境。',
        planConfirmed: true,
        actions: [removed],
        todos: [],
      },
      {
        id: 'appearance',
        title: '让晚上使用的界面更舒适',
        summary: '完成深色界面的阅读验证；完成结果可以回显到来源节点。',
        source: "What's Next",
        sourceId: 'sample-appearance',
        sourceDeleted: false,
        dependencyIds: [],
        requirements: '沿用现有配色，不改变用户生成的内容。',
        planConfirmed: true,
        actions: [done],
        todos: [],
      },
    ],
  };
  return {
    ...state,
    goals: state.goals.map((goal) => ({
      ...goal,
      actions: goal.actions.map((item) => ({
        ...item,
        rounds: item.rounds.map((version) => ({
          ...version,
          snapshot: {
            title: item.title,
            output: item.output,
            validation: item.validation,
          },
        })),
      })),
    })),
  };
}

export function createLibraryGoal(): DemoGoal {
  return {
    id: 'library',
    title: '给首次打开网站的人一个清楚的起点',
    summary: '用一个轻量空状态帮助用户理解可以输入什么，以及接下来会发生什么。',
    source: "What's Next",
    sourceId: 'sample-onboarding',
    sourceDeleted: false,
    dependencyIds: [],
    requirements: '不添加教学弹窗，用一个示例和明确的开始按钮。',
    planConfirmed: false,
    actions: [
      action(
        'empty-state',
        '准备一个可理解的空状态',
        '目标输入示例、简短说明和可操作的开始入口。',
      ),
      action(
        'first-use',
        '验证第一次使用',
        '从空白页面到第一张任务卡的完整体验。',
      ),
    ],
    todos: [],
  };
}

export function goalComplete(goal: DemoGoal) {
  return (
    goal.actions.length > 0 &&
    goal.actions.every((item) => item.stage === 'verified')
  );
}
export function unmetDependencies(state: DemoState, goal: DemoGoal) {
  return goal.dependencyIds.filter(
    (id) => !state.goals.some((item) => item.id === id && goalComplete(item)),
  );
}
export function canExecute(
  state: DemoState,
  goal: DemoGoal,
  target: DemoAction,
) {
  const index = goal.actions.findIndex((item) => item.id === target.id);
  return (
    goal.planConfirmed &&
    !unmetDependencies(state, goal).length &&
    index >= 0 &&
    goal.actions.slice(0, index).every((item) => item.stage === 'verified') &&
    target.stage !== 'verified' &&
    !target.job
  );
}
export function needsAttention(goal: DemoGoal) {
  return goal.actions.some(
    (item) =>
      !item.job &&
      (item.stage === 'output' ||
        ['error', 'blocked', 'changes'].includes(item.result ?? '')),
  );
}
export function goalStatus(state: DemoState, goal: DemoGoal): string {
  if (goalComplete(goal)) return 'Completed';
  if (goal.actions.some((item) => item.job)) return 'Agent is running';
  if (unmetDependencies(state, goal).length) return 'Waiting for prerequisite';
  if (!goal.planConfirmed) return 'Plan to confirm';
  if (needsAttention(goal)) return 'Needs attention';
  return 'Ready to start';
}
export function actionStatus(target: DemoAction): string {
  if (target.job)
    return target.job.kind === 'review' ? 'Verifying' : 'Processing';
  if (target.stage === 'verified') return 'Verified';
  if (target.result === 'changes') return 'Changes requested';
  if (target.result === 'approved') return 'Ready to merge';
  if (target.result === 'blocked') return 'Needs your input';
  if (target.result === 'error') return 'Execution failed';
  if (target.result === 'canceled') return 'Canceled';
  return target.stage === 'output' ? 'Ready to verify' : 'Ready to start';
}

export function reviewFinding(target: DemoAction) {
  return ['interface', 'keyboard-review'].includes(target.id)
    ? 'Review 阻塞意见：关闭对话框后恢复焦点，并增加回归检查。'
    : 'Review 阻塞意见：交付说明缺少可复现的验收步骤，请补充验证过程与结果。';
}

export type DemoEvent =
  | { type: 'reset' }
  | { type: 'add-goal' }
  | { type: 'source-deleted'; goalId: string }
  | { type: 'draft'; goalId: string; actionId: string; value: string }
  | {
      type: 'confirm-plan';
      goalId: string;
      requirements: string;
      titles: string[];
    }
  | { type: 'todo-add'; goalId: string; text: string }
  | { type: 'todo-toggle'; goalId: string; todoId: string }
  | {
      type: 'configure';
      goalId: string;
      actionId: string;
      agent?: DemoAction['agent'];
      verification?: DemoAction['verification'];
    }
  | {
      type: 'start';
      goalId: string;
      actionId: string;
      kind: 'execute' | 'review';
      input: string;
      simulation: DemoSimulation;
    }
  | { type: 'settle'; goalId: string; actionId: string; jobId: number }
  | { type: 'cancel'; goalId: string; actionId: string }
  | { type: 'merge'; goalId: string; actionId: string };

export function demoReducer(state: DemoState, event: DemoEvent): DemoState {
  if (event.type === 'reset')
    return { ...createDemoState(), sequence: state.sequence + 1 };
  if (event.type === 'add-goal')
    return state.goals.some((item) => item.id === 'library')
      ? state
      : { ...state, goals: [...state.goals, createLibraryGoal()] };
  const goal = state.goals.find((item) => item.id === event.goalId);
  if (!goal) return state;
  const updateGoal = (
    next: DemoGoal,
    sequence = state.sequence,
  ): DemoState => ({
    sequence,
    goals: state.goals.map((item) => (item.id === next.id ? next : item)),
  });
  if (event.type === 'source-deleted')
    return updateGoal({ ...goal, sourceDeleted: true });
  if (event.type === 'todo-add')
    return event.text.trim()
      ? updateGoal(
          {
            ...goal,
            todos: [
              ...goal.todos,
              {
                id: `todo-${state.sequence + 1}`,
                text: event.text.trim(),
                done: false,
              },
            ],
          },
          state.sequence + 1,
        )
      : state;
  if (event.type === 'todo-toggle')
    return updateGoal({
      ...goal,
      todos: goal.todos.map((item) =>
        item.id === event.todoId ? { ...item, done: !item.done } : item,
      ),
    });
  if (event.type === 'confirm-plan') {
    if (
      goal.actions.some((item) => item.job) ||
      event.titles.length !== goal.actions.length ||
      event.titles.some((title) => !title.trim())
    )
      return state;
    return updateGoal({
      ...goal,
      planConfirmed: true,
      requirements: event.requirements,
      actions: goal.actions.map((item, index) =>
        item.stage === 'verified'
          ? item
          : { ...item, title: event.titles[index].trim() },
      ),
    });
  }
  const target = goal.actions.find((item) => item.id === event.actionId);
  if (!target) return state;
  const updateAction = (next: DemoAction, sequence = state.sequence) =>
    updateGoal(
      {
        ...goal,
        actions: goal.actions.map((item) =>
          item.id === target.id ? next : item,
        ),
      },
      sequence,
    );
  if (event.type === 'draft')
    return target.job || target.stage === 'verified'
      ? state
      : updateAction({ ...target, draft: event.value });
  if (event.type === 'configure')
    return target.job || target.stage === 'verified'
      ? state
      : updateAction({
          ...target,
          agent: event.agent ?? target.agent,
          verification: event.verification ?? target.verification,
        });
  if (event.type === 'start') {
    if (
      !canExecute(state, goal, target) ||
      (event.kind === 'review' && target.stage !== 'output')
    )
      return state;
    const id = state.sequence + 1;
    return updateAction(
      {
        ...target,
        job: {
          id,
          kind: event.kind,
          simulation: event.simulation,
          input: [
            goal.requirements,
            target.input,
            event.input,
            target.rounds.at(-1)?.review === 'changes'
              ? reviewFinding(target)
              : '',
            ...goal.actions
              .slice(
                0,
                goal.actions.findIndex((item) => item.id === target.id),
              )
              .map((item) => item.rounds.at(-1)?.summary ?? item.output),
            ...goal.dependencyIds.flatMap(
              (dependencyId) =>
                state.goals
                  .find((item) => item.id === dependencyId)
                  ?.actions.map(
                    (item) => item.rounds.at(-1)?.summary ?? item.output,
                  ) ?? [],
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      },
      id,
    );
  }
  if (event.type === 'cancel')
    return target.job
      ? updateAction({ ...target, job: undefined, result: 'canceled' })
      : state;
  if (event.type === 'merge') {
    if (
      !canExecute(state, goal, target) ||
      target.stage !== 'output' ||
      !['delivered', 'approved'].includes(target.result ?? '') ||
      (target.verification === 'agent' && target.result !== 'approved')
    )
      return state;
    return updateAction({ ...target, stage: 'verified', result: 'approved' });
  }
  if (event.type === 'settle' && target.job?.id === event.jobId) {
    const job = target.job;
    if (job.kind === 'review') {
      const result = target.rounds.length < 2 ? 'changes' : 'approved';
      return updateAction({
        ...target,
        job: undefined,
        result,
        rounds: target.rounds.map((item, index) =>
          index === target.rounds.length - 1
            ? { ...item, review: result }
            : item,
        ),
      });
    }
    if (job.simulation !== 'success')
      return updateAction({
        ...target,
        job: undefined,
        result: job.simulation,
      });
    const number = target.rounds.length + 1;
    return updateAction({
      ...target,
      job: undefined,
      stage: 'output',
      result: 'delivered',
      rounds: [
        ...target.rounds,
        {
          number,
          input: job.input,
          snapshot: {
            title: target.title,
            output: target.output,
            validation: target.validation,
          },
          commit: `demo-${job.id.toString().padStart(3, '0')}`,
          summary:
            number > 1
              ? '已根据反馈修正边界情况，保留上一轮成果。新的示例产出已准备好，等待重新验收。'
              : target.output,
        },
      ],
    });
  }
  return state;
}
