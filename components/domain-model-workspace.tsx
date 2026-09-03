'use client';

import { RotateCcw, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentRunControls } from '@/components/agent-run-controls';
import { AgentGraphComposerCard } from '@/components/agent-graph-composer-card';
import { ContextAttachmentPicker } from '@/components/context-attachment-picker';
import { DomainModelCanvas } from '@/components/domain-model-canvas';
import {
  LatestResponse,
  LatestResponseActions,
} from '@/components/latest-response';
import { MarkdownReader } from '@/components/markdown-reader';
import { ModuleInstructionsDialog } from '@/components/module-instructions-dialog';
import { ProjectModuleHeader } from '@/components/project-module-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
import {
  latestDomainModelResponse,
  renderLatestResponseActivityLog,
} from '@/lib/latest-response';
import type { ContextBrowserFolder } from '@/lib/product-context';
import { useUiText } from '@/components/ui-language-provider';

export function DomainModelWorkspace({
  projectId,
  initialModel,
  initialRuns,
  initialCanUndo,
  initialLastChange,
  folders,
}: {
  projectId: string;
  initialModel: DomainModel;
  initialRuns: DomainModelRunRecord[];
  initialCanUndo: boolean;
  initialLastChange: DomainChange | null;
  folders: ContextBrowserFolder[];
}) {
  const { t } = useUiText();
  const [model, setModel] = useState(initialModel);
  const [runs, setRuns] = useState(initialRuns);
  const [canUndo, setCanUndo] = useState(initialCanUndo);
  const [lastModelChange, setLastModelChange] = useState(initialLastChange);
  const [instruction, setInstruction] = useState('');
  const [contextFolderPath, setContextFolderPath] = useState(
    folders[0]?.path ?? '',
  );
  const [contextRefs, setContextRefs] = useState<string[]>([]);
  const [contextFiles, setContextFiles] = useState<File[]>([]);
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
  const [responsePreview, setResponsePreview] = useState<{
    title: string;
    path: string;
    markdown: string;
  } | null>(null);
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
      const body = new FormData();
      body.set('instruction', instruction);
      body.set('agent', profile.agent);
      body.set('model', profile.model);
      body.set('effort', profile.effort);
      for (const id of selectedIds) body.append('selectedIds', id);
      for (const ref of contextRefs) body.append('contextRefs', ref);
      for (const file of contextFiles) body.append('files', file);
      const response = await fetch(
        `/api/projects/${projectId}/domain-model-runs`,
        { method: 'POST', body },
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
      setContextRefs([]);
      setContextFiles([]);
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

  async function openResponseResource(path: string, title: string) {
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(path)}`,
    ).catch(() => null);
    if (!response?.ok) {
      setError('Could not read the source document.');
      return;
    }
    const result = (await response.json()) as { markdown: string };
    setResponsePreview({ title, path, markdown: result.markdown });
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
    <div className="relative flex h-dvh min-h-[560px] flex-col overflow-hidden">
      <ProjectModuleHeader
        title={t("What's That?")}
        description={t(
          'Define the entities, fields and relationships behind the product.',
        )}
        actions={
          <ModuleInstructionsDialog
            endpoint={`/api/projects/${projectId}/domain-model-context`}
            title="Domain Model instructions"
            description="Applies to new Domain Model requests. Running requests keep their original instructions. Leave blank to use only the Harness defaults."
            triggerLabel="Module instructions"
          />
        }
      />
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
            title={t('Latest Response')}
            statusLabel={t('Undone')}
            summary={t('The last model change was undone.')}
            tone="neutral"
            attention="none"
            icon="neutral"
            className="absolute top-4 left-4 z-20 w-[min(360px,calc(100%-2rem))]"
          />
        ) : latest && latest.status !== 'running' ? (
          <LatestDomainResponse
            run={latest}
            canUndo={canUndo}
            onUndo={undo}
            onPreview={setResponsePreview}
            onOpenResource={openResponseResource}
          />
        ) : null}

        {running ? (
          <AgentGraphComposerCard
            className="z-20"
            title={
              <span className="flex items-center gap-3 text-sm">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-sky-500" />
                </span>
                {t('{agent} is running', {
                  agent: profile.agent === 'codex' ? 'Codex' : 'Claude',
                })}{' '}
                · {formatDuration(elapsed)}
              </span>
            }
            description={t(lastActivity)}
            action={
              <Button variant="outline" size="sm" onClick={cancelRun}>
                <Square className="size-3.5" /> {t('Cancel')}
              </Button>
            }
          />
        ) : (
          <AgentGraphComposerCard
            className="z-20"
            title={t('Describe the model change')}
            description={
              selectedContext.length
                ? t(
                    '{count} selected model entries will be treated as primary context.',
                    { count: selectedContext.length },
                  )
                : t(
                    'Describe an entity, field, relationship or rule to add or change.',
                  )
            }
          >
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
                  {t('Clear context')}
                </button>
              </div>
            ) : null}
            <Textarea
              ref={textarea}
              value={instruction}
              rows={3}
              placeholder={t(
                'Describe an entity, field, relationship or rule to add or change…',
              )}
              className="min-h-24 resize-none text-sm"
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void startRun();
                }
              }}
            />
            <div className="mt-3">
              <ContextAttachmentPicker
                folders={folders}
                folderPath={contextFolderPath}
                onFolderPath={setContextFolderPath}
                refs={contextRefs}
                onToggleRef={(ref) =>
                  setContextRefs((current) =>
                    current.includes(ref)
                      ? current.filter((item) => item !== ref)
                      : [...current, ref],
                  )
                }
                files={contextFiles}
                onAddFiles={(files) =>
                  setContextFiles((current) =>
                    [...current, ...files].slice(0, 20),
                  )
                }
                onRemoveFile={(index) =>
                  setContextFiles((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                label={t('Optional sources')}
              />
            </div>
            <div className="mt-3">
              <AgentRunControls
                value={profile}
                onChange={setProfile}
                label="Domain Model Agent"
                disabled={!instruction.trim() || submitting}
                running={submitting}
                onRun={startRun}
              />
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {t(error)}
              </p>
            ) : null}
          </AgentGraphComposerCard>
        )}
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
      <Dialog
        open={responsePreview !== null}
        onOpenChange={(open) => {
          if (!open) setResponsePreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] overflow-hidden bg-transparent p-0 ring-0 sm:max-w-[min(92vw,1100px)]"
        >
          {responsePreview ? (
            <MarkdownReader
              title={responsePreview.title}
              filePath={responsePreview.path}
              markdown={responsePreview.markdown}
              onClose={() => setResponsePreview(null)}
              className="max-h-[92vh] overflow-y-auto"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LatestDomainResponse({
  run,
  canUndo,
  onUndo,
  onPreview,
  onOpenResource,
}: {
  run: DomainModelRunRecord;
  canUndo: boolean;
  onUndo: () => void;
  onPreview: (preview: {
    title: string;
    path: string;
    markdown: string;
  }) => void;
  onOpenResource: (path: string, title: string) => Promise<void>;
}) {
  const { t } = useUiText();
  const presentation = latestDomainModelResponse(run);
  const hasDetails = Boolean(run.change || canUndo);
  return (
    <LatestResponse
      {...presentation}
      statusLabel={t(presentation.statusLabel)}
      summary={t(presentation.summary)}
      title={t('Latest Response')}
      className="absolute top-4 left-4 z-20 w-[min(360px,calc(100%-2rem))]"
    >
      <div className="space-y-3 text-xs">
        {hasDetails ? (
          <div className="space-y-3">
            {run.change ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <Fact label={t('Added')} value={run.change.added.length} />
                <Fact
                  label={t('Updated entries')}
                  value={run.change.updated.length}
                />
                <Fact label={t('Removed')} value={run.change.removed.length} />
              </div>
            ) : null}
            {canUndo ? (
              <Button variant="outline" size="sm" onClick={onUndo}>
                <RotateCcw /> {t('Undo last change')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <LatestResponseActions
          responseLabel={t('Response')}
          summaryLabel={t('Summary')}
          logLabel={t('Log')}
          onOpenResponse={() =>
            onPreview({
              title: t('Latest Response'),
              path: `domain-model/runs/${run.id}/response.md`,
              markdown: renderDomainModelResponse(run, t),
            })
          }
          onOpenSummary={() =>
            void onOpenResource(
              `domain-model/runs/${run.id}/summary.md`,
              t('Summary'),
            )
          }
          onOpenLog={() =>
            onPreview({
              title: t('Activity Log'),
              path: `domain-model/runs/${run.id}/activity.jsonl`,
              markdown: renderLatestResponseActivityLog(
                run.activity,
                t('Activity Log'),
                t('No recorded activity.'),
                t,
              ),
            })
          }
        />
      </div>
    </LatestResponse>
  );
}

function renderDomainModelResponse(
  run: DomainModelRunRecord,
  t: (text: string, values?: Record<string, string | number>) => string,
) {
  const presentation = latestDomainModelResponse(run);
  const sections = [`# ${t('Response')}`, '', t(presentation.summary)];
  if (run.change) {
    for (const [label, values] of [
      [t('Added'), run.change.added],
      [t('Updated entries'), run.change.updated],
      [t('Removed'), run.change.removed],
    ] as const) {
      sections.push('', `## ${label}`, '');
      sections.push(
        values.length ? values.map((value) => `- ${value}`).join('\n') : '-',
      );
    }
  }
  return `${sections.join('\n')}\n`;
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
  const { t } = useUiText();
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
              <InspectorSection title={t('Primary fields')}>
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
                    {t('Other fields · {count}', {
                      count: secondary.length,
                    })}
                  </summary>
                  <div className="mt-3 space-y-2">
                    {secondary.map((field) => (
                      <FieldRow key={field.id} field={field} />
                    ))}
                  </div>
                </details>
              ) : null}
              <InspectorSection title={t('Relationships')}>
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
            <InspectorSection title={t('Relationship')}>
              <p className="text-sm">
                {entityName(relationship.sourceEntityId)}{' '}
                <strong>{relationship.label}</strong>{' '}
                {entityName(relationship.targetEntityId)}
              </p>
              <p className="text-xs text-muted-foreground">
                {relationship.sourceCardinality} →{' '}
                {relationship.targetCardinality} ·{' '}
                {t(relationship.semanticRole)} · {t(relationship.provenance)}
              </p>
            </InspectorSection>
          ) : null}
          <InspectorSection title={t('Constraints')}>
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
            {t(entity?.provenance ?? relationship?.provenance ?? '')}
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
            {t('Discuss this {kind}', {
              kind: t(entity ? 'Entity' : 'Relationship'),
            })}
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
  const { t } = useUiText();
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
        {t(field.required ? 'required' : 'optional')} · {t(field.provenance)}
      </p>
    </div>
  );
}

function EmptyLine() {
  const { t } = useUiText();
  return <p className="text-xs text-muted-foreground">{t('None')}</p>;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
