'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
} from 'react';
import {
  ArrowUpRight,
  CircleDot,
  LoaderCircle,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
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
} from '@/lib/modules/implementation/demo';

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
      timer.current = null;
      onCreated?.();
      onClose();
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
          <DialogTitle>{t('Tell the Agent what to remember')}</DialogTitle>
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

export function DemoTodoNotice({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useUiText();
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(), 4500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <output className="fixed right-5 bottom-5 z-60 flex max-w-[calc(100vw-2.5rem)] items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg">
      <CircleDot className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      {t('Todo added · demo')}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('Close')}
        onClick={onDismiss}
      >
        <X />
      </Button>
    </output>
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
  const [notice, setNotice] = useState(0);
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
      {goal.todos.length > 0 && (
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {goal.todos.map((item, index) => (
            <article key={item.id} className="flex items-start gap-3 px-4 py-3">
              <CircleDot
                className={
                  item.done
                    ? 'mt-1 size-4 shrink-0 text-violet-500'
                    : 'mt-1 size-4 shrink-0 text-emerald-600'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-medium">{item.text}</h3>
                  <span className="text-[11px] text-muted-foreground">
                    #{item.issueNumber ?? index + 101} ·{' '}
                    {t(item.done ? 'Closed' : 'Open')}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.summary ?? t('Follow-up work for a later plan.')}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(item.labels ?? ['todo', goal.sourceId.toLowerCase()]).map(
                    (label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {label}
                      </span>
                    ),
                  )}
                </div>
              </div>
              {item.url &&
              /^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(
                item.url,
              ) ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  GitHub
                  <ArrowUpRight className="size-3" />
                </a>
              ) : (
                <span
                  aria-disabled="true"
                  title={t('Demo Issue: GitHub is not connected.')}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/60"
                >
                  GitHub · {t('Not connected')}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
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
          onCreated={() => setNotice((value) => value + 1)}
        />
      )}
      {notice > 0 && (
        <DemoTodoNotice key={notice} onDismiss={() => setNotice(0)} />
      )}
    </section>
  );
}
