export type DemoStage = 'ready' | 'output' | 'verified';
export type DemoResult =
  | 'delivered'
  | 'changes'
  | 'approved'
  | 'blocked'
  | 'error'
  | 'canceled';
export type DemoSimulation = 'success' | 'blocked' | 'error';
export type DemoProfile = {
  agent: 'Codex' | 'Claude';
  model: 'default' | 'reasoning-demo' | 'efficient-demo';
  effort: 'default' | 'low' | 'medium' | 'high';
};
export const defaultDemoProfile = (): DemoProfile => ({
  agent: 'Codex',
  model: 'default',
  effort: 'default',
});
export type DemoPlanStep = Pick<
  DemoAction,
  'id' | 'title' | 'input' | 'output' | 'validation'
> & { guidance?: string };
export type DemoPlanResource = {
  id: string;
  name: string;
  content: string;
  libraryPath?: string;
};
export const demoPlanningLibrary: DemoPlanResource[] = [
  {
    id: 'library:Product/demo-experience.md',
    libraryPath: 'Product/demo-experience.md',
    name: 'demo-experience.md',
    content:
      '# Demo experience\n\nKeep the local website readable in dark mode. Start with an editable goal and one clear next step. This is fictional Context Library material.',
  },
  {
    id: 'library:Engineering/demo-runtime.md',
    libraryPath: 'Engineering/demo-runtime.md',
    name: 'demo-runtime.md',
    content:
      '# Demo runtime\n\nReuse the registered project folder. Preserve existing files and use local sample data. No database or live Agent connection in this demonstration.',
  },
];
export function validDemoResources(resources: DemoPlanResource[]) {
  const sizes = resources.map(
    (item) => new TextEncoder().encode(item.content).length,
  );
  return (
    resources.length <= 5 &&
    new Set(resources.map((item) => item.id)).size === resources.length &&
    resources.every((item) => /\.(md|markdown|txt)$/i.test(item.name)) &&
    sizes.every((size) => size <= 262_144) &&
    sizes.reduce((total, size) => total + size, 0) <= 1_048_576
  );
}
export type DemoPlanning = {
  requirements: string;
  feedback: string;
  templates: DemoPlanStep[];
  steps: DemoPlanStep[];
  resources: DemoPlanResource[];
  generated: boolean;
  overview: string;
  guidance?: string;
  profile: DemoProfile;
  error?: 'error' | 'canceled';
  job?: {
    id: number;
    variant: 'standard' | 'compact' | 'error';
    requirements: string;
    feedback: string;
    profile: DemoProfile;
    targetId?: string;
    resources: DemoPlanResource[];
  };
};
export type DemoTodo = {
  id: string;
  text: string;
  done: boolean;
  issueNumber?: number;
  reason?: string;
  acceptance?: string;
  actionId?: string;
  round?: number;
  request?: string;
  origin?: DemoTodoOrigin;
};
export type DemoTodoOrigin = {
  kind: 'idea' | 'validation';
  goalTitle: string;
  sourceId: string;
  actionTitle?: string;
  round?: number;
  outputSummary?: string;
  outputCommit?: string;
  reviewResult?: 'changes' | 'approved';
};

export function organizeDemoFollowUp(
  goal: DemoGoal,
  request: string,
  actionId?: string,
  kind: DemoTodoOrigin['kind'] = 'idea',
) {
  const source = goal.actions.find((item) => item.id === actionId);
  const output = source?.rounds.at(-1);
  const multiDevice = /多端登录|多设备登录|multi.?device.*login/i.test(request);
  return {
    text: multiDevice
      ? '支持多端登录'
      : request.trim().split('\n')[0].slice(0, 100),
    request: request.trim(),
    reason: '按用户要求记录为后续事项，不改变当前 Action 的交付范围。',
    acceptance: multiDevice
      ? '支持在多个设备上登录。后续实施前确认设备范围、会话保留和退出规则，以及对应验收场景。'
      : '后续实施前，结合用户原始需求明确范围、预期成果与验收方式。',
    actionId,
    origin: {
      kind,
      goalTitle: goal.title,
      sourceId: goal.sourceId,
      actionTitle: source?.title,
      round: output?.number,
      outputSummary: output?.summary,
      outputCommit: output?.commit,
      reviewResult: output?.review,
    },
  };
}
export type DemoRound = {
  number: number;
  input: string;
  summary: string;
  commit: string;
  snapshot?: { title: string; output: string; validation: string };
  review?: 'changes' | 'approved';
  profile?: DemoProfile;
  reviewProfile?: DemoProfile;
};
export type DemoAction = {
  guidance?: string;
  id: string;
  title: string;
  input: string;
  output: string;
  validation: string;
  stage: DemoStage;
  result?: DemoResult;
  rounds: DemoRound[];
  agent: 'Codex' | 'Claude';
  verification: 'agent' | 'manual';
  draft?: string;
  executionProfile?: DemoProfile;
  reviewProfile?: DemoProfile;
  job?: {
    id: number;
    kind: 'execute' | 'review';
    simulation: DemoSimulation;
    input: string;
    profile?: DemoProfile;
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
  todos: DemoTodo[];
  planning?: DemoPlanning;
};
export type DemoState = { goals: DemoGoal[]; sequence: number };

function action(id: string, title: string, output: string): DemoAction {
  return {
    id,
    title,
    output,
    input: `工作目录：当前登记的项目路径，不另建仓库。\n来源：目标节点 output.md 与已确认计划。\n本步范围：${title}。复用现有工程，不覆盖用户改动。`,
    validation: `按交付说明在本地复现「${title}」；检查相关行为与错误反馈，确认没有扩大范围。Review 通过并合并对应 PR 后，本步才算完成。`,
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
  environment.input =
    '工作位置：已登记的 AgentManager 项目目录。\n已确认技术：Next.js、TypeScript、npm（演示约定）。\n输入资料：来源 output.md、整份计划、用户补充要求。\n先检查已有 Node 与文件；保留用户改动，不安装全局工具、不接数据库或真实 Agent。';
  environment.output =
    '项目内的 package.json、锁文件、TypeScript 配置、最小应用入口与首页；可重复使用的启动和检查脚本；README 启动说明；包含上述变更的 PR。';
  environment.validation =
    '按 README 安装依赖并启动，浏览器能打开首页且无阻断错误；类型检查与构建通过；检查没有数据库或真实 AI 接入等范围外变更；PR 审查通过并合并。';
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
        sourceId: 'NODE-a81f30c2',
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
        sourceId: 'NODE-b924e1d7',
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
        sourceId: 'NODE-c036f2e8',
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
        sourceId: 'NODE-d147a3f9',
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
        sourceId: 'NODE-e258b4a0',
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
        sourceId: 'NODE-f369c5b1',
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
    goals: state.goals.map((goal) =>
      preparePlanningGoal({
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
      }),
    ),
  };
}

export function createLibraryGoal(): DemoGoal {
  const base = createDemoState().goals[0];
  return preparePlanningGoal({
    id: 'library',
    title: '从零规划 AgentManager 的本地网站骨架',
    summary:
      '先讨论整份执行计划，再确认各步的输入、交付和验收约定。确认前不创建执行 Action。',
    source: "What's Next",
    sourceId: 'NODE-a470d6c2',
    sourceDeleted: false,
    dependencyIds: [],
    requirements:
      '使用已登记的项目路径；本地使用、支持深色与中英文；先用演示数据，不接数据库和真实 AI。',
    planConfirmed: false,
    actions: base.actions.map((item) => ({
      ...item,
      stage: 'ready',
      result: undefined,
      rounds: [],
    })),
    todos: [],
  });
}

function planStep(item: DemoAction): DemoPlanStep {
  return {
    id: item.id,
    title: item.title,
    input: item.input,
    output: item.output,
    validation: item.validation,
    ...(item.guidance !== undefined ? { guidance: item.guidance } : {}),
  };
}
export function planningFor(goal: DemoGoal): DemoPlanning {
  return (
    goal.planning ?? {
      requirements: goal.requirements,
      feedback: '',
      templates: goal.actions.map(planStep),
      steps: goal.planConfirmed ? goal.actions.map(planStep) : [],
      resources: [],
      generated: goal.planConfirmed,
      overview: goal.summary,
      profile: defaultDemoProfile(),
    }
  );
}
function preparePlanningGoal(goal: DemoGoal): DemoGoal {
  if (goal.planConfirmed) return goal;
  return { ...goal, planning: planningFor(goal), actions: [] };
}

function simulatedPlan(
  goal: DemoGoal,
  plan: DemoPlanning,
  variant: 'standard' | 'compact' | 'error',
) {
  const steps = (plan.steps.length ? plan.steps : plan.templates).map(
    (item) => ({ ...item }),
  );
  const feedback = plan.job?.feedback ?? plan.feedback;
  const refineToFour =
    /(?:细化|拆分|分成|拆成).{0,5}(?:4|四)\s*(?:个)?\s*步/.test(feedback) &&
    !/不要|不用|不必|无需|别/.test(feedback);
  if (
    refineToFour &&
    steps.length === 3 &&
    steps[1].id === 'interface' &&
    goal.actions.every((item) => !item.rounds.length)
  ) {
    const original = steps[1];
    steps.splice(
      1,
      1,
      {
        ...original,
        title: '搭建目标输入与示例列表',
        output: '可输入目标的页面与固定示例任务列表，不接真实 AI。',
        validation: '提交一个目标后能看到对应示例列表；输入校验与空状态可用。',
      },
      {
        id: 'selection-feedback',
        title: '完成卡片选择与状态反馈',
        input: '上一项交付的目标输入页面和示例列表。',
        output: '可以选中第一张任务卡，并清楚看到选中和取消选择的反馈。',
        validation: '鼠标和键盘都能完成选择与取消；原有输入和列表行为不退化。',
      },
    );
    return steps;
  }
  if (
    variant === 'compact' &&
    steps.length > 2 &&
    goal.actions.every((item) => !item.rounds.length)
  ) {
    const tail = steps.splice(1);
    steps.push({
      ...tail[0],
      title: '完成示例交互并验收整条路径',
      output: tail.map((item) => item.output).join('\n'),
      validation: tail.map((item) => item.validation).join('\n'),
    });
  }
  return steps;
}

export function demoSourceHref(projectId: string, goal: DemoGoal) {
  const modulePath =
    goal.source === "What's Next" ? 'whats-next' : 'decomposition';
  return `/projects/${encodeURIComponent(projectId)}/${modulePath}?preview=implementation-source&node=${encodeURIComponent(goal.sourceId)}`;
}

export function findDemoSource(source: DemoGoal['source'], nodeId: string) {
  return [...createDemoState().goals, createLibraryGoal()].find(
    (goal) =>
      goal.source === source && goal.sourceId === nodeId && !goal.sourceDeleted,
  );
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
    !goal.planning?.job &&
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
  if (goal.actions.some((item) => item.job) || goal.planning?.job)
    return 'Agent is running';
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
      type: 'plan-update';
      goalId: string;
      requirements?: string;
      feedback?: string;
      profile?: DemoProfile;
      steps?: DemoPlanStep[];
      resources?: DemoPlanResource[];
    }
  | {
      type: 'plan-start';
      goalId: string;
      variant: 'standard' | 'compact' | 'error';
      targetId?: string;
    }
  | { type: 'plan-settle'; goalId: string; jobId: number }
  | { type: 'plan-cancel'; goalId: string }
  | { type: 'plan-accept'; goalId: string }
  | {
      type: 'confirm-plan';
      goalId: string;
      requirements: string;
      titles: string[];
    }
  | {
      type: 'todo-add';
      goalId: string;
      text: string;
      reason?: string;
      acceptance?: string;
      actionId?: string;
      request?: string;
      origin?: DemoTodoOrigin;
    }
  | { type: 'todo-toggle'; goalId: string; todoId: string }
  | {
      type: 'configure';
      goalId: string;
      actionId: string;
      agent?: DemoAction['agent'];
      verification?: DemoAction['verification'];
      executionProfile?: DemoProfile;
      reviewProfile?: DemoProfile;
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
  if (event.type.startsWith('plan-')) {
    const plan = planningFor(goal);
    if (event.type === 'plan-update') {
      if (plan.job || goal.actions.some((item) => item.job)) return state;
      if (event.resources && !validDemoResources(event.resources)) return state;
      const locked = goal.actions.filter((item) => item.rounds.length);
      if (
        event.steps &&
        locked.some(
          (item) =>
            JSON.stringify(event.steps!.find((step) => step.id === item.id)) !==
            JSON.stringify(planStep(item)),
        )
      )
        return state;
      return updateGoal({
        ...goal,
        planning: {
          ...plan,
          requirements: event.requirements ?? plan.requirements,
          feedback: event.feedback ?? plan.feedback,
          profile: event.profile ?? plan.profile,
          steps: event.steps ?? plan.steps,
          resources: event.resources ?? plan.resources,
        },
      });
    }
    if (event.type === 'plan-start') {
      if (plan.job || goal.actions.some((item) => item.job)) return state;
      if (
        event.targetId &&
        (!plan.steps.some((item) => item.id === event.targetId) ||
          goal.actions.some(
            (item) => item.id === event.targetId && item.rounds.length,
          ))
      )
        return state;
      const id = state.sequence + 1;
      return updateGoal(
        {
          ...goal,
          planning: {
            ...plan,
            error: undefined,
            job: {
              id,
              variant: event.variant,
              requirements: plan.requirements,
              feedback: plan.feedback,
              profile: { ...plan.profile },
              targetId: event.targetId,
              resources: plan.resources.map((item) => ({ ...item })),
            },
          },
        },
        id,
      );
    }
    if (event.type === 'plan-cancel')
      return plan.job
        ? updateGoal({
            ...goal,
            planning: { ...plan, job: undefined, error: 'canceled' },
          })
        : state;
    if (event.type === 'plan-settle') {
      if (plan.job?.id !== event.jobId) return state;
      if (plan.job.variant === 'error')
        return updateGoal({
          ...goal,
          planning: { ...plan, job: undefined, error: 'error' },
        });
      const steps = plan.job.targetId
        ? plan.steps.map((item) =>
            item.id === plan.job!.targetId
              ? { ...item, guidance: plan.job!.feedback || item.guidance }
              : item,
          )
        : simulatedPlan(goal, plan, plan.job.variant);
      return updateGoal({
        ...goal,
        planning: {
          ...plan,
          job: undefined,
          steps,
          generated: true,
          overview: plan.job.targetId
            ? plan.overview
            : `先${steps[0]?.title ?? '明确范围'}${
                steps.length > 1
                  ? `，再${steps
                      .slice(1)
                      .map((item) => item.title)
                      .join('，再')}`
                  : ''
              }。每一步都以具体成果和验收约定为边界，整体确认后再执行。`,
          guidance: plan.job.targetId
            ? plan.guidance
            : plan.job.feedback || plan.guidance,
          feedback: '',
        },
      });
    }
    if (event.type === 'plan-accept') {
      if (
        plan.job ||
        plan.error ||
        !plan.generated ||
        !plan.steps.length ||
        goal.actions.some((item) => item.job) ||
        new Set(plan.steps.map((item) => item.id)).size !== plan.steps.length ||
        plan.steps.some(
          (item) =>
            !item.title.trim() ||
            !item.input.trim() ||
            !item.output.trim() ||
            !item.validation.trim(),
        )
      )
        return state;
      const actions = plan.steps.map((step) => {
        const previous = goal.actions.find((item) => item.id === step.id);
        return previous?.rounds.length
          ? previous
          : previous
            ? { ...previous, ...step }
            : {
                ...action(step.id, step.title, step.output),
                ...step,
                executionProfile: defaultDemoProfile(),
                reviewProfile: defaultDemoProfile(),
              };
      });
      return updateGoal({
        ...goal,
        planConfirmed: true,
        requirements: plan.requirements,
        actions,
        planning: {
          ...plan,
          templates: plan.steps.map((item) => ({ ...item })),
        },
      });
    }
  }
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
                issueNumber: state.sequence + 101,
                reason:
                  event.reason?.trim() ||
                  '新增需求，不属于当前已确认的交付范围。',
                acceptance:
                  event.acceptance?.trim() || '后续实施前补充验收约定。',
                actionId: event.actionId,
                request: event.request,
                origin: event.origin,
                round: event.origin
                  ? event.origin.round
                  : goal.actions
                      .find((item) => item.id === event.actionId)
                      ?.rounds.at(-1)?.number,
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
      !goal.planConfirmed ||
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
  if (!('actionId' in event)) return state;
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
          executionProfile: event.executionProfile ?? target.executionProfile,
          reviewProfile: event.reviewProfile ?? target.reviewProfile,
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
          profile: {
            ...(event.kind === 'review'
              ? (target.reviewProfile ?? defaultDemoProfile())
              : (target.executionProfile ?? {
                  ...defaultDemoProfile(),
                  agent: target.agent,
                })),
          },
          input: [
            goal.requirements,
            target.input,
            target.guidance ?? '',
            ...(goal.planning?.resources.map(
              (item) => `${item.name}\n${item.content}`,
            ) ?? []),
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
            ? { ...item, review: result, reviewProfile: job.profile }
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
          profile: job.profile,
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
