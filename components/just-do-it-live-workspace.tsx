'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContextAttachmentPicker } from '@/components/context-attachment-picker';
import { PlanningStepDetails } from '@/components/planning-step-details';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';
import type {
  PlanningCard,
  PlanningProfile,
} from '@/lib/just-do-it-planning-service';
import type { PlanningSource } from '@/lib/just-do-it-planning-sources';
import type { ContextBrowserFolder } from '@/lib/product-context';

type View = {
  cards: PlanningCard[];
  sources: PlanningSource[];
  instructions: string;
  folders: ContextBrowserFolder[];
};
type Draft = {
  requirements: string;
  feedback: string;
  profile: PlanningProfile;
  files: Array<{ name: string; content: string }>;
  retainRefs: string[];
  contextRefs: string[];
  folder: string;
};
function initialDraft(card: PlanningCard): Draft {
  return {
    requirements: card.requirements,
    feedback: card.run?.feedback ?? '',
    profile: card.run?.profile ?? { agent: 'codex', model: '', effort: '' },
    files: [],
    retainRefs: card.resources.map((item) => item.ref),
    contextRefs: [],
    folder: '',
  };
}

export function JustDoItLiveWorkspace({ projectId }: { projectId: string }) {
  const { t } = useUiText();
  const endpoint = `/api/projects/${projectId}/planning`;
  const [view, setView] = useState<View | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stepId, setStepId] = useState('overview');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const mounted = useRef(true);
  const refreshBusy = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (mounted.current)
        setView((old) => {
          const cards = new Map<string, PlanningCard>(
            (old?.cards ?? []).map((item) => [item.id, item]),
          );
          for (const item of data.cards as PlanningCard[])
            if ((cards.get(item.id)?.revision ?? 0) <= item.revision)
              cards.set(item.id, item);
          return { ...data, cards: [...cards.values()] };
        });
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error ? err.message : t('Could not load planning.'),
        );
    } finally {
      refreshBusy.current = false;
    }
  }, [endpoint, t]);
  useEffect(() => {
    mounted.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  const card = view?.cards.find((item) => item.id === selectedId);
  const draft = card ? (drafts[card.id] ?? initialDraft(card)) : null;
  const selectedStep = card?.plan?.steps.find((item) => item.id === stepId);
  const running = card?.run?.status === 'running';
  const busy = pending || reading || Boolean(running);
  const finalized = card?.plan?.status === 'finalized';
  const scopedBusy = running && Boolean(card?.run?.targetId);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((old) => {
      const source = view?.cards.find((item) => item.id === id);
      return source
        ? { ...old, [id]: { ...(old[id] ?? initialDraft(source)), ...patch } }
        : old;
    });
  }
  async function mutate(payload: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.card && mounted.current)
        setView((old) => {
          if (
            !old ||
            (old.cards.find((item) => item.id === data.card.id)?.revision ??
              0) > data.card.revision
          )
            return old;
          return {
            ...old,
            cards: [
              data.card,
              ...old.cards.filter((item) => item.id !== data.card.id),
            ],
          };
        });
      return data.card as PlanningCard | undefined;
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error ? err.message : t('Planning request failed.'),
        );
      return undefined;
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  async function generate(targetId: string | null) {
    if (!card || !draft) return;
    const saved = await mutate({
      action: 'start',
      cardId: card.id,
      expectedRevision: card.revision,
      ...draft,
      ...(targetId
        ? {
            requirements: card.requirements,
            files: [],
            contextRefs: [],
            retainRefs: card.resources.map((item) => item.ref),
          }
        : {}),
      targetId,
    });
    if (saved) {
      patchDraft(card.id, {
        files: [],
        contextRefs: [],
        retainRefs: saved.resources.map((item) => item.ref),
      });
      setEditing(null);
    }
  }
  function command(action: string) {
    if (card)
      void mutate({ action, cardId: card.id, expectedRevision: card.revision });
  }
  function openCard(id: string) {
    setSelectedId(id);
    setStepId('overview');
    setError(null);
  }
  async function addFiles(files: File[]) {
    if (!card || !draft) return;
    const id = card.id;
    setReading(true);
    try {
      if (
        draft.files.length +
          draft.retainRefs.length +
          draft.contextRefs.length +
          files.length >
        5
      )
        throw new Error(t('Attach no more than five resources.'));
      const values = await Promise.all(
        files.map(async (file) => {
          if (file.size > 262144 || !/\.(md|markdown|txt)$/i.test(file.name))
            throw new Error(t('Use text or Markdown files up to 256 KB.'));
          return { name: file.name, content: await file.text() };
        }),
      );
      if (mounted.current)
        patchDraft(id, { files: [...draft.files, ...values] });
    } catch (err) {
      if (mounted.current)
        setError(String(err instanceof Error ? err.message : err));
    } finally {
      if (mounted.current) setReading(false);
    }
  }

  const setup = card && draft && (
    <div className="space-y-5">
      <label className="block text-sm">
        {t('Your additional requirements')}
        <Textarea
          className="mt-2 min-h-28"
          value={draft.requirements}
          disabled={busy}
          onChange={(event) =>
            patchDraft(card.id, { requirements: event.target.value })
          }
        />
      </label>
      <ContextAttachmentPicker
        folders={view?.folders ?? []}
        folderPath={draft.folder || view?.folders[0]?.path || ''}
        onFolderPath={(folder) => patchDraft(card.id, { folder })}
        refs={draft.contextRefs}
        onToggleRef={(ref) =>
          patchDraft(card.id, {
            contextRefs: draft.contextRefs.includes(ref)
              ? draft.contextRefs.filter((item) => item !== ref)
              : [...draft.contextRefs, ref],
          })
        }
        files={[
          ...card.resources.filter((item) =>
            draft.retainRefs.includes(item.ref),
          ),
          ...draft.files,
        ]}
        onAddFiles={(files) => void addFiles(files)}
        onRemoveFile={(index) => {
          const retained = card.resources.filter((item) =>
            draft.retainRefs.includes(item.ref),
          );
          if (index < retained.length)
            patchDraft(card.id, {
              retainRefs: draft.retainRefs.filter(
                (ref) => ref !== retained[index].ref,
              ),
            });
          else
            patchDraft(card.id, {
              files: draft.files.filter(
                (_, i) => i !== index - retained.length,
              ),
            });
        }}
        label={t('Extra resources')}
        disabled={busy}
        accept=".md,.markdown,.txt"
      />
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          Agent
          <select
            className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2"
            value={draft.profile.agent}
            onChange={(event) =>
              patchDraft(card.id, {
                profile: {
                  agent: event.target.value as PlanningProfile['agent'],
                  model: '',
                  effort: '',
                },
              })
            }
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
          </select>
        </label>
        <label className="text-xs">
          {t('Model ID (optional)')}
          <Input
            className="mt-2 h-9"
            value={draft.profile.model}
            placeholder={t('Agent default')}
            onChange={(event) =>
              patchDraft(card.id, {
                profile: { ...draft.profile, model: event.target.value },
              })
            }
          />
        </label>
        <label className="text-xs">
          {t('Reasoning effort')}
          <select
            className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2"
            value={draft.profile.effort}
            onChange={(event) =>
              patchDraft(card.id, {
                profile: {
                  ...draft.profile,
                  effort: event.target.value as PlanningProfile['effort'],
                },
              })
            }
          >
            {['', 'low', 'medium', 'high', 'xhigh'].map((value) => (
              <option key={value} value={value}>
                {value || t('Agent default')}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        {t(
          'Uses your local Agent login. Unsupported model settings return an error, without silently changing models.',
        )}
      </p>
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('Just Do It')}
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            {t('Execution workspace')}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {t('Live planning · read-only Agent · execution not connected')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            className={buttonVariants({ variant: 'ghost' })}
            href={`/projects/${projectId}/implementation?preview=just-do-it`}
          >
            {t('Open preview')}
          </Link>
          <Button
            variant="outline"
            disabled={!view}
            onClick={() => setContextOpen(true)}
          >
            <SlidersHorizontal />
            {t('Context')}
          </Button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1440px] space-y-5 px-5 py-6 lg:px-8">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {!view ? (
          <p className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            {t('Loading')}
          </p>
        ) : !card ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {t('Add a formal Node, then plan with your Agent.')}
              </p>
              <Button onClick={() => setImporting(true)}>
                <Plus />
                {t('Add a goal')}
              </Button>
            </div>
            {!view.cards.length && (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                {t('No goals yet. Add a formal Node to start planning.')}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {view.cards.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openCard(item.id)}
                  className="flex h-60 flex-col rounded-2xl border border-border bg-card p-4 text-left hover:border-foreground/40"
                >
                  <div className="grid h-12 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <h2 className="line-clamp-2 font-semibold">
                      {item.source.title}
                    </h2>
                    <span
                      className={cn(
                        'rounded-full px-2 py-1 text-[10px]',
                        item.plan?.status === 'finalized'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-secondary text-muted-foreground',
                      )}
                    >
                      {t(
                        item.run?.status === 'running'
                          ? 'Agent running'
                          : item.plan?.status === 'finalized'
                            ? 'Plan finalized'
                            : item.run?.status === 'failed'
                              ? 'Needs attention'
                              : 'Planning',
                      )}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {item.source.summary}
                  </p>
                  <p className="mt-auto text-xs text-muted-foreground">
                    {item.plan
                      ? `${t('Plan')} · ${item.plan.steps.length}`
                      : t('Not planned yet')}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
                    <span>{t('Execution not connected')}</span>
                    <span>
                      {view.sources.some(
                        (source) => source.uid === item.source.uid,
                      )
                        ? `Node-${item.source.id.slice(5)}`
                        : t('Source node deleted')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              <ArrowLeft />
              {t('All goals')}
            </Button>
            <header>
              <h2 className="text-2xl font-semibold">{card.source.title}</h2>
              <details className="mt-3 text-sm text-muted-foreground">
                <summary className="cursor-pointer">{t('Source')}</summary>
                <p className="mt-2">{card.source.summary}</p>
                <p className="mt-2 font-mono text-xs">{card.source.id}</p>
                {card.source.dependsOn.length > 0 && (
                  <p className="mt-2">
                    {t('Prerequisites not yet verified')}:{' '}
                    {card.source.dependsOn.join(', ')}
                  </p>
                )}
              </details>
            </header>
            {card.run?.error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
              >
                {card.run.error}
              </p>
            )}
            {running && !scopedBusy ? (
              <section
                aria-busy="true"
                className="mx-auto grid min-h-80 max-w-2xl place-content-center justify-items-center gap-4 rounded-2xl border border-border bg-card p-8"
              >
                <LoaderCircle className="size-7 animate-spin text-blue-500" />
                <h2 className="text-lg font-semibold">
                  {t('Preparing your plan…')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {card.run?.profile.agent === 'codex' ? 'Codex' : 'Claude'} ·{' '}
                  {t('Agent running')}
                </p>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => command('cancel')}
                >
                  {t('Cancel')}
                </Button>
              </section>
            ) : !card.plan ? (
              <section className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6">
                <Sparkles className="size-6" />
                <h2 className="text-xl font-semibold">{t('Start planning')}</h2>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'This goal is here. Nothing has been planned or started yet.',
                  )}
                </p>
                {setup}
                <Button disabled={busy} onClick={() => void generate(null)}>
                  {t('Start planning')}
                </Button>
              </section>
            ) : (
              <section className="space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                  <div>
                    <span className="text-sm font-medium">
                      {t(finalized ? 'Plan finalized' : 'Plan preview')}
                    </span>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t(
                        finalized
                          ? 'Actions are ready. Execution is not connected yet.'
                          : 'Review each step, then confirm the entire plan to create Actions.',
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {finalized ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => command('reopen')}
                      >
                        {t('Reopen plan')}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditing('whole')}
                        >
                          <Pencil />
                          {t('Adjust whole plan')}
                        </Button>
                        <Button
                          disabled={busy || card.run?.status !== 'succeeded'}
                          onClick={() => command('finalize')}
                        >
                          <Check />
                          {t('Confirm entire plan')}
                        </Button>
                      </>
                    )}
                  </div>
                </header>
                <div className="grid items-start gap-4 xl:grid-cols-[238px_minmax(0,1fr)]">
                  <aside className="rounded-2xl border border-border bg-card p-3">
                    <h2 className="px-2 py-2 text-xs text-muted-foreground">
                      {t(finalized ? 'Actions' : 'Plan')} ·{' '}
                      {card.plan.steps.length}
                    </h2>
                    <button
                      aria-pressed={!selectedStep}
                      className={cn(
                        'mb-2 w-full rounded-xl px-3 py-3 text-left text-sm',
                        !selectedStep && 'bg-secondary',
                      )}
                      onClick={() => setStepId('overview')}
                    >
                      {t('Overview')}
                    </button>
                    {card.plan.steps.map((step, index) => (
                      <button
                        key={step.id}
                        aria-pressed={step.id === stepId}
                        aria-busy={running && card.run?.targetId === step.id}
                        onClick={() => setStepId(step.id)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left',
                          step.id === stepId
                            ? 'bg-secondary'
                            : 'hover:bg-secondary/50',
                        )}
                      >
                        <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm leading-5">{step.title}</span>
                        {running && card.run?.targetId === step.id && (
                          <LoaderCircle className="ml-auto size-4 shrink-0 animate-spin" />
                        )}
                      </button>
                    ))}
                  </aside>
                  <article
                    aria-busy={Boolean(
                      running && selectedStep?.id === card.run?.targetId,
                    )}
                    className="relative min-w-0 rounded-2xl border border-border bg-card p-5"
                  >
                    <div
                      className={cn(
                        running &&
                          selectedStep?.id === card.run?.targetId &&
                          'invisible',
                      )}
                      inert={
                        (running && selectedStep?.id === card.run?.targetId) ||
                        undefined
                      }
                    >
                      {selectedStep ? (
                        <>
                          <header className="mb-5 flex items-start justify-between gap-3">
                            <h2 className="text-xl font-semibold leading-8">
                              {selectedStep.title}
                            </h2>
                            {!finalized && (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => setEditing(selectedStep.id)}
                              >
                                {t('Adjust this step')}
                              </Button>
                            )}
                          </header>
                          <PlanningStepDetails step={selectedStep} />
                        </>
                      ) : (
                        <>
                          <h2 className="text-xl font-semibold">
                            {t('Overview')}
                          </h2>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                            {card.plan.overview}
                          </p>
                          <h3 className="mt-5 text-xs text-muted-foreground">
                            {t("This plan's scope")}
                          </h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                            {card.requirements || card.source.summary}
                          </p>
                        </>
                      )}
                    </div>
                    {running && selectedStep?.id === card.run?.targetId && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5 text-center">
                        <LoaderCircle className="size-7 animate-spin text-blue-500" />
                        <p>{t('Updating this planned step…')}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'Only this step is updating. You can still browse the plan on the left.',
                          )}
                        </p>
                        <Button
                          variant="outline"
                          disabled={pending}
                          onClick={() => command('cancel')}
                        >
                          {t('Cancel')}
                        </Button>
                      </div>
                    )}
                  </article>
                </div>
                {scopedBusy && selectedStep?.id !== card.run?.targetId && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => command('cancel')}
                  >
                    {t('Cancel')}
                  </Button>
                )}
              </section>
            )}
            {card.run?.usage && (
              <p className="text-xs text-muted-foreground">
                {t('Last run usage')}: {card.run.usage.inputTokens} input ·{' '}
                {card.run.usage.cachedInputTokens} cached ·{' '}
                {card.run.usage.outputTokens} output
              </p>
            )}
          </>
        )}
      </div>
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('Context')}</DialogTitle>
            <DialogDescription>
              {t(
                'Project-wide working rules. Each new planning run takes a snapshot; running Agents are unchanged.',
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            <span>{t('Just Do It instructions')}</span>
            <Textarea
              className="min-h-64"
              value={instructions ?? view?.instructions ?? ''}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={pending || !view}
            onClick={async () => {
              await mutate({
                action: 'instructions',
                instructions: instructions ?? view?.instructions,
              });
              void refresh();
            }}
          >
            {t('Save')}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('Add a goal')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(
              'Choose a formal Node. Its output is retained for planning; the source is unchanged.',
            )}
          </p>
          {!view?.sources.length && (
            <p className="text-sm">{t('No formal Nodes available yet.')}</p>
          )}
          {view?.sources.map((source) => (
            <button
              key={`${source.module}:${source.uid}`}
              disabled={pending}
              className="rounded-xl border border-border p-4 text-left hover:bg-secondary disabled:opacity-50"
              onClick={async () => {
                const imported = await mutate({
                  action: 'import',
                  module: source.module,
                  uid: source.uid,
                });
                if (imported) {
                  openCard(imported.id);
                  setImporting(false);
                }
              }}
            >
              <span className="text-xs text-muted-foreground">
                {source.module === 'whats-next'
                  ? "What's Next"
                  : 'Break It Down'}{' '}
                · {source.id}
              </span>
              <h3 className="mt-2 font-medium">{source.title}</h3>
            </button>
          ))}
        </DialogContent>
      </Dialog>
      <Dialog
        open={editing !== null && Boolean(card)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t(
                editing === 'whole' ? 'Adjust whole plan' : 'Adjust this step',
              )}
            </DialogTitle>
          </DialogHeader>
          {editing === 'whole' && setup}
          {card && draft && (
            <>
              <label className="text-sm">
                {t('Requested step change')}
                <Textarea
                  className="mt-2 min-h-32"
                  value={draft.feedback}
                  onChange={(event) =>
                    patchDraft(card.id, { feedback: event.target.value })
                  }
                  disabled={busy}
                />
              </label>
              <Button
                disabled={busy || !draft.feedback.trim()}
                onClick={() =>
                  void generate(editing === 'whole' ? null : editing)
                }
              >
                {t('Send to Agent')}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
