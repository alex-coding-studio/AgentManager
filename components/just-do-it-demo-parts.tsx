'use client';

import {
  ArrowUpRight,
  Check,
  GitBranch,
  GitPullRequest,
  Link2Off,
  LoaderCircle,
} from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';
import {
  goalComplete,
  goalStatus,
  type DemoGoal,
  type DemoState,
} from '@/lib/just-do-it-demo';

export function DemoStatus({ label }: { label: string }) {
  const { t } = useUiText();
  const good = ['Verified', 'Completed', 'Ready to merge'].includes(label);
  const attention = [
    'Needs attention',
    'Changes requested',
    'Needs your input',
    'Execution failed',
    'Waiting for prerequisite',
  ].includes(label);
  const running = ['Processing', 'Verifying', 'Agent is running'].includes(
    label,
  );
  return (
    <output
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        good
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : attention
            ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
            : running
              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
              : 'bg-secondary text-muted-foreground',
      )}
    >
      {running ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin" />
      ) : good ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {t(label)}
    </output>
  );
}

export function DemoProgress({ goal }: { goal: DemoGoal }) {
  const { t } = useUiText();
  const done = goal.actions.filter((item) => item.stage === 'verified').length;
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{t('Verified actions')}</span>
        <span className="font-mono tabular-nums">
          {done} / {goal.actions.length}
        </span>
      </div>
      <progress
        aria-label={t('Verified actions')}
        max={goal.actions.length}
        value={done}
        className="sr-only"
      />
      <div aria-hidden="true" className="flex gap-1.5">
        {goal.actions.map((item) => (
          <span
            key={item.id}
            className={cn(
              'h-1 flex-1 rounded-full',
              item.stage === 'verified' ? 'bg-emerald-500' : 'bg-foreground/10',
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function DemoGoalCard({
  goal,
  state,
  onOpen,
}: {
  goal: DemoGoal;
  state: DemoState;
  onOpen: () => void;
}) {
  const { t } = useUiText();
  const next = goal.actions.find((item) => item.stage !== 'verified');
  const complete = goalComplete(goal);
  return (
    <button
      onClick={onOpen}
      type="button"
      className="group flex min-h-64 min-w-0 flex-col rounded-2xl border border-border border-t-2 border-t-foreground/70 bg-card p-5 text-left transition hover:border-foreground/35 hover:shadow-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background">
          {t(goal.source)}
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-foreground" />
      </div>
      <h2 className="text-base font-semibold leading-6">{goal.title}</h2>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {goal.summary}
      </p>
      <div className="mt-4">
        <DemoStatus label={goalStatus(state, goal)} />
      </div>
      <p className="mt-3 truncate text-xs text-muted-foreground">
        {complete ? t('Every action has been verified.') : next?.title}
      </p>
      <div className="mt-auto pt-5">
        <DemoProgress goal={goal} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="size-3" />
          {t('Demo branch')}
        </span>
        {goal.sourceDeleted ? (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
            <Link2Off className="size-3" />
            {t('Source node deleted')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <GitPullRequest className="size-3" />
            {goal.actions.filter((item) => item.rounds.length).length}{' '}
            {t('Sample PRs')}
          </span>
        )}
      </div>
    </button>
  );
}
