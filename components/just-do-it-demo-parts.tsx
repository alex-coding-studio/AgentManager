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
import Link from 'next/link';
import { graphCardLabel } from '@/lib/graph-identity';
import { cn } from '@/lib/utils';
import {
  goalComplete,
  goalStatus,
  demoSourceHref,
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
  if (!goal.planConfirmed)
    return (
      <p className="text-xs text-muted-foreground">{t('Plan to confirm')}</p>
    );
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{t('Plan progress')}</span>
        <span className="font-mono tabular-nums">
          {t('Completed {done} / {total} steps', {
            done,
            total: goal.actions.length,
          })}
        </span>
      </div>
      <progress
        aria-label={t('Plan progress')}
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
  projectId,
}: {
  goal: DemoGoal;
  state: DemoState;
  onOpen: () => void;
  projectId: string;
}) {
  const { t } = useUiText();
  const current = goal.actions.find((item) => item.stage !== 'verified');
  const complete = goalComplete(goal);
  return (
    <article className="group flex h-60 min-w-0 flex-col rounded-2xl border border-border border-t-2 border-t-foreground/70 bg-card p-4 text-left transition hover:border-foreground/35 hover:shadow-lg">
      <button
        onClick={onOpen}
        type="button"
        aria-label={t('Open goal: {title}', { title: goal.title })}
        className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <div className="grid h-12 w-full shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <h2
            className="line-clamp-2 min-w-0 text-base font-semibold leading-6 [overflow-wrap:anywhere]"
            title={goal.title}
          >
            {goal.title}
          </h2>
          <span className="flex max-w-32 items-start justify-self-end">
            <DemoStatus label={goalStatus(state, goal)} />
          </span>
        </div>
        <p className="mt-2 line-clamp-2 h-8 shrink-0 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
          {goal.summary}
        </p>
        <div className="mt-2 w-full shrink-0">
          <DemoProgress goal={goal} />
        </div>
        <p
          className="mt-2 line-clamp-2 h-8 w-full shrink-0 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]"
          title={complete ? t('None') : current?.title}
        >
          <span className="font-medium">{t('Current action')}：</span>
          {!goal.planConfirmed
            ? t('Plan to confirm')
            : complete
              ? t('None')
              : (current?.title ?? t('None'))}
        </p>
      </button>
      <div className="mt-1 flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border pt-1 text-[10px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <GitBranch className="size-3" />
          {t('Demo branch')}
          <span aria-hidden="true">·</span>
          <GitPullRequest className="size-3" />
          {goal.actions.filter((item) => item.rounds.length).length} PR
        </span>
        {goal.sourceDeleted ? (
          <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-right text-amber-700 dark:text-amber-300">
            <Link2Off className="size-3" />
            {t('Source node deleted')}
          </span>
        ) : (
          <Link
            href={demoSourceHref(projectId, goal)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('Open source node {id} in a new tab', {
              id: graphCardLabel(goal.sourceId),
            })}
            title={t('Open source node {id} in a new tab', {
              id: graphCardLabel(goal.sourceId),
            })}
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded px-1 font-mono hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {graphCardLabel(goal.sourceId)}
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
    </article>
  );
}
