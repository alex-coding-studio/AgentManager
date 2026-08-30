'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import {
  Check,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import { DemoAgentProfile } from '@/components/demo-agent-profile';
import { cn } from '@/lib/utils';
import {
  planningFor,
  validDemoResources,
  type DemoEvent,
  type DemoGoal,
  type DemoPlanStep,
} from '@/lib/just-do-it-demo';

type Props = { goal: DemoGoal; dispatch: Dispatch<DemoEvent> };

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
}: Props & { onDone: () => void }) {
  const { t } = useUiText();
  const plan = planningFor(goal);
  const [selectedId, setSelectedId] = useState('overview');
  const [editing, setEditing] = useState<'whole' | 'step' | 'add' | null>(null);
  const selected = plan.steps.find((item) => item.id === selectedId);
  const busy = goal.actions.some((item) => item.job);
  const locked =
    selected &&
    goal.actions.some(
      (item) => item.id === selected.id && item.rounds.length > 0,
    );
  const invalid = plan.steps.some(
    (item) =>
      !item.title.trim() ||
      !item.input.trim() ||
      !item.output.trim() ||
      !item.validation.trim(),
  );
  if (plan.job)
    return (
      <section
        className="mx-auto grid min-h-80 max-w-2xl place-content-center justify-items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center"
        aria-busy="true"
      >
        <LoaderCircle className="size-7 animate-spin text-blue-600 dark:text-blue-300" />
        <h2 className="text-lg font-semibold">
          {t(
            plan.job.targetId
              ? 'Updating this planned step…'
              : 'Preparing your plan…',
          )}
        </h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          {t(
            'The start form is put away. Your plan will appear as individual steps when ready.',
          )}
        </p>
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'plan-cancel', goalId: goal.id })}
        >
          {t('Cancel')}
        </Button>
      </section>
    );
  if (!plan.generated)
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6">
        <header className="mb-5">
          <span className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary">
            <Sparkles className="size-5" />
          </span>
          <h2 className="text-xl font-semibold">{t('Start planning')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('This goal is here. Nothing has been planned or started yet.')}
          </p>
        </header>
        <PlanningSetup goal={goal} dispatch={dispatch} />
      </section>
    );
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
            {t('Plan preview')}
          </span>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              'Review each step, then confirm the entire plan to create Actions.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setEditing('whole')}
          >
            <Pencil />
            {t('Adjust whole plan')}
          </Button>
          <Button
            disabled={
              busy || Boolean(plan.error) || invalid || !plan.steps.length
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
      </header>
      {plan.error && <PlanError error={plan.error} />}
      <div className="grid items-start gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-card p-3">
          <h2 className="px-2 py-2 text-xs font-semibold text-muted-foreground">
            {t('Plan')} · {plan.steps.length}
          </h2>
          <div className="space-y-1">
            <button
              type="button"
              aria-pressed={!selected}
              onClick={() => setSelectedId('overview')}
              className={cn(
                'mb-2 w-full rounded-xl px-3 py-3 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring',
                !selected ? 'bg-secondary' : 'hover:bg-secondary/50',
              )}
            >
              {t('Overview')}
            </button>
            {plan.steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected?.id === item.id}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected?.id === item.id
                    ? 'bg-secondary'
                    : 'hover:bg-secondary/50',
                )}
              >
                <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm leading-5">{item.title}</span>
              </button>
            ))}
          </div>
          <Button
            className="mt-3 w-full"
            variant="ghost"
            disabled={busy}
            onClick={() => setEditing('add')}
          >
            <Plus />
            {t('Add planned step')}
          </Button>
          <p className="px-2 pt-3 text-[11px] leading-5 text-muted-foreground">
            {t('Usually 5–7 steps; fewer is fine. Keep the goal manageable.')}
          </p>
        </aside>
        {!selected ? (
          <article className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5">
            <header>
              <h2 className="text-xl font-semibold">{t('Overview')}</h2>
              <p className="mt-2 text-sm leading-7">{plan.overview}</p>
            </header>
            <section>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("This plan's scope")}
              </h3>
              <p className="line-clamp-3 whitespace-pre-line text-sm leading-7">
                {plan.requirements || goal.summary}
              </p>
            </section>
            {plan.resources.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('Extra resources')}
                </h3>
                {plan.resources.map((item) => (
                  <details
                    key={item.id}
                    className="mt-2 rounded-lg border border-border p-2 text-xs"
                  >
                    <summary className="cursor-pointer">{item.name}</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans">
                      {item.content}
                    </pre>
                  </details>
                ))}
              </section>
            )}
            <p className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
              {t(
                'Scan the titles on the left. Open a step only when you need its input, output, and validation details.',
              )}
            </p>
          </article>
        ) : (
          <article className="min-w-0 rounded-2xl border border-border bg-card p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('Planned step')}{' '}
                  {plan.steps.findIndex((item) => item.id === selected.id) + 1}
                </p>
                <h2 className="mt-2 text-xl font-semibold leading-8">
                  {selected.title}
                </h2>
              </div>
              <Button
                variant="outline"
                disabled={busy || locked}
                onClick={() => setEditing('step')}
              >
                <Pencil />
                {t('Adjust this step')}
              </Button>
            </div>
            {locked && (
              <p className="mb-4 text-xs text-muted-foreground">
                {t('Existing delivery retained')}
              </p>
            )}
            <div className="space-y-5">
              <PlanFact label="Input">{selected.input}</PlanFact>
              <PlanFact label="Expected output">{selected.output}</PlanFact>
              <PlanFact label="Validation">{selected.validation}</PlanFact>
              {selected.guidance && (
                <PlanFact label="Step guidance">{selected.guidance}</PlanFact>
              )}
            </div>
          </article>
        )}
      </div>
      {plan.guidance && (
        <details className="text-xs leading-5 text-muted-foreground">
          <summary className="cursor-pointer">{t('Plan guidance')}</summary>
          <p className="mt-2 whitespace-pre-line">{plan.guidance}</p>
        </details>
      )}
      {plan.steps.length > 7 && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t(
            'This plan may be too large. Consider reducing the goal instead of hiding complexity inside steps.',
          )}
        </p>
      )}
      <Dialog
        open={editing === 'whole'}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('Adjust whole plan')}</DialogTitle>
          </DialogHeader>
          <PlanningSetup
            goal={goal}
            dispatch={dispatch}
            adjusting
            onSubmitted={() => {
              setEditing(null);
              setSelectedId('overview');
            }}
          />
        </DialogContent>
      </Dialog>
      {((editing === 'step' && selected) || editing === 'add') && (
        <StepEditor
          goal={goal}
          dispatch={dispatch}
          step={editing === 'step' ? selected : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function PlanningSetup({
  goal,
  dispatch,
  adjusting = false,
  onSubmitted,
}: Props & { adjusting?: boolean; onSubmitted?: () => void }) {
  const { t } = useUiText();
  const plan = planningFor(goal);
  const [variant, setVariant] = useState<'standard' | 'compact' | 'error'>(
    'standard',
  );
  const [resourceError, setResourceError] = useState('');
  const [reading, setReading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disabled = reading || goal.actions.some((item) => item.job);
  const addFiles = async (files: File[]) => {
    setResourceError('');
    if (
      files.some(
        (file) => !/\.(md|txt)$/i.test(file.name) || file.size > 262_144,
      ) ||
      files.length + plan.resources.length > 5
    ) {
      setResourceError(
        t('Use up to 5 Markdown or text files, at most 256 KB each.'),
      );
      return;
    }
    setReading(true);
    try {
      const resources = [
        ...plan.resources,
        ...(await Promise.all(
          files.map(async (file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            content: await file.text(),
          })),
        )),
      ];
      if (!validDemoResources(resources))
        throw new Error(t('Extra resources must total at most 1 MB.'));
      if (!mounted.current) return;
      dispatch({ type: 'plan-update', goalId: goal.id, resources });
    } catch {
      if (mounted.current)
        setResourceError(
          t('Could not import these resources. Keep the total below 1 MB.'),
        );
    } finally {
      if (mounted.current) setReading(false);
    }
  };
  return (
    <div className="space-y-5">
      <details className="rounded-xl border border-border bg-secondary/25 p-3">
        <summary className="cursor-pointer text-xs font-medium">
          {t('Included from the source goal')}
        </summary>
        <h3 className="mt-3 text-sm font-semibold">{goal.title}</h3>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          {goal.summary}
        </p>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {goal.sourceId}
        </p>
      </details>
      <label className="block text-xs font-medium">
        {t(adjusting ? 'Adjustments to the plan' : 'Your requirements')}
        <Textarea
          className="mt-2 min-h-24"
          value={adjusting ? plan.feedback : plan.requirements}
          disabled={disabled}
          onChange={(event) =>
            dispatch(
              adjusting
                ? {
                    type: 'plan-update',
                    goalId: goal.id,
                    feedback: event.target.value,
                  }
                : {
                    type: 'plan-update',
                    goalId: goal.id,
                    requirements: event.target.value,
                  },
            )
          }
        />
      </label>
      {adjusting && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('Your requirements')}
          </summary>
          <Textarea
            aria-label={t('Your requirements')}
            className="mt-2"
            value={plan.requirements}
            disabled={disabled}
            onChange={(event) =>
              dispatch({
                type: 'plan-update',
                goalId: goal.id,
                requirements: event.target.value,
              })
            }
          />
        </details>
      )}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium">
            {t('Extra resources')}{' '}
            <span className="text-muted-foreground">
              {plan.resources.length}
            </span>
          </h3>
          <input
            ref={picker}
            type="file"
            multiple
            accept=".md,.txt"
            className="hidden"
            aria-label={t('Import planning resources')}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addFiles(files);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => picker.current?.click()}
          >
            <Upload />
            {t('Import files')}
          </Button>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          {t(
            'Optional Markdown or text. Read in this tab only; nothing is uploaded.',
          )}
        </p>
        {plan.resources.map((item) => (
          <div
            key={item.id}
            className="mt-2 flex items-center gap-2 rounded-lg border border-border p-2 text-xs"
          >
            <FileText className="size-3.5 shrink-0" />
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer truncate">{item.name}</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px]">
                {item.content}
              </pre>
            </details>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Remove resource {name}', { name: item.name })}
              disabled={disabled}
              onClick={() =>
                dispatch({
                  type: 'plan-update',
                  goalId: goal.id,
                  resources: plan.resources.filter(
                    (resource) => resource.id !== item.id,
                  ),
                })
              }
            >
              <X />
            </Button>
          </div>
        ))}
        {resourceError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {resourceError}
          </p>
        )}
      </section>
      <DemoAgentProfile
        label="Planning profile"
        value={plan.profile}
        disabled={disabled}
        onChange={(profile) =>
          dispatch({ type: 'plan-update', goalId: goal.id, profile })
        }
      />
      {plan.error && <PlanError error={plan.error} />}
      <Button
        className="w-full"
        size="lg"
        disabled={disabled}
        onClick={() => {
          dispatch({ type: 'plan-start', goalId: goal.id, variant });
          onSubmitted?.();
        }}
      >
        <Sparkles />
        {t(adjusting ? 'Update plan · demo' : 'Start Plan · demo')}
      </Button>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">
          {t('Demo scenario controls')}
        </summary>
        <p className="mt-2 leading-5">
          {t(
            'Scripted demo: adjustments replace the current draft. No planning history or Git versions are kept.',
          )}
        </p>
        <select
          aria-label={t('Demo plan result')}
          className="mt-2 rounded-lg border border-border bg-background p-2"
          value={variant}
          disabled={disabled}
          onChange={(event) => setVariant(event.target.value as typeof variant)}
        >
          <option value="standard">{t('Standard example')}</option>
          <option value="compact">{t('Shorter example')}</option>
          <option value="error">{t('Execution failed')}</option>
        </select>
      </details>
    </div>
  );
}

function StepEditor({
  goal,
  dispatch,
  step,
  onClose,
}: Props & { step?: DemoPlanStep; onClose: () => void }) {
  const { t } = useUiText();
  const [draft, setDraft] = useState<Omit<DemoPlanStep, 'id'>>(
    step ?? { title: '', input: '', output: '', validation: '' },
  );
  const invalid = [
    draft.title,
    draft.input,
    draft.output,
    draft.validation,
  ].some((value) => !value.trim());
  const save = () => {
    if (step) {
      dispatch({
        type: 'plan-update',
        goalId: goal.id,
        steps: planningFor(goal).steps.map((item) =>
          item.id === step.id ? { ...item, ...draft, id: step.id } : item,
        ),
      });
      dispatch({
        type: 'plan-update',
        goalId: goal.id,
        feedback: draft.guidance ?? '',
      });
      dispatch({
        type: 'plan-start',
        goalId: goal.id,
        variant: 'standard',
        targetId: step.id,
      });
    } else dispatch({ type: 'plan-add-step', goalId: goal.id, step: draft });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(step ? 'Adjust this step' : 'Add planned step')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t(
            'Edit this step in place. Other steps stay unchanged; confirmation still applies to the whole plan.',
          )}
        </p>
        <label className="text-xs">
          {t('Step title')}
          <Input
            className="mt-1"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </label>
        {(['input', 'output', 'validation'] as const).map((field) => (
          <label key={field} className="text-xs">
            {t(
              field === 'input'
                ? 'Input'
                : field === 'output'
                  ? 'Expected output'
                  : 'Validation',
            )}
            <Textarea
              className="mt-1 min-h-20"
              value={draft[field]}
              onChange={(event) =>
                setDraft({ ...draft, [field]: event.target.value })
              }
            />
          </label>
        ))}
        {step && (
          <label className="text-xs">
            {t('Step guidance')}
            <Textarea
              className="mt-1"
              value={draft.guidance ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, guidance: event.target.value })
              }
            />
          </label>
        )}
        <Button disabled={invalid} onClick={save}>
          <Check />
          {t(step ? 'Update step · demo' : 'Add to plan preview')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PlanFact({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useUiText();
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
        {t(label)}
      </h3>
      <p className="whitespace-pre-line break-words text-sm leading-7">
        {children}
      </p>
    </section>
  );
}
function PlanError({ error }: { error: 'error' | 'canceled' }) {
  const { t } = useUiText();
  return (
    <output className="block rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
      {t(
        error === 'error'
          ? 'Plan generation failed. Your input and earlier draft are retained; retry before confirming.'
          : 'Plan generation canceled. No Actions were created.',
      )}
    </output>
  );
}
