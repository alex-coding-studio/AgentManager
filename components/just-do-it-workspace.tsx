'use client';

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  FlaskConical,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Link2,
  Link2Off,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownReader } from '@/components/markdown-reader';
import { useUiText } from '@/components/ui-language-provider';
import {
  DemoPlanningWorkspace,
  DemoPlanningTimer,
} from '@/components/just-do-it-planning';
import { DemoIssueDraft, DemoIssueTodos } from '@/components/just-do-it-issues';
import {
  DemoAgentProfile,
  DemoProfileSummary,
} from '@/components/demo-agent-profile';
import {
  DemoGoalCard,
  DemoProgress,
  DemoStatus,
} from '@/components/just-do-it-demo-parts';
import {
  actionStatus,
  canExecute,
  createDemoState,
  createLibraryGoal,
  demoReducer,
  defaultDemoProfile,
  goalComplete,
  needsAttention,
  reviewFinding,
  unmetDependencies,
  type DemoAction,
  type DemoEvent,
  type DemoGoal,
  type DemoSimulation,
  type DemoState,
} from '@/lib/just-do-it-demo';
import { cn } from '@/lib/utils';

const sectionStyle = 'rounded-2xl border border-border bg-card';
const labelStyle =
  'text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

export function JustDoItWorkspace({
  projectId,
  projectPath,
}: {
  projectId: string;
  projectPath: string;
}) {
  const { t } = useUiText();
  const [state, dispatch] = useReducer(demoReducer, undefined, createDemoState);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All goals');
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const selected = state.goals.find((item) => item.id === goalId);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [goalId]);
  const counts = {
    'All goals': state.goals.length,
    'Needs attention': state.goals.filter(needsAttention).length,
    'In progress': state.goals.filter((item) => !goalComplete(item)).length,
    Completed: state.goals.filter(goalComplete).length,
  };
  const visible = state.goals.filter(
    (item) =>
      `${item.title} ${item.summary}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === 'All goals' ||
        (filter === 'Needs attention' && needsAttention(item)) ||
        (filter === 'Completed' && goalComplete(item)) ||
        (filter === 'In progress' && !goalComplete(item))),
  );
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/35 px-5 py-2.5 text-[11px] text-muted-foreground lg:px-8">
        <span className="flex items-center gap-2">
          <FlaskConical className="size-3.5 shrink-0" />
          <strong className="font-medium text-foreground">
            {t('Interactive demo')}
          </strong>
          <span>
            {t('Sample data only. No Agent, GitHub, or project writes.')}
          </span>
        </span>
        <button
          className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setResetting(true)}
        >
          <RotateCcw className="size-3" />
          {t('Reset demo')}
        </button>
      </div>
      {selected ? (
        <GoalWorkbench
          key={selected.id}
          state={state}
          goal={selected}
          projectPath={projectPath}
          dispatch={dispatch}
          onBack={() => setGoalId(null)}
          onOpenGoal={setGoalId}
        />
      ) : (
        <div className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={labelStyle}>{t('Execution workspace')}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Just Do It
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  'Turn a goal into something you can verify. One action at a time.',
                )}
              </p>
            </div>
            <Button size="lg" onClick={() => setImporting(true)}>
              <Plus />
              {t('Add a goal')}
            </Button>
          </header>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div
              aria-label={t('Filter goals')}
              className="flex flex-wrap gap-1"
            >
              {Object.entries(counts).map(([name, count]) => (
                <button
                  key={name}
                  aria-pressed={filter === name}
                  onClick={() => setFilter(name)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-ring',
                    filter === name
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {t(name)} <span className="ml-1.5 opacity-65">{count}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                aria-label={t('Search goals')}
                placeholder={t('Search goals')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((goal) => (
              <DemoGoalCard
                key={goal.id}
                goal={goal}
                state={state}
                projectId={projectId}
                onOpen={() => setGoalId(goal.id)}
              />
            ))}
          </div>
          {!visible.length && (
            <div className="py-20 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-3 size-6" />
              <p>{t('No goals match this view.')}</p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setFilter('All goals');
                }}
              >
                {t('Clear filters')}
              </Button>
            </div>
          )}
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            {t(
              'Try the website goal for a review loop, or explore blocked, failed, deleted-source, and completed examples. Reloading resets this demo.',
            )}
          </p>
        </div>
      )}
      {state.goals
        .filter((goal) => goal.planning?.job)
        .map((goal) => (
          <DemoPlanningTimer
            key={goal.planning!.job!.id}
            goalId={goal.id}
            jobId={goal.planning!.job!.id}
            dispatch={dispatch}
          />
        ))}
      {state.goals.flatMap((goal) =>
        goal.actions
          .filter((item) => item.job)
          .map((item) => (
            <DemoRunTimer
              key={item.job!.id}
              goalId={goal.id}
              actionId={item.id}
              jobId={item.job!.id}
              dispatch={dispatch}
            />
          )),
      )}
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('Add a sample goal')}</DialogTitle>
            <DialogDescription>
              {t(
                'This library is fictional. Your real source nodes will not be read or changed.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border p-4">
            <span className={labelStyle}>What’s Next · Formal</span>
            <h3 className="mt-2 text-base font-semibold">
              {createLibraryGoal().title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {createLibraryGoal().summary}
            </p>
          </div>
          <Button
            onClick={() => {
              dispatch({ type: 'add-goal' });
              setImporting(false);
              setGoalId('library');
            }}
          >
            {state.goals.some((item) => item.id === 'library')
              ? t('Open existing goal')
              : t('Add and prepare a plan')}
            <ArrowRight />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={resetting} onOpenChange={setResetting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Reset this demo?')}</DialogTitle>
            <DialogDescription>
              {t(
                'Only the examples in this tab will be reset. No project files are affected.',
              )}
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              dispatch({ type: 'reset' });
              setGoalId(null);
              setQuery('');
              setFilter('All goals');
              setResetting(false);
            }}
          >
            {t('Reset demo')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DemoRunTimer({
  goalId,
  actionId,
  jobId,
  dispatch,
}: {
  goalId: string;
  actionId: string;
  jobId: number;
  dispatch: Dispatch<DemoEvent>;
}) {
  useEffect(() => {
    const timer = setTimeout(
      () => dispatch({ type: 'settle', goalId, actionId, jobId }),
      2200,
    );
    return () => clearTimeout(timer);
  }, [goalId, actionId, jobId, dispatch]);
  return null;
}

function GoalWorkbench({
  state,
  goal,
  dispatch,
  onBack,
  onOpenGoal,
  projectPath,
}: {
  state: DemoState;
  goal: DemoGoal;
  dispatch: Dispatch<DemoEvent>;
  onBack: () => void;
  onOpenGoal: (id: string) => void;
  projectPath: string;
}) {
  const { t } = useUiText();
  const [actionId, setActionId] = useState(
    (goal.actions.find((item) => item.stage !== 'verified') ?? goal.actions[0])
      ?.id ?? '',
  );
  const [panel, setPanel] = useState<'action' | 'plan' | 'todos'>(
    goal.planConfirmed ? 'action' : 'plan',
  );
  const [sourceOpen, setSourceOpen] = useState(false);
  const target =
    goal.actions.find((item) => item.id === actionId) ?? goal.actions[0];
  const blocked = unmetDependencies(state, goal);
  const complete = goalComplete(goal);
  return (
    <div className="mx-auto max-w-[1600px] px-5 py-5 lg:px-8">
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-3.5" />
        {t('All goals')}
      </button>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          {goal.sourceDeleted && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <Link2Off className="size-3" />
                {t('Source node deleted')}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold leading-9 tracking-tight">
              {goal.title}
            </h1>
            <button
              type="button"
              onClick={() => setSourceOpen(true)}
              aria-label={t('View retained source')}
              title={goal.sourceId}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FileText className="size-3.5" />
              {t('Source')}
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {goal.summary}
          </p>
        </div>
        {complete && <DemoStatus label="Completed" />}
      </header>
      {complete && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-600/20 bg-emerald-500/5 p-4 text-sm">
          <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
          <span>
            {t(
              goal.sourceDeleted
                ? 'Goal complete. The deleted source is not recreated.'
                : 'Goal complete. The source stays a Formal Node with an associated completion marker.',
            )}
          </span>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[238px_minmax(0,1fr)]">
        <aside className={cn(sectionStyle, 'min-w-0 p-4 xl:sticky xl:top-5')}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4" />
              {t('Plan')}
            </h2>
            <button
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setPanel('plan')}
            >
              {t('Edit plan')}
            </button>
          </div>
          {goal.planConfirmed ? (
            <DemoProgress goal={goal} />
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              {t('No Actions yet. Confirm the entire plan first.')}
            </p>
          )}
          <div className="mt-5 space-y-1.5">
            {goal.planConfirmed &&
              goal.actions.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActionId(item.id);
                    setPanel('action');
                  }}
                  aria-pressed={panel === 'action' && item.id === target?.id}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl p-3 text-left transition focus-visible:ring-2 focus-visible:ring-ring',
                    panel === 'action' && item.id === target?.id
                      ? 'bg-secondary'
                      : 'hover:bg-secondary/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[10px]',
                      item.stage === 'verified'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border text-muted-foreground',
                    )}
                  >
                    {item.job ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : item.stage === 'verified' ? (
                      <Check className="size-3" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-5">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {t(actionStatus(item))}
                    </span>
                  </span>
                </button>
              ))}
          </div>
          <button
            className={cn(
              'mt-5 flex w-full items-center justify-between rounded-lg border-t border-border px-2 pt-4 pb-2 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              panel === 'todos' && 'text-foreground',
            )}
            onClick={() => setPanel('todos')}
          >
            <span className="flex items-center gap-2">
              <MessageSquare className="size-3.5" />
              {t('For later')}
            </span>
            <span>{goal.todos.filter((item) => !item.done).length}</span>
          </button>
        </aside>
        <div className="min-w-0 space-y-4">
          {goal.dependencyIds.length > 0 && (
            <section
              className={cn(
                'rounded-xl border p-4',
                blocked.length
                  ? 'border-amber-500/25 bg-amber-500/5'
                  : 'border-border bg-card',
              )}
            >
              <h2 className="text-sm font-medium">
                {t('Prerequisite deliveries')}
              </h2>
              {blocked.length > 0 && (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t(
                    'You can prepare this plan, but execution waits for the upstream delivery.',
                  )}
                </p>
              )}
              {goal.dependencyIds.map((id) => {
                const dep = state.goals.find((item) => item.id === id);
                const delivered = Boolean(dep && goalComplete(dep));
                return (
                  <div key={id} className="mt-3 space-y-2 text-xs">
                    <button
                      className="flex items-center gap-2 rounded text-left font-medium focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onOpenGoal(id)}
                    >
                      {delivered ? (
                        <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Link2 className="size-3" />
                      )}
                      {dep?.title ?? id}
                      <ChevronRight className="size-3" />
                    </button>
                    <p className="leading-5 text-muted-foreground">
                      {delivered && dep
                        ? `${t('Delivered input')}: ${dep.actions.map((item) => `${item.rounds.at(-1)?.summary ?? item.output} (${item.rounds.at(-1)?.commit ?? 'demo'})`).join(' ')}`
                        : t(
                            'Delivery context becomes available after verification.',
                          )}
                    </p>
                  </div>
                );
              })}
            </section>
          )}
          {panel === 'plan' || (!goal.planConfirmed && panel !== 'todos') ? (
            <DemoPlanningWorkspace
              key={goal.id}
              goal={goal}
              dispatch={dispatch}
              onDone={() => setPanel('action')}
            />
          ) : panel === 'todos' ? (
            <DemoIssueTodos goal={goal} dispatch={dispatch} />
          ) : (
            <ActionWorkbench
              key={target.id}
              state={state}
              goal={goal}
              target={target}
              projectPath={projectPath}
              dispatch={dispatch}
              onPlan={() => setPanel('plan')}
            />
          )}
        </div>
      </div>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Retained source context')}</DialogTitle>
            <DialogDescription>
              {t(
                'Sample snapshot only. The real source graph is never changed.',
              )}
            </DialogDescription>
          </DialogHeader>
          <h3 className="font-semibold">{goal.title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {goal.summary}
          </p>
          {goal.sourceDeleted ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('Source node deleted. This goal and its work are retained.')}
            </p>
          ) : (
            <Button
              variant="outline"
              onClick={() =>
                dispatch({ type: 'source-deleted', goalId: goal.id })
              }
            >
              <Link2Off />
              {t('Simulate source deletion')}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionWorkbench({
  state,
  goal,
  target,
  dispatch,
  onPlan,
  projectPath,
}: {
  state: DemoState;
  goal: DemoGoal;
  target: DemoAction;
  dispatch: Dispatch<DemoEvent>;
  onPlan: () => void;
  projectPath: string;
}) {
  const { t } = useUiText();
  const feedback = target.draft ?? '';
  const setFeedback = (value: string | ((previous: string) => string)) =>
    dispatch({
      type: 'draft',
      goalId: goal.id,
      actionId: target.id,
      value: typeof value === 'function' ? value(feedback) : value,
    });
  const [simulation, setSimulation] = useState<DemoSimulation>('success');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [roundIndex, setRoundIndex] = useState<number | null>(null);
  const [prOpen, setPrOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const latest = target.rounds.at(-1);
  const viewed =
    roundIndex === null ? latest : (target.rounds[roundIndex] ?? latest);
  const executable = canExecute(state, goal, target);
  const currentStage =
    target.stage === 'ready' ? 0 : target.stage === 'output' ? 1 : 2;
  const busy = Boolean(target.job);
  const canMerge =
    executable &&
    target.stage === 'output' &&
    ['delivered', 'approved'].includes(target.result ?? '') &&
    (target.verification === 'manual' || target.result === 'approved');
  const start = (kind: 'execute' | 'review') => {
    setRoundIndex(null);
    dispatch({
      type: 'start',
      goalId: goal.id,
      actionId: target.id,
      kind,
      simulation,
      input: [
        `Working directory: ${projectPath}`,
        feedback.trim() ||
          (target.result === 'changes'
            ? '按 Review 的阻塞意见修正，再交付一版供验收。'
            : target.input),
      ].join('\n\n'),
    });
  };
  const markdown = viewed
    ? `# ${viewed.snapshot?.title ?? target.title}\n\n${viewed.summary}\n\n## 交付内容\n\n${viewed.snapshot?.output ?? target.output}\n\n## 本轮输入\n\n${viewed.input}\n\n## 验证方式\n\n${viewed.snapshot?.validation ?? target.validation}\n\n> 这是演示产出，没有创建真实代码、Commit 或 PR。`
    : '';
  return (
    <section className={cn(sectionStyle, 'overflow-hidden')}>
      <div className="border-b border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={labelStyle}>
            {t('Current action')} ·{' '}
            {String(
              goal.actions.findIndex((item) => item.id === target.id) + 1,
            ).padStart(2, '0')}
          </span>
          <DemoStatus label={actionStatus(target)} />
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-8">{target.title}</h2>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {['Ready to start', 'Ready to verify', 'Verified'].map(
            (label, index) => (
              <div
                key={label}
                className={cn(
                  'border-t-2 pt-2 text-[10px] sm:text-xs',
                  currentStage === index && target.stage === 'verified'
                    ? 'border-emerald-500 font-medium text-emerald-700 dark:text-emerald-400'
                    : currentStage === index
                      ? 'border-foreground font-medium text-foreground'
                      : index < currentStage
                        ? 'border-emerald-500 text-muted-foreground'
                        : 'border-border text-muted-foreground',
                )}
              >
                <span className="mr-1.5 font-mono opacity-50">
                  0{index + 1}
                </span>
                {t(label)}
              </div>
            ),
          )}
        </div>
      </div>
      <div className="space-y-5 p-5">
        {!goal.planConfirmed && (
          <div className="rounded-xl bg-secondary p-4 text-sm">
            <p>{t('Confirm the plan before starting an action.')}</p>
            <Button className="mt-3" variant="outline" onClick={onPlan}>
              {t('Review plan')}
            </Button>
          </div>
        )}
        {!executable &&
          !busy &&
          target.stage !== 'verified' &&
          goal.planConfirmed &&
          !unmetDependencies(state, goal).length && (
            <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
              {t('Verify the earlier actions before starting this one.')}
            </p>
          )}
        <details open={!latest} className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-xs font-medium">
            {t('Input & expected outcome')}
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Input">
              {t('Working directory')}: {projectPath}
              {'\n\n'}
              {target.input}
            </Fact>
            <Fact label="Expected output">{target.output}</Fact>
            <Fact label="Validation">{target.validation}</Fact>
          </div>
        </details>
        {busy && (
          <div
            aria-live="polite"
            className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"
          >
            <LoaderCircle className="mt-0.5 size-4 animate-spin text-blue-600 dark:text-blue-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {t(
                  target.job?.kind === 'review'
                    ? 'Simulating Agent review…'
                    : 'Simulating execution…',
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'You can leave this card. The result will return to this action.',
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('Cancel demo run')}
              onClick={() =>
                dispatch({
                  type: 'cancel',
                  goalId: goal.id,
                  actionId: target.id,
                })
              }
            >
              <X />
            </Button>
          </div>
        )}
        {!busy &&
          ['error', 'blocked', 'canceled'].includes(target.result ?? '') && (
            <output className="block rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">{t(actionStatus(target))}</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                {t(
                  target.result === 'error'
                    ? 'The simulated process stopped unexpectedly. No new output was created; previous output is retained. Retry when ready.'
                    : target.result === 'blocked'
                      ? 'The Agent needs the supported runtime version before continuing. Add that information below and retry.'
                      : 'This attempt was canceled. Existing output and feedback remain available.',
                )}
              </p>
            </output>
          )}
        {latest && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={labelStyle}>
                {t('Latest output')} · {t('Round')} {latest.number}
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryOpen(!historyOpen)}
                >
                  <History />
                  {t('History')} ({target.rounds.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrOpen(true)}
                >
                  <GitPullRequest />
                  {t('Sample PR')}
                </Button>
              </div>
            </div>
            {historyOpen && (
              <div className="mb-3 flex flex-wrap gap-2">
                {target.rounds.map((item, index) => (
                  <button
                    key={item.number}
                    aria-pressed={viewed?.number === item.number}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                      viewed?.number === item.number
                        ? 'border-foreground bg-secondary'
                        : 'border-border text-muted-foreground',
                    )}
                    onClick={() => setRoundIndex(index)}
                  >
                    <GitCommitHorizontal className="size-3" />
                    {t('Round')} {item.number}
                    <span className="font-mono text-[10px]">{item.commit}</span>
                  </button>
                ))}
              </div>
            )}
            {viewed && viewed.number !== latest.number && (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">
                {t(
                  'Viewing earlier output. Verification and merge always target the latest round.',
                )}
              </p>
            )}
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GitBranch className="size-3" />
              demo/{goal.id}/{target.id}
            </p>
            <DemoProfileSummary value={viewed?.profile} />
            <MarkdownReader
              title={`${t('Round')} ${viewed?.number} · output.md`}
              filePath={`demo/${goal.id}/${target.id}/round-${viewed?.number}/output.md`}
              markdown={markdown}
              compact
              onAddFeedback={
                target.stage === 'verified' || busy
                  ? undefined
                  : (selection) => {
                      setFeedback(
                        (value) =>
                          `${value}${value ? '\n\n' : ''}> ${selection.excerpt}\n`,
                      );
                      feedbackRef.current?.focus();
                    }
              }
            />
          </div>
        )}
        {target.stage === 'output' && (
          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4" />
                {t('Verification')}
              </h3>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t('Review method')}
                <select
                  aria-label={t('Review method')}
                  disabled={busy}
                  className="max-w-44 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  value={target.verification}
                  onChange={(event) =>
                    dispatch({
                      type: 'configure',
                      goalId: goal.id,
                      actionId: target.id,
                      verification: event.target
                        .value as DemoAction['verification'],
                    })
                  }
                >
                  <option value="agent">{t('Agent review')}</option>
                  <option value="manual">{t('I will review')}</option>
                </select>
              </label>
            </div>
            {target.verification === 'agent' && (
              <div className="mt-3">
                <DemoAgentProfile
                  label="Review profile"
                  value={target.reviewProfile ?? defaultDemoProfile()}
                  disabled={busy}
                  onChange={(profile) =>
                    dispatch({
                      type: 'configure',
                      goalId: goal.id,
                      actionId: target.id,
                      reviewProfile: profile,
                    })
                  }
                />
              </div>
            )}
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {t(
                'Completion condition: PR merged. A saved output or a positive review is not completion.',
              )}
            </p>
            {target.result === 'changes' && (
              <div className="mt-3 rounded-lg bg-amber-500/5 p-3 text-xs leading-6">
                <strong className="text-amber-800 dark:text-amber-300">
                  {t('Changes requested')}
                </strong>
                <p>{reviewFinding(target)}</p>
                <p className="mt-1 text-muted-foreground">
                  {t(
                    'These findings will accompany the next correction round. No correction starts automatically.',
                  )}
                </p>
              </div>
            )}
            {target.result === 'approved' && (
              <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
                {t('Review passed. Waiting for your merge decision.')}
              </p>
            )}
            <DemoProfileSummary value={latest?.reviewProfile} />
            <div className="mt-4 flex flex-wrap gap-2">
              {target.verification === 'agent' && (
                <Button
                  variant="outline"
                  disabled={!executable}
                  onClick={() => start('review')}
                >
                  <ShieldCheck />
                  {t('Simulate review')}
                </Button>
              )}
              <Button
                disabled={!canMerge}
                onClick={() =>
                  dispatch({
                    type: 'merge',
                    goalId: goal.id,
                    actionId: target.id,
                  })
                }
              >
                <Check />
                {t('Simulate PR merged')}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {t(
                'Demo rule: first-round review requests changes; review after a correction passes.',
              )}
            </p>
          </div>
        )}
        {target.stage === 'verified' ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
              {t('Verified delivery')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                'The sample PR is merged. This output can now support the next action.',
              )}
            </p>
          </div>
        ) : (
          <div className="border-t border-border pt-5">
            <label
              htmlFor={`feedback-${target.id}`}
              className="mb-2 block text-xs font-medium"
            >
              {t(
                latest
                  ? 'Feedback for the next round'
                  : 'Additional instructions',
              )}
            </label>
            <Textarea
              ref={feedbackRef}
              id={`feedback-${target.id}`}
              disabled={busy}
              className="min-h-24"
              placeholder={t('Tell the Agent what to change or clarify…')}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
            <div className="mt-3">
              <DemoAgentProfile
                label="Execution profile"
                value={
                  target.executionProfile ?? {
                    ...defaultDemoProfile(),
                    agent: target.agent,
                  }
                }
                disabled={busy}
                onChange={(profile) =>
                  dispatch({
                    type: 'configure',
                    goalId: goal.id,
                    actionId: target.id,
                    executionProfile: profile,
                    agent: profile.agent,
                  })
                }
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setIssueOpen(true)}
              >
                {t('Track out-of-scope feedback as Todo')}
              </Button>
              <Button
                size="lg"
                disabled={!executable}
                onClick={() => start('execute')}
              >
                <Play />
                {t(latest ? 'Simulate correction' : 'Simulate execution')}
              </Button>
            </div>
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer">
                {t('Demo scenario controls')}
              </summary>
              <label className="mt-3 flex flex-wrap items-center gap-2">
                {t('Next execution result')}
                <select
                  aria-label={t('Next execution result')}
                  disabled={busy}
                  value={simulation}
                  onChange={(event) =>
                    setSimulation(event.target.value as DemoSimulation)
                  }
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-foreground"
                >
                  <option value="success">{t('Return output')}</option>
                  <option value="blocked">{t('Needs your input')}</option>
                  <option value="error">{t('Execution failed')}</option>
                </select>
              </label>
            </details>
          </div>
        )}
      </div>
      {issueOpen && (
        <DemoIssueDraft
          goal={goal}
          actionId={target.id}
          initialText={feedback}
          dispatch={dispatch}
          onClose={() => setIssueOpen(false)}
          onCreated={() => setFeedback('')}
        />
      )}
      <Dialog open={prOpen} onOpenChange={setPrOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('Sample pull request')}</DialogTitle>
            <DialogDescription>
              {t('Local illustration only. This PR does not exist on GitHub.')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border p-4">
            <h3 className="font-semibold">{target.title}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              demo/{goal.id}/{target.id} → main
            </p>
            <p className="mt-4 text-sm leading-6">{latest?.summary}</p>
            <div className="mt-4">
              <DemoStatus
                label={
                  target.stage === 'verified'
                    ? 'Verified'
                    : actionStatus(target)
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useUiText();
  return (
    <div>
      <h3 className={labelStyle}>{t(label)}</h3>
      <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-6 text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
