'use client';

import { useState, type Dispatch } from 'react';
import { CircleDot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import type { DemoEvent, DemoGoal } from '@/lib/just-do-it-demo';

export function DemoIssueDraft({
  goal,
  actionId,
  initialText = '',
  dispatch,
  onClose,
  onCreated,
}: {
  goal: DemoGoal;
  actionId?: string;
  initialText?: string;
  dispatch: Dispatch<DemoEvent>;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { t } = useUiText();
  const [text, setText] = useState(initialText);
  const [reason, setReason] = useState(
    '这是新增需求，不属于当前已确认的交付范围。',
  );
  const [acceptance, setAcceptance] = useState('');
  const source = goal.actions.find((item) => item.id === actionId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Prepare a follow-up Issue')}</DialogTitle>
          <DialogDescription>
            {t(
              'Only defer out-of-scope work. Current delivery blockers must stay in this Action. No GitHub Issue will actually be created.',
            )}
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs">
          {t('Issue title')}
          <Input
            className="mt-1"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="text-xs">
          {t('Why later?')}
          <Textarea
            className="mt-1"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="text-xs">
          {t('Expected future outcome')}
          <Textarea
            className="mt-1"
            value={acceptance}
            onChange={(event) => setAcceptance(event.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          todo · {goal.sourceId.toLowerCase()}
          {source
            ? ` · ${source.title} · ${t('Round')} ${source.rounds.at(-1)?.number ?? 0}`
            : ''}
        </p>
        <Button
          disabled={!text.trim() || !reason.trim() || !acceptance.trim()}
          onClick={() => {
            dispatch({
              type: 'todo-add',
              goalId: goal.id,
              text,
              reason,
              acceptance,
              actionId,
            });
            onCreated?.();
            onClose();
          }}
        >
          {t('Simulate creating Issue')}
        </Button>
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
                {goal.actions.find((action) => action.id === item.actionId)
                  ?.title ?? item.actionId}{' '}
                · {t('Round')} {item.round ?? 0} · {t('Sample PR')}
              </p>
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
