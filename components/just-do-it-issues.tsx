'use client';

import { useEffect, useRef, useState, type Dispatch } from 'react';
import { Check, CircleDot, LoaderCircle, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import {
  organizeDemoFollowUp,
  type DemoEvent,
  type DemoGoal,
} from '@/lib/just-do-it-demo';

export function DemoIssueDraft({
  goal,
  actionId,
  initialText = '',
  dispatch,
  onClose,
  onCreated,
  sourceKind = 'idea',
}: {
  goal: DemoGoal;
  actionId?: string;
  initialText?: string;
  dispatch: Dispatch<DemoEvent>;
  onClose: () => void;
  onCreated?: () => void;
  sourceKind?: 'idea' | 'validation';
}) {
  const { t } = useUiText();
  const [text, setText] = useState(initialText);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ReturnType<
    typeof organizeDemoFollowUp
  > | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const submit = () => {
    if (!text.trim() || timer.current !== null) return;
    const organized = organizeDemoFollowUp(goal, text, actionId, sourceKind);
    setWorking(true);
    timer.current = setTimeout(() => {
      dispatch({ type: 'todo-add', goalId: goal.id, ...organized });
      setResult(organized);
      setWorking(false);
      timer.current = null;
      onCreated?.();
    }, 1600);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              result ? 'Follow-up recorded' : 'Tell the Agent what to remember',
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Describe the later work in your own words. The Agent organizes the Issue and its context. This is a scripted demo; no real GitHub Issue is created.',
            )}
          </DialogDescription>
        </DialogHeader>
        {working ? (
          <div
            className="grid min-h-40 place-content-center justify-items-center gap-3"
            aria-busy="true"
          >
            <LoaderCircle className="size-6 animate-spin" />
            <output>{t('Organizing your follow-up…')}</output>
            <Button variant="ghost" onClick={onClose}>
              {t('Cancel')}
            </Button>
          </div>
        ) : result ? (
          <>
            <div className="rounded-xl border border-border p-4">
              <p className="text-[10px] text-muted-foreground">
                todo · {result.origin.sourceId.toLowerCase()}
              </p>
              <h3 className="mt-2 text-base font-semibold">{result.text}</h3>
              <p className="mt-3 text-sm leading-6">{result.acceptance}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {result.reason}
              </p>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer">
                  {t('Original request & context')}
                </summary>
                <p className="mt-2 whitespace-pre-wrap leading-6">
                  {result.request}
                </p>
                <p className="mt-2 leading-5 text-muted-foreground">
                  {result.origin.goalTitle}
                  {result.origin.actionTitle
                    ? ' · ' + result.origin.actionTitle
                    : ''}
                </p>
                {result.origin.outputSummary && (
                  <p className="mt-2 leading-5 text-muted-foreground">
                    {result.origin.outputSummary}
                  </p>
                )}
              </details>
            </div>
            <Button onClick={onClose}>
              <Check />
              {t('Done')}
            </Button>
          </>
        ) : (
          <>
            <label className="text-xs font-medium">
              {t('What should we keep for later?')}
              <Textarea
                className="mt-2 min-h-32"
                value={text}
                placeholder={t(
                  'For example: we may need multi-device login later. Not in this delivery; add it to Todo.',
                )}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {t(
                'The current goal, Action, and available output are included automatically. Current blockers still belong to this delivery.',
              )}
            </p>
            <Button disabled={!text.trim()} onClick={submit}>
              <Sparkles />
              {t('Ask Agent to record it · demo')}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DemoIssueTodos({
  goal,
  dispatch,
}: {
  goal: DemoGoal;
  dispatch: Dispatch<DemoEvent>;
}) {
  const { t } = useUiText();
  const [adding, setAdding] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('For later')}</h2>
        <Button onClick={() => setAdding(true)}>
          <Plus />
          {t('New follow-up')}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        {t(
          'GitHub Issues will own these Todos. This preview only simulates Issue metadata and open/closed state.',
        )}
      </p>
      <div className="mt-4 space-y-3">
        {goal.todos.map((item, index) => (
          <article
            key={item.id}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-medium">
                <CircleDot className="mr-2 inline size-3.5 text-emerald-600" />
                {item.text}
              </h3>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t(item.done ? 'Closed' : 'Open')}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t('Sample Issue')} #{item.issueNumber ?? index + 101} · todo ·{' '}
              {goal.sourceId.toLowerCase()}
              {item.origin
                ? ` · ${t(item.origin.kind === 'validation' ? 'From validation' : 'User idea')}`
                : ''}
            </p>
            <p className="mt-3 text-xs leading-5">
              {item.reason ?? '新增能力，当前交付不包含。'}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t('Expected future outcome')}:{' '}
              {item.acceptance ?? '实施前确认具体边界与验收方式。'}
            </p>
            {item.actionId && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('From action')}:{' '}
                {item.origin?.actionTitle ??
                  goal.actions.find((action) => action.id === item.actionId)
                    ?.title ??
                  item.actionId}
                {item.round
                  ? ` · ${t('Round')} ${item.round} · ${t('Sample PR')}`
                  : ''}
              </p>
            )}
            {item.request && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {t('Original request & context')}
                </summary>
                <p className="mt-2 whitespace-pre-wrap leading-6">
                  {item.request}
                </p>
                <p className="mt-2 text-muted-foreground">
                  {item.origin?.goalTitle}
                </p>
                {item.origin?.outputSummary && (
                  <p className="mt-2 text-muted-foreground">
                    {item.origin.outputSummary}
                  </p>
                )}
              </details>
            )}
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() =>
                dispatch({
                  type: 'todo-toggle',
                  goalId: goal.id,
                  todoId: item.id,
                })
              }
            >
              {t(
                item.done ? 'Simulate Issue reopened' : 'Simulate Issue closed',
              )}
            </Button>
          </article>
        ))}
      </div>
      {!goal.todos.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('No ideas parked here yet.')}
        </p>
      )}
      {adding && (
        <DemoIssueDraft
          goal={goal}
          dispatch={dispatch}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
