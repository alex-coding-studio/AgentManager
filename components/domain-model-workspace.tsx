'use client';

import { RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentRunControls } from '@/components/agent-run-controls';
import {
  AgentComposerAttachments,
  AgentComposerShell,
} from '@/components/agent-composer-shell';
import { AgentGraphComposerCard } from '@/components/agent-graph-composer-card';
import { LatestResponseCard } from '@/components/latest-response-card';
import { useLatestResponse } from '@/hooks/use-latest-response';
import { useSurfacePreference } from '@/hooks/use-surface-preference';
import type { LatestResponseDocument } from '@/lib/execution-observability/types';
import { ContextAttachmentPicker } from '@/components/context-attachment-picker';
import { DomainModelCanvas } from '@/components/domain-model-canvas';
import {
  LatestResponse,
  LatestResponseActions,
} from '@/components/latest-response';
import { MarkdownReaderDialog } from '@/components/markdown-reader-dialog';
import { ModuleInstructionsDialog } from '@/components/module-instructions-dialog';
import { ProjectModuleHeader } from '@/components/project-module-header';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { AgentProfile } from '@/lib/agents/profile';
import type {
  DerivedDomainRelationship,
  DomainChange,
  DomainChangeItem,
  DomainEntity,
  DomainModel,
  DomainRelationship,
} from '@/lib/modules/domain-modeling/model';
import type { DomainModelRunRecord } from '@/lib/modules/domain-modeling/runs';
import { deriveDomainRelationships } from '@/lib/modules/domain-modeling/view';
import { latestDomainModelResponse } from '@/lib/latest-response';
import type { ContextBrowserFolder } from '@/lib/modules/product-context/catalog';
import { useUiText } from '@/components/ui-language-provider';

export function DomainModelWorkspace({
  projectId,
  initialModel,
  initialRuns,
  initialResponse = null,
  initialCanUndo,
  initialLastChange,
  folders,
}: {
  projectId: string;
  initialModel: DomainModel;
  initialRuns: DomainModelRunRecord[];
  initialResponse?: LatestResponseDocument | null;
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
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const submittingRef = useRef(false);
  const latest = runs[0] ?? null;
  const running = latest?.status === 'running' ? latest : null;
  const moduleResponse = useLatestResponse(
    projectId,
    'domain-model',
    initialResponse,
  );
  const [responseCollapsed, setResponseCollapsed] = useSurfacePreference(
    projectId,
    'domain-model',
    'latest-response',
  );
  const [composerCollapsed, setComposerCollapsed] = useSurfacePreference(
    projectId,
    'domain-model',
    'composer',
  );

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
  const selectedReferenceDocuments = contextRefs.map((ref) => {
    const entry = folders
      .flatMap((folder) => folder.entries)
      .find((item) => item.kind === 'file' && item.path === ref);
    return { ref, title: entry?.title ?? ref.split('/').at(-1) ?? ref };
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
        title={t('Domain Modeling')}
        description={t(
          'Define the entities, fields and relationships behind the product.',
        )}
        actions={
          <ModuleInstructionsDialog
            endpoint={`/api/projects/${projectId}/domain-model-context`}
            title="Domain Model instructions"
            description="Applies to new Domain Model requests. Running requests keep their original instructions. Leave blank to use only the Harness defaults."
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
            tone="completed"
            attention="none"
            icon="success"
            className="absolute top-4 left-4 z-20 w-[min(360px,calc(100%-2rem))]"
          />
        ) : moduleResponse.document ? (
          <LatestResponseCard
            document={moduleResponse.document}
            collapsed={responseCollapsed}
            onCollapsedChange={setResponseCollapsed}
            onCancel={() => void cancelRun()}
            className="z-20 w-[min(360px,calc(100%-2rem))]"
          >
            {latest &&
            latest.status !== 'running' &&
            latest.id === moduleResponse.document.runId ? (
              <LatestDomainResponse
                run={latest}
                model={model}
                canUndo={canUndo}
                onUndo={undo}
                onPreview={setResponsePreview}
              />
            ) : null}
          </LatestResponseCard>
        ) : null}

        {
          <AgentGraphComposerCard
            className="z-20"
            running={moduleResponse.running || Boolean(running)}
            collapsed={composerCollapsed}
            onCollapsedChange={setComposerCollapsed}
            title={t('Describe the model change')}
            description={
              selectedContext.length
                ? t(
                    '{count} selected model entries will be treated as primary context.',
                    { count: selectedContext.length },
                  )
                : undefined
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
            <AgentComposerAttachments
              className="mt-3"
              label={t('Optional sources')}
              items={[
                ...selectedReferenceDocuments.map((entry) => ({
                  id: entry.ref,
                  label: entry.title,
                  onRemove: () =>
                    setContextRefs((current) =>
                      current.filter((item) => item !== entry.ref),
                    ),
                })),
                ...contextFiles.map((file, index) => ({
                  id: `${file.name}:${index}`,
                  label: file.name,
                  onRemove: () =>
                    setContextFiles((current) =>
                      current.filter((_, item) => item !== index),
                    ),
                })),
              ]}
            />
            <AgentComposerShell
              className="mt-3"
              controls={
                <AgentRunControls
                  extraInfo={
                    <ContextAttachmentPicker
                      embedded
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
                          current.filter((_, item) => item !== index),
                        )
                      }
                      label={t('Optional sources')}
                    />
                  }
                  extraInfoCount={contextRefs.length + contextFiles.length}
                  extraInfoLabel="Optional sources"
                  value={profile}
                  onChange={setProfile}
                  label="Domain Model Agent"
                  disabled={!instruction.trim() || submitting}
                  running={submitting}
                  onRun={startRun}
                />
              }
            >
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
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === 'Enter'
                  ) {
                    event.preventDefault();
                    void startRun();
                  }
                }}
              />
            </AgentComposerShell>
            {error ? (
              <p role="alert" className="mt-3 text-xs text-destructive">
                {t(error)}
              </p>
            ) : null}
          </AgentGraphComposerCard>
        }
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
      <MarkdownReaderDialog
        preview={responsePreview}
        onClose={() => setResponsePreview(null)}
      />
    </div>
  );
}

function LatestDomainResponse({
  run,
  model,
  canUndo,
  onUndo,
  onPreview,
}: {
  run: DomainModelRunRecord;
  model: DomainModel;
  canUndo: boolean;
  onUndo: () => void;
  onPreview: (preview: {
    title: string;
    path: string;
    markdown: string;
  }) => void;
}) {
  const { t } = useUiText();
  const changes = domainChangeGroups(run.change, model);
  return (
    <div className="w-full">
      <div className="space-y-3 text-xs">
        {changes.length ? (
          <div className="space-y-2">
            {changes.map((change) => (
              <div
                key={change.kind}
                className="w-full rounded-lg bg-secondary px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t(change.label)}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t('{cards} Cards · {entries} model entries', {
                      cards: change.cards.length,
                      entries: change.entryCount,
                    })}
                  </span>
                </div>
                {change.cards.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {change.cards.map((card) => (
                      <span
                        key={card.id}
                        className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium"
                      >
                        {card.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <LatestResponseActions
            responseLabel={t('Response')}
            summaryLabel={t('Summary')}
            onOpenResponse={() =>
              onPreview({
                title: t('Latest Response'),
                path: `domain-model/runs/${run.id}/response.md`,
                markdown: renderDomainModelResponse(run, model, t),
              })
            }
            onOpenSummary={() =>
              onPreview({
                title: t('Summary'),
                path: `domain-model/runs/${run.id}/summary.md`,
                markdown: renderDomainModelSummary(run, model, t),
              })
            }
          />
          {canUndo ? (
            <Button
              variant="outline"
              size="xs"
              className="ml-auto shrink-0"
              onClick={onUndo}
            >
              <RotateCcw /> {t('Undo last change')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderDomainModelResponse(
  run: DomainModelRunRecord,
  model: DomainModel,
  t: (text: string, values?: Record<string, string | number>) => string,
) {
  const presentation = latestDomainModelResponse(run);
  const sections = [`# ${t('Response')}`, '', t(presentation.summary)];
  if (model.entities.length) {
    sections.push('', `## ${t('Cards')}`);
    for (const entity of model.entities) {
      sections.push('', `### ${entity.name}`, '', entity.meaning);
      if (entity.fields.length)
        sections.push(
          '',
          entity.fields
            .map((field) => `- **${field.name}** — ${field.meaning}`)
            .join('\n'),
        );
    }
  }
  if (model.relationships.length)
    sections.push(
      '',
      `## ${t('Relationships')}`,
      '',
      model.relationships
        .map((relationship) => {
          const source = model.entities.find(
            (entity) => entity.id === relationship.sourceEntityId,
          )?.name;
          const target = model.entities.find(
            (entity) => entity.id === relationship.targetEntityId,
          )?.name;
          return `- **${source} → ${target}: ${relationship.label}** — ${relationship.meaning}`;
        })
        .join('\n'),
    );
  if (model.constraints.length)
    sections.push(
      '',
      `## ${t('Rules')}`,
      '',
      model.constraints.map((constraint) => `- ${constraint.text}`).join('\n'),
    );
  return `${sections.join('\n')}\n`;
}

function renderDomainModelSummary(
  run: DomainModelRunRecord,
  model: DomainModel,
  t: (text: string, values?: Record<string, string | number>) => string,
) {
  const presentation = latestDomainModelResponse(run);
  const sections = [`# ${t('Summary')}`, '', t(presentation.summary)];
  for (const change of domainChangeGroups(run.change, model)) {
    sections.push(
      '',
      `- **${t(change.label)}:** ${t(
        '{cards} Cards · {entries} model entries',
        {
          cards: change.cards.length,
          entries: change.entryCount,
        },
      )}${change.cards.length ? ` · ${change.cards.map((card) => card.label).join(', ')}` : ''}`,
    );
  }
  return `${sections.join('\n')}\n`;
}

type DisplayDomainChangeItem = Omit<DomainChangeItem, 'kind'> & {
  kind: DomainChangeItem['kind'] | 'entry';
};

function domainChangeGroups(change: DomainChange | null, model: DomainModel) {
  if (!change) return [];
  return (
    [
      ['added', 'Added'],
      ['updated', 'Updated entries'],
      ['removed', 'Removed'],
    ] as const
  ).flatMap(([kind, label]) => {
    const ids = change[kind];
    if (!ids.length) return [];
    const described =
      change.items?.[kind] ??
      ids.flatMap((id) => {
        const item = describeDomainChangeItem(id, model);
        return item ? [item] : [];
      });
    const missing = ids.length - described.length;
    const entries: DisplayDomainChangeItem[] = [
      ...described,
      ...(missing
        ? [
            {
              id: `${kind}-unavailable`,
              kind: 'entry' as const,
              label: `${missing}`,
            },
          ]
        : []),
    ];
    return [
      {
        kind,
        label,
        entryCount: ids.length,
        entries,
        cards: entries.filter((item) => item.kind === 'card'),
      },
    ];
  });
}

function describeDomainChangeItem(
  id: string,
  model: DomainModel,
): DomainChangeItem | null {
  const entity = model.entities.find((item) => item.id === id);
  if (entity) return { id, kind: 'card', label: entity.name };
  for (const owner of model.entities) {
    const field = owner.fields.find((item) => item.id === id);
    if (field)
      return {
        id,
        kind: 'field',
        label: `${owner.name} · ${field.name}`,
      };
  }
  const relationship = model.relationships.find((item) => item.id === id);
  if (relationship) {
    const source = model.entities.find(
      (item) => item.id === relationship.sourceEntityId,
    )?.name;
    const target = model.entities.find(
      (item) => item.id === relationship.targetEntityId,
    )?.name;
    return {
      id,
      kind: 'relationship',
      label: `${source} → ${target} · ${relationship.label}`,
    };
  }
  const constraint = model.constraints.find((item) => item.id === id);
  return constraint ? { id, kind: 'constraint', label: constraint.text } : null;
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
          <SheetTitle>
            {entity?.name ??
              (relationship
                ? `${entityName(relationship.sourceEntityId)} → ${entityName(relationship.targetEntityId)}`
                : '')}
          </SheetTitle>
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
              <p className="text-sm font-medium">{relationship.label}</p>
              <span className="inline-flex rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                {t(relationshipCardinalityLabel(relationship))}
              </span>
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
          {entity ? (
            <p className="text-[10px] text-muted-foreground">
              {t(entity.provenance)}
            </p>
          ) : null}
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

function relationshipCardinalityLabel(
  relationship: DomainRelationship | DerivedDomainRelationship,
) {
  const sourceMany = allowsMany(relationship.sourceCardinality);
  const targetMany = allowsMany(relationship.targetCardinality);
  if (sourceMany && targetMany) return 'Many to many';
  if (sourceMany) return 'Many to one';
  if (targetMany) return 'One to many';
  return 'One to one';
}

function allowsMany(cardinality: string) {
  const upper = cardinality.split('..').at(-1);
  return upper === '*' || Number(upper) > 1;
}
