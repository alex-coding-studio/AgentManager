'use client';

import { RotateCcw, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentRunControls } from '@/components/agent-run-controls';
import { DomainModelCanvas } from '@/components/domain-model-canvas';
import { LatestResponse } from '@/components/latest-response';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { AgentProfile } from '@/lib/agent-profile';
import type {
  DerivedDomainRelationship,
  DomainChange,
  DomainEntity,
  DomainModel,
  DomainRelationship,
} from '@/lib/domain-model';
import type { DomainModelRunRecord } from '@/lib/domain-model-runs';
import { deriveDomainRelationships } from '@/lib/domain-model-view';
import { latestDomainModelResponse } from '@/lib/latest-response';

export function DomainModelWorkspace({
  projectId,
  initialModel,
  initialRuns,
  initialCanUndo,
  initialLastChange,
}: {
  projectId: string;
  initialModel: DomainModel;
  initialRuns: DomainModelRunRecord[];
  initialCanUndo: boolean;
  initialLastChange: DomainChange | null;
}) {
  const [model, setModel] = useState(initialModel);
  const [runs, setRuns] = useState(initialRuns);
  const [canUndo, setCanUndo] = useState(initialCanUndo);
  const [lastModelChange, setLastModelChange] = useState(initialLastChange);
  const [instruction, setInstruction] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState('');
  const [inspectedEntityId, setInspectedEntityId] = useState('');
  const [inspectedRelationshipId, setInspectedRelationshipId] = useState('');
  const [profile, setProfile] = useState<AgentProfile>({
    agent: 'codex',
    model: '',
    effort: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const submittingRef = useRef(false);
  const latest = runs[0] ?? null;
  const running = latest?.status === 'running' ? latest : null;

  const refreshModel = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/domain-model`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Could not refresh the Domain Model.');
    const data = (await response.json()) as {
      model: DomainModel;
      canUndo: boolean;
      lastChange: DomainChange | null;
    };
    setModel(data.model);
    setCanUndo(data.canUndo);
    setLastModelChange(data.lastChange);
    setSelectedIds((current) =>
      current.filter(
        (id) =>
          data.model.entities.some((item) => item.id === id) ||
          data.model.relationships.some((item) => item.id === id),
      ),
    );
  }, [projectId]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      setNow(Date.now());
      try {
        const response = await fetch(
          `/api/projects/${projectId}/domain-model-runs?runId=${running.id}`,
          { cache: 'no-store' },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { run: DomainModelRunRecord };
        setRuns((current) => [
          data.run,
          ...current.filter((item) => item.id !== data.run.id),
        ]);
        if (data.run.status !== 'running') {
          await refreshModel();
          if (
            data.run.status === 'succeeded' &&
            data.run.result?.outcome === 'applied'
          )
            setInstruction('');
        }
      } catch {}
    }, 1200);
    return () => clearInterval(interval);
  }, [projectId, refreshModel, running]);

  const selectedContext = selectedIds.flatMap((id) => {
    const entity = model.entities.find((item) => item.id === id);
    if (entity) return [{ id, label: entity.name }];
    const relationship = model.relationships.find((item) => item.id === id);
    return relationship ? [{ id, label: relationship.label }] : [];
  });
  const inspectedEntity = model.entities.find(
    (item) => item.id === inspectedEntityId,
  );
  const allRelationships: Array<
    DomainRelationship | DerivedDomainRelationship
  > = [...model.relationships, ...deriveDomainRelationships(model)];
  const inspectedRelationship = allRelationships.find(
    (item) => item.id === inspectedRelationshipId,
  );

  async function startRun() {
    if (!instruction.trim() || running || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/projects/${projectId}/domain-model-runs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction, selectedIds, profile }),
        },
      );
      const data = (await response.json()) as {
        run?: DomainModelRunRecord;
        error?: string;
      };
      if (!response.ok || !data.run) {
        setError(data.error ?? 'Could not start the Domain Model Agent.');
        return;
      }
      setRuns((current) => [data.run!, ...current]);
      setNow(Date.now());
    } catch {
      setError('Could not start the Domain Model Agent.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function cancelRun() {
    if (!running) return;
    const response = await fetch(
      `/api/projects/${projectId}/domain-model-runs`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: running.id }),
      },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { run: DomainModelRunRecord };
    setRuns((current) => [
      data.run,
      ...current.filter((item) => item.id !== data.run.id),
    ]);
  }

  async function undo() {
    const response = await fetch(`/api/projects/${projectId}/domain-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'undo' }),
    });
    const data = (await response.json()) as {
      model?: DomainModel;
      change?: DomainChange;
      canUndo?: boolean;
      error?: string;
    };
    if (!response.ok || !data.model || !data.change) {
      setError(data.error ?? 'Could not undo the last change.');
      return;
    }
    setModel(data.model);
    setCanUndo(Boolean(data.canUndo));
    setLastModelChange(data.change);
    setFocusedId('');
    setSelectedIds([]);
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function inspectEntity(id: string) {
    setInspectedRelationshipId('');
    setInspectedEntityId(id);
  }
  function inspectRelationship(id: string) {
    setInspectedEntityId('');
    setInspectedRelationshipId(id);
  }

  const elapsed = running
    ? Math.max(0, Math.floor((now - Date.parse(running.startedAt)) / 1000))
    : 0;
  const lastActivity =
    running?.activity.at(-1)?.summary ?? 'Preparing the Agent request.';
  const latestRunAt = latest
    ? Date.parse(latest.endedAt ?? latest.startedAt)
    : Number.NEGATIVE_INFINITY;
  const showUndoNotice = Boolean(
    lastModelChange?.kind === 'restored' &&
    Date.parse(lastModelChange.createdAt) > latestRunAt,
  );

  return (
    <div className="relative flex h-[calc(100vh-4rem)] min-h-[560px] flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-5 lg:px-8">
        <div>
          <h1 className="text-sm font-semibold">What&apos;s That?</h1>
          <p className="text-[11px] text-muted-foreground">
            Current Domain Model
          </p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <DomainModelCanvas
          model={model}
          selectedIds={selectedIds}
          focusedId={focusedId}
          onToggleSelection={toggleSelection}
          onFocus={setFocusedId}
          onInspectEntity={inspectEntity}
          onInspectRelationship={inspectRelationship}
        />

        {showUndoNotice ? (
          <LatestResponse
            title="Latest Response"
            statusLabel="Undone"
            summary="The last model change was undone."
            tone="neutral"
            attention="none"
            icon="neutral"
            className="absolute top-4 left-4 z-20 w-[min(360px,calc(100%-2rem))]"
          />
        ) : latest && latest.status !== 'running' ? (
          <LatestDomainResponse run={latest} canUndo={canUndo} onUndo={undo} />
        ) : null}

        <div className="pointer-events-none absolute right-5 bottom-5 z-20">
          <div className="pointer-events-auto w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background shadow-[0_18px_50px_rgb(15_23_42/12%)]">
            {running ? (
              <div className="flex min-h-16 items-center gap-3 px-4 py-3 text-sm">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-sky-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {profile.agent === 'codex' ? 'Codex' : 'Claude'} running ·{' '}
                    {formatDuration(elapsed)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lastActivity}
                  </p>
                </div>
                <Button variant="outline" onClick={cancelRun}>
                  <Square className="size-3.5" /> Cancel
                </Button>
              </div>
            ) : (
              <>
                <div className="p-4">
                  {selectedContext.length ? (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {selectedContext.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px]"
                          onClick={() => toggleSelection(item.id)}
                        >
                          {item.label} <X className="size-3" />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedIds([])}
                      >
                        Clear context
                      </button>
                    </div>
                  ) : null}
                  <Textarea
                    ref={textarea}
                    value={instruction}
                    rows={3}
                    placeholder="Describe an entity, field, relationship or rule to add or change…"
                    className="min-h-24 resize-none text-sm"
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === 'Enter'
                      ) {
                        event.preventDefault();
                        void startRun();
                      }
                    }}
                  />
                  <div className="mt-3">
                    <AgentRunControls
                      value={profile}
                      onChange={setProfile}
                      label="Domain Model Agent"
                      disabled={!instruction.trim() || submitting}
                      onRun={startRun}
                    />
                  </div>
                </div>
                {error ? (
                  <p
                    role="alert"
                    className="border-t border-destructive/30 px-3 py-2 text-xs text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <DomainInspector
        entity={inspectedEntity}
        relationship={inspectedRelationship}
        model={model}
        onClose={() => {
          setInspectedEntityId('');
          setInspectedRelationshipId('');
        }}
        onDiscuss={(id) => {
          setSelectedIds(id);
          setInspectedEntityId('');
          setInspectedRelationshipId('');
          setTimeout(() => textarea.current?.focus(), 0);
        }}
      />
    </div>
  );
}

function LatestDomainResponse({
  run,
  canUndo,
  onUndo,
}: {
  run: DomainModelRunRecord;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const presentation = latestDomainModelResponse(run);
  const detail = run.result?.summary ?? run.error;
  const hasDetails = Boolean(
    detail || run.change || run.result?.outcome === 'clarification' || canUndo,
  );
  return (
    <LatestResponse
      {...presentation}
      title="Latest Response"
      className="absolute top-4 left-4 z-20 w-[min(360px,calc(100%-2rem))]"
    >
      {hasDetails ? (
        <div className="space-y-3 text-xs">
          {detail ? <p>{detail}</p> : null}
          {run.change ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Fact label="Added" value={run.change.added.length} />
              <Fact label="Updated" value={run.change.updated.length} />
              <Fact label="Removed" value={run.change.removed.length} />
            </div>
          ) : null}
          {run.result?.outcome === 'clarification' ? (
            <p className="rounded-lg bg-amber-500/10 p-2">
              {run.result.question}
            </p>
          ) : null}
          {canUndo ? (
            <Button variant="outline" size="sm" onClick={onUndo}>
              <RotateCcw /> Undo last change
            </Button>
          ) : null}
        </div>
      ) : null}
    </LatestResponse>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary px-2 py-1.5">
      <strong className="block text-sm">{value}</strong>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function DomainInspector({
  entity,
  relationship,
  model,
  onClose,
  onDiscuss,
}: {
  entity?: DomainEntity;
  relationship?: DomainRelationship | DerivedDomainRelationship;
  model: DomainModel;
  onClose: () => void;
  onDiscuss: (ids: string[]) => void;
}) {
  const open = Boolean(entity || relationship);
  const primary =
    entity?.fields.filter((field) => field.display === 'primary') ?? [];
  const secondary =
    entity?.fields.filter((field) => field.display === 'secondary') ?? [];
  const relationships = entity
    ? model.relationships.filter(
        (item) =>
          item.sourceEntityId === entity.id ||
          item.targetEntityId === entity.id,
      )
    : [];
  const constraints = model.constraints.filter((item) =>
    entity
      ? item.target.kind === 'model' || item.target.id === entity.id
      : relationship
        ? item.target.kind === 'model' || item.target.id === relationship.id
        : false,
  );
  const entityName = (id: string) =>
    model.entities.find((item) => item.id === id)?.name ?? id;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{entity?.name ?? relationship?.label}</SheetTitle>
          <SheetDescription>
            {entity?.meaning ?? relationship?.meaning}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {entity ? (
            <>
              <InspectorSection title="Primary fields">
                {primary.length ? (
                  primary.map((field) => (
                    <FieldRow key={field.id} field={field} />
                  ))
                ) : (
                  <EmptyLine />
                )}
              </InspectorSection>
              {secondary.length ? (
                <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Other fields · {secondary.length}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {secondary.map((field) => (
                      <FieldRow key={field.id} field={field} />
                    ))}
                  </div>
                </details>
              ) : null}
              <InspectorSection title="Relationships">
                {relationships.length ? (
                  relationships.map((item) => (
                    <p
                      key={item.id}
                      className="rounded-lg bg-secondary p-2 text-xs"
                    >
                      {entityName(item.sourceEntityId)}{' '}
                      <strong>{item.label}</strong>{' '}
                      {entityName(item.targetEntityId)}
                    </p>
                  ))
                ) : (
                  <EmptyLine />
                )}
              </InspectorSection>
            </>
          ) : relationship ? (
            <InspectorSection title="Relationship">
              <p className="text-sm">
                {entityName(relationship.sourceEntityId)}{' '}
                <strong>{relationship.label}</strong>{' '}
                {entityName(relationship.targetEntityId)}
              </p>
              <p className="text-xs text-muted-foreground">
                {relationship.sourceCardinality} →{' '}
                {relationship.targetCardinality} · {relationship.semanticRole} ·{' '}
                {relationship.provenance}
              </p>
            </InspectorSection>
          ) : null}
          <InspectorSection title="Constraints">
            {constraints.length ? (
              constraints.map((item) => (
                <p
                  key={item.id}
                  className="rounded-lg bg-secondary p-2 text-xs"
                >
                  {item.text}
                </p>
              ))
            ) : (
              <EmptyLine />
            )}
          </InspectorSection>
          <p className="text-[10px] text-muted-foreground">
            {entity?.provenance ?? relationship?.provenance ?? ''}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              onDiscuss(
                entity
                  ? [entity.id]
                  : relationship?.provenance === 'derived'
                    ? relationship.derivedFrom
                    : [relationship!.id],
              )
            }
          >
            Discuss this {entity ? 'Entity' : 'relationship'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldRow({ field }: { field: DomainEntity['fields'][number] }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <strong>{field.name}</strong>
        <span className="text-muted-foreground">
          {field.valueType}
          {field.multiple ? '[]' : ''}
        </span>
      </div>
      {field.meaning ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {field.meaning}
        </p>
      ) : null}
      <p className="mt-1 text-[9px] text-muted-foreground">
        {field.required ? 'required' : 'optional'} · {field.provenance}
      </p>
    </div>
  );
}

function EmptyLine() {
  return <p className="text-xs text-muted-foreground">None</p>;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
