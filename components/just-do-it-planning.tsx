'use client';

import { useEffect, useRef, useState, type Dispatch } from 'react';
import { Check, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownReader } from '@/components/markdown-reader';
import { useUiText } from '@/components/ui-language-provider';
import {
  DemoAgentProfile,
  DemoProfileSummary,
} from '@/components/demo-agent-profile';
import {
  planningFor,
  type DemoEvent,
  type DemoGoal,
  type DemoPlanStep,
} from '@/lib/just-do-it-demo';

export function DemoPlanningTimer({
  goalId,
  jobId,
  dispatch,
}: {
  goalId: string;
  jobId: number;
  dispatch: Dispatch<DemoEvent>;
}) {
  useEffect(() => {
    const timer = setTimeout(
      () => dispatch({ type: 'plan-settle', goalId, jobId }),
      1600,
    );
    return () => clearTimeout(timer);
  }, [goalId, jobId, dispatch]);
  return null;
}

export function DemoPlanningWorkspace({
  goal,
  dispatch,
  onDone,
}: {
  goal: DemoGoal;
  dispatch: Dispatch<DemoEvent>;
  onDone: () => void;
}) {
  const { t } = useUiText();
  const plan = planningFor(goal);
  const [variant, setVariant] = useState<'standard' | 'compact' | 'error'>(
    'standard',
  );
  const [history, setHistory] = useState<number | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const busy = Boolean(plan.job) || goal.actions.some((item) => item.job);
  const latest = plan.responses.at(-1);
  const response = history === null ? latest : plan.responses[history];
  const older = response !== latest;
  const invalid = plan.steps.some(
    (item) =>
      !item.title.trim() ||
      !item.input.trim() ||
      !item.output.trim() ||
      !item.validation.trim(),
  );
  const updateStep = (id: string, field: keyof DemoPlanStep, value: string) =>
    dispatch({
      type: 'plan-update',
      goalId: goal.id,
      steps: plan.steps.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    });
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4" />
          {t('Plan the whole goal')}
        </h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {t(
            'Discuss and revise the complete plan. Actions appear only after you accept the whole plan.',
          )}
        </p>
      </header>
      <label className="block text-xs font-medium">
        {t('Your requirements')}
        <Textarea
          className="mt-2 min-h-24"
          disabled={busy}
          value={plan.requirements}
          onChange={(event) =>
            dispatch({
              type: 'plan-update',
              goalId: goal.id,
              requirements: event.target.value,
            })
          }
        />
      </label>
      <DemoAgentProfile
        label="Planning profile"
        value={plan.profile}
        disabled={busy}
        onChange={(profile) =>
          dispatch({ type: 'plan-update', goalId: goal.id, profile })
        }
      />
      {latest && (
        <label className="block text-xs font-medium">
          {t('Feedback on the whole plan')}
          <Textarea
            className="mt-2 min-h-24"
            ref={feedbackRef}
            disabled={busy}
            value={plan.feedback}
            placeholder={t('Tell the Agent what to change or clarify…')}
            onChange={(event) =>
              dispatch({
                type: 'plan-update',
                goalId: goal.id,
                feedback: event.target.value,
              })
            }
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy}
          onClick={() => {
            setHistory(null);
            dispatch({ type: 'plan-start', goalId: goal.id, variant });
          }}
        >
          <Sparkles />
          {t(latest ? 'Simulate plan revision' : 'Simulate Generate Plan')}
        </Button>
        {plan.job && (
          <Button
            variant="outline"
            onClick={() => dispatch({ type: 'plan-cancel', goalId: goal.id })}
          >
            <X />
            {t('Cancel')}
          </Button>
        )}
        <label className="text-xs text-muted-foreground">
          {t('Demo plan result')}
          <select
            aria-label={t('Demo plan result')}
            className="ml-2 rounded-lg border border-border bg-background px-2 py-1.5"
            disabled={busy}
            value={variant}
            onChange={(event) =>
              setVariant(event.target.value as typeof variant)
            }
          >
            <option value="standard">{t('Standard example')}</option>
            <option value="compact">{t('Shorter example')}</option>
            <option value="error">{t('Execution failed')}</option>
          </select>
        </label>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        {t(
          'This is a scripted planning demo, not AI. Feedback is retained; edit the proposed contracts directly to explore changes.',
        )}
      </p>
      {plan.job && (
        <output className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-300">
          <LoaderCircle className="size-4 animate-spin" />
          {t('Preparing a plan draft…')}
        </output>
      )}
      {plan.error && (
        <output className="block rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          {t(
            plan.error === 'error'
              ? 'Plan generation failed. Your input and earlier draft are retained; retry before confirming.'
              : 'Plan generation canceled. No Actions were created.',
          )}
        </output>
      )}
      {response && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('Planning response')}</h3>
            <select
              aria-label={t('Plan response version')}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              value={history ?? plan.responses.length - 1}
              onChange={(event) => setHistory(Number(event.target.value))}
            >
              {plan.responses.map((item, index) => (
                <option key={item.revision} value={index}>
                  {t('Round')} {item.revision}
                </option>
              ))}
            </select>
          </div>
          <DemoProfileSummary value={response.profile} />
          {older && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t(
                'Historical response only. Return to the latest version to confirm the current draft.',
              )}
            </p>
          )}
          <MarkdownReader
            title={`${t('Planning response')} · ${response.revision}`}
            filePath={`demo/${goal.id}/plan-${response.revision}.md`}
            markdown={response.markdown}
            compact
            onAddFeedback={
              busy
                ? undefined
                : (selection) => {
                    dispatch({
                      type: 'plan-update',
                      goalId: goal.id,
                      feedback: `${plan.feedback}${plan.feedback ? '\n\n' : ''}> ${selection.excerpt}\n`,
                    });
                    feedbackRef.current?.focus();
                  }
            }
          />
        </div>
      )}
      {plan.steps.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t('Current plan draft')}</h3>
            <span className="text-xs text-muted-foreground">
              {plan.steps.length} {t('Plan steps')}
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              'Aim for roughly 5–7 meaningful steps, not a quota. Simple goals need fewer. These exact contracts become Actions when confirmed.',
            )}
          </p>
          {plan.steps.length > 7 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t(
                'This plan may be too large. Consider reducing the goal instead of hiding complexity inside steps.',
              )}
            </p>
          )}
          {plan.steps.map((step, index) => {
            const locked =
              busy ||
              Boolean(
                goal.actions.find((item) => item.id === step.id)?.rounds.length,
              );
            return (
              <details
                key={step.id}
                className="rounded-xl border border-border p-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {index + 1}. {step.title}
                  {locked && !busy
                    ? ` · ${t('Existing delivery retained')}`
                    : ''}
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="block text-xs">
                    {t('Step title')}
                    <Input
                      className="mt-1"
                      disabled={locked}
                      value={step.title}
                      onChange={(event) =>
                        updateStep(step.id, 'title', event.target.value)
                      }
                    />
                  </label>
                  {(['input', 'output', 'validation'] as const).map((field) => (
                    <label key={field} className="block text-xs">
                      {t(
                        field === 'input'
                          ? 'Input'
                          : field === 'output'
                            ? 'Expected output'
                            : 'Validation',
                      )}
                      <Textarea
                        className="mt-1 min-h-24"
                        disabled={locked}
                        value={step[field]}
                        onChange={(event) =>
                          updateStep(step.id, field, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
          <Button
            className="mt-2"
            disabled={
              busy || Boolean(plan.error) || !latest || older || invalid
            }
            onClick={() => {
              dispatch({ type: 'plan-accept', goalId: goal.id });
              onDone();
            }}
          >
            <Check />
            {t('Confirm entire plan')}
          </Button>
        </div>
      )}
    </section>
  );
}
