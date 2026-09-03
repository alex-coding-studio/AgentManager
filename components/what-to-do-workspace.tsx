'use client';

import { Plus, Route, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AgentGraphComposerCard } from '@/components/agent-graph-composer-card';
import { AgentGraphRunningCard } from '@/components/agent-graph-running-card';
import { AgentRunControls } from '@/components/agent-run-controls';
import { ContextAttachmentPicker } from '@/components/context-attachment-picker';
import {
  LatestResponse,
  LatestResponseActions,
  LatestResponseOptions,
} from '@/components/latest-response';
import { MarkdownReaderDialog } from '@/components/markdown-reader-dialog';
import { ProjectModuleHeader } from '@/components/project-module-header';
import { ProductDesignFeaturePicker } from '@/components/product-design-feature-picker';
import { TaskGraphCanvas } from '@/components/task-graph-canvas';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUiText } from '@/components/ui-language-provider';
import type { AgentProfile } from '@/lib/agent-profile';
import {
  latestWhatToDoResponse,
  renderLatestResponseActivityLog,
} from '@/lib/latest-response';
import type { ContextBrowserFolder } from '@/lib/product-context';
import type { TaskGraphNode } from '@/lib/task-graph';
import {
  renderWhatToDoContract,
  type WhatToDoDeliveryMap,
} from '@/lib/what-to-do-map';
import type { WhatToDoRunRecord } from '@/lib/what-to-do-runs';

export function WhatToDoWorkspace({
  projectId,
  folders,
  productDesignNodes,
  initialRuns,
  initialMap,
  initialSourceUids,
}: {
  projectId: string;
  folders: ContextBrowserFolder[];
  productDesignNodes: TaskGraphNode[];
  initialRuns: WhatToDoRunRecord[];
  initialMap: WhatToDoDeliveryMap | null;
  initialSourceUids: string[];
}) {
  const { t } = useUiText();
  const router = useRouter();
  const initialTerminal = initialRuns.find((run) => run.status !== 'running');
  const initialClarification =
    initialTerminal?.result?.outcome === 'clarification'
      ? initialTerminal
      : null;
  const [runs, setRuns] = useState(initialRuns);
  const [currentMap, setCurrentMap] = useState(initialMap);
  const [sourceUids, setSourceUids] = useState([
    ...new Set([
      ...initialSourceUids,
      ...(initialClarification?.sourceUids ?? []),
    ]),
  ]);
  const [focusContractIds, setFocusContractIds] = useState<string[]>(
    initialClarification?.focusContractIds ?? [],
  );
  const [instruction, setInstruction] = useState('');
  const [clarificationOptionId, setClarificationOptionId] = useState('');
  const [profile, setProfile] = useState<AgentProfile>(
    initialClarification?.profile ?? {
      agent: 'codex',
      model: '',
      effort: '',
    },
  );
  const [folderPath, setFolderPath] = useState(folders[0]?.path ?? '');
  const [contextRefs, setContextRefs] = useState<string[]>(
    initialClarification?.contextRefs ?? [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState('');
  const [featurePickerOpen, setFeaturePickerOpen] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    path: string;
    markdown: string;
    contractUid?: string;
  } | null>(null);
  const running = runs.find((run) => run.status === 'running') ?? null;
  const latestTerminal = runs.find((run) => run.status !== 'running') ?? null;
  const featureNodes = productDesignNodes.filter(
    (node) =>
      node.role === 'node' &&
      node.status === 'accepted' &&
      node.layer === 'product-design' &&
      node.artifactKind === 'feature',
  );
  const selectedFeatureNodes = featureNodes.filter(
    (node) => node.uid && sourceUids.includes(node.uid),
  );
  const contractNodes = useMemo(
    () => buildContractNodes(currentMap, t),
    [currentMap, t],
  );
  const selectedContracts = currentMap?.contracts.filter((contract) =>
    focusContractIds.includes(contract.id),
  );

  async function refreshRuns() {
    const response = await fetch(`/api/projects/${projectId}/what-to-do-runs`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as {
      runs: WhatToDoRunRecord[];
      currentMap: WhatToDoDeliveryMap | null;
    };
    const nextTerminal = data.runs.find((run) => run.status !== 'running');
    if (
      nextTerminal?.result?.outcome === 'clarification' &&
      nextTerminal.id !== latestTerminal?.id
    ) {
      setSourceUids(nextTerminal.sourceUids);
      setFocusContractIds(nextTerminal.focusContractIds);
      setContextRefs(nextTerminal.contextRefs);
      setProfile(nextTerminal.profile);
    }
    setRuns(data.runs);
    setCurrentMap(data.currentMap);
  }

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refreshRuns(), 1200);
    return () => window.clearInterval(timer);
  });

  async function startRun() {
    setStarting(true);
    setError('');
    try {
      const body = new FormData();
      body.set('instruction', instruction);
      body.set('agent', profile.agent);
      body.set('model', profile.model);
      body.set('effort', profile.effort);
      for (const uid of sourceUids) body.append('sourceUids', uid);
      for (const id of focusContractIds) body.append('focusContractIds', id);
      for (const ref of contextRefs) body.append('contextRefs', ref);
      for (const file of files) body.append('files', file);
      const response = await fetch(
        `/api/projects/${projectId}/what-to-do-runs`,
        { method: 'POST', body },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRuns((current) => [data.run, ...current]);
      setInstruction('');
      setClarificationOptionId('');
      setSourceUids([]);
      setFocusContractIds([]);
      setFiles([]);
      setContextRefs([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Could not start the Agent Run.'),
      );
    } finally {
      setStarting(false);
    }
  }

  async function cancelRun() {
    if (!running) return;
    const response = await fetch(`/api/projects/${projectId}/what-to-do-runs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: running.id }),
    });
    const data = await response.json();
    if (response.ok)
      setRuns((current) =>
        current.map((run) => (run.id === data.run.id ? data.run : run)),
      );
    else setError(data.error);
  }

  function inspect(nodeId: string) {
    const contract = currentMap?.contracts.find((item) => item.id === nodeId);
    if (contract) {
      setPreview({
        title: contract.title,
        path: contract.outputPath,
        markdown: renderWhatToDoContract(contract),
        contractUid: contract.uid,
      });
      return;
    }
  }

  async function openResource(title: string, resourcePath: string) {
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(resourcePath)}`,
    );
    if (!response.ok) return;
    const data = await response.json();
    setPreview({ title, path: resourcePath, markdown: data.markdown });
  }

  function selectClarificationOption(
    option: Extract<
      NonNullable<WhatToDoRunRecord['result']>,
      { outcome: 'clarification' }
    >['clarification']['options'][number],
  ) {
    if (!latestTerminal) return;
    const answer = `${option.label}\n\n${option.effect}`;
    const previous =
      latestTerminal.result?.outcome === 'clarification'
        ? latestTerminal.result.clarification.options.find(
            (item) => item.id === clarificationOptionId,
          )
        : null;
    const previousAnswer = previous
      ? `${previous.label}\n\n${previous.effect}`
      : '';
    const supplementalInput = previousAnswer
      ? instruction.startsWith(`${previousAnswer}\n\n`)
        ? instruction.slice(previousAnswer.length + 2)
        : instruction === previousAnswer
          ? ''
          : instruction
      : instruction;
    if (clarificationOptionId === option.id) {
      setClarificationOptionId('');
      setInstruction(supplementalInput);
      return;
    }
    setClarificationOptionId(option.id);
    setInstruction(
      supplementalInput.trim()
        ? `${answer}\n\n${supplementalInput.trim()}`
        : answer,
    );
  }

  const presentation = latestTerminal
    ? latestWhatToDoResponse(latestTerminal)
    : null;
  return (
    <div className="flex h-dvh min-h-[480px] flex-col overflow-hidden">
      <ProjectModuleHeader
        title={t('Delivery Planning')}
        description={t(
          'Turn accepted Product Design into deliverable Contracts.',
        )}
      />
      <section className="relative min-h-0 flex-1 overflow-hidden">
        <TaskGraphCanvas
          nodes={contractNodes}
          previews={[]}
          focusedNodeId={focusedNodeId}
          locateRequest={null}
          selectedNodeIds={focusContractIds}
          readOnly
          selectionEnabled={Boolean(currentMap) && !running}
          avoidBottomRightPanel
          showAllDependencies
          showLineageLegend={false}
          showCandidateLegend={false}
          onToggleSelection={(nodeId) =>
            setFocusContractIds((current) =>
              current.includes(nodeId)
                ? current.filter((id) => id !== nodeId)
                : [...current, nodeId],
            )
          }
          onFocusNode={setFocusedNodeId}
          onInspectNode={inspect}
          onSelectPreview={inspect}
          onDecompose={() => {}}
          onCancelRun={() => void cancelRun()}
        />
        {presentation && latestTerminal ? (
          <LatestResponse
            className="absolute top-4 left-4 z-10 w-[min(380px,calc(100%-2rem))]"
            title={t('Latest Response')}
            statusLabel={t(presentation.statusLabel)}
            summary={t(presentation.summary)}
            tone={presentation.tone}
            attention={presentation.attention}
            icon={presentation.icon}
          >
            <div className="space-y-2.5">
              {latestTerminal.result?.outcome === 'clarification' ? (
                <LatestResponseOptions
                  options={latestTerminal.result.clarification.options}
                  recommendedLabel={t('Recommended')}
                  selectedId={clarificationOptionId}
                  onSelect={selectClarificationOption}
                />
              ) : null}
              {latestTerminal.result?.outcome === 'clarification' ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  {t(
                    'Choose an option or write your own answer in the Composer.',
                  )}
                </p>
              ) : null}
              <LatestResponseActions
                responseLabel={t('Response')}
                summaryLabel={t('Summary')}
                logLabel={t('Log')}
                onOpenResponse={() =>
                  void openResource(
                    t('Latest Response'),
                    `what-to-do/runs/${latestTerminal.id}/response.md`,
                  )
                }
                onOpenSummary={() =>
                  void openResource(
                    t('Summary'),
                    `what-to-do/runs/${latestTerminal.id}/summary.md`,
                  )
                }
                onOpenLog={() =>
                  setPreview({
                    title: t('Activity Log'),
                    path: latestTerminal.id,
                    markdown: renderLatestResponseActivityLog(
                      latestTerminal.activity,
                      t('Activity Log'),
                      t('No recorded activity.'),
                      t,
                    ),
                  })
                }
              />
            </div>
          </LatestResponse>
        ) : null}
        {running ? (
          <AgentGraphRunningCard
            agent={running.profile.agent}
            startedAt={running.startedAt}
            activity={running.activity}
            fallback="Reading the frozen Packet and coordinating Contracts."
            onCancel={() => void cancelRun()}
          />
        ) : (
          <AgentGraphComposerCard
            title={
              <span className="flex items-center gap-2">
                <Route className="size-4 text-muted-foreground" />
                {t('Prepare a Delivery Map')}
              </span>
            }
            description={t(
              currentMap
                ? 'Describe the update. Add Features or focus Contracts when useful.'
                : 'Choose accepted Product Design, then describe what should be delivered.',
            )}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium">{t('Main Context')}</p>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={Boolean(running) || featureNodes.length === 0}
                  onClick={() => setFeaturePickerOpen(true)}
                >
                  <Plus className="size-3" />
                  {t('Add Feature')}
                </Button>
              </div>
              {selectedFeatureNodes.length ? (
                <div className="space-y-1.5">
                  {selectedFeatureNodes.map((node) => (
                    <div
                      key={node.id}
                      className="flex items-start gap-2 rounded-lg border border-border bg-secondary/25 px-2.5 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{node.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-muted-foreground">
                          {node.summary}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={Boolean(running)}
                        aria-label={t('Remove {title}', { title: node.title })}
                        onClick={() =>
                          setSourceUids((current) =>
                            current.filter((uid) => uid !== node.uid),
                          )
                        }
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : featureNodes.length && !currentMap ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                  {t('Add at least one accepted Feature as Main Context.')}
                </p>
              ) : currentMap ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                  {t(
                    'Add a Feature only when this update needs new Product Design context.',
                  )}
                </p>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-[11px] text-muted-foreground">
                  {t(
                    'Accept a Product Design Feature in What’s Next before creating a Delivery Map.',
                  )}
                </p>
              )}
            </div>
            {currentMap ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] font-medium">
                  {t('Default Context')}
                </p>
                <p className="rounded-lg border border-border bg-secondary/25 px-2.5 py-2 text-[11px] text-muted-foreground">
                  {t('Current Delivery Map · {count} Contracts', {
                    count: currentMap.contracts.length,
                  })}
                </p>
                {selectedContracts?.length ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t('Focused Contracts')}
                    </p>
                    {selectedContracts.map((contract) => (
                      <div
                        key={contract.id}
                        className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {contract.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t('Remove {title}', {
                            title: contract.title,
                          })}
                          onClick={() =>
                            setFocusContractIds((current) =>
                              current.filter((id) => id !== contract.id),
                            )
                          }
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Textarea
              className="mt-3 resize-none text-sm"
              rows={4}
              value={instruction}
              disabled={Boolean(running)}
              placeholder={t(
                'Describe the delivery outcome, constraints or priorities…',
              )}
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="mt-3">
              <ContextAttachmentPicker
                folders={folders}
                folderPath={folderPath}
                onFolderPath={setFolderPath}
                refs={contextRefs}
                onToggleRef={(ref) =>
                  setContextRefs((current) =>
                    current.includes(ref)
                      ? current.filter((item) => item !== ref)
                      : [...current, ref],
                  )
                }
                files={files}
                onAddFiles={(added) =>
                  setFiles((current) => [...current, ...added])
                }
                onRemoveFile={(index) =>
                  setFiles((current) =>
                    current.filter((_, item) => item !== index),
                  )
                }
                label={t('Extra info')}
                disabled={Boolean(running)}
              />
            </div>
            <div className="mt-3">
              <AgentRunControls
                value={profile}
                onChange={setProfile}
                disabled={
                  !instruction.trim() ||
                  (!currentMap && sourceUids.length === 0) ||
                  starting ||
                  Boolean(running)
                }
                running={starting || Boolean(running)}
                actionLabel={
                  currentMap ? 'Update Delivery Map' : 'Create Delivery Map'
                }
                onRun={() => void startRun()}
              />
            </div>
            {error ? (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            ) : null}
          </AgentGraphComposerCard>
        )}
      </section>
      <ProductDesignFeaturePicker
        open={featurePickerOpen}
        onOpenChange={setFeaturePickerOpen}
        nodes={productDesignNodes}
        existingUids={[...(currentMap?.sourceUids ?? []), ...sourceUids]}
        onConfirm={(uids) =>
          setSourceUids((current) => [...new Set([...current, ...uids])])
        }
      />
      <MarkdownReaderDialog preview={preview} onClose={() => setPreview(null)}>
        {preview?.contractUid ? (
          <Button
            className="w-full"
            onClick={() =>
              router.push(
                `/projects/${projectId}/implementation?source=${encodeURIComponent(preview.contractUid!)}`,
              )
            }
          >
            {t('Open in Implementation')}
          </Button>
        ) : null}
      </MarkdownReaderDialog>
    </div>
  );
}

function buildContractNodes(
  map: WhatToDoDeliveryMap | null,
  t: (text: string) => string,
): TaskGraphNode[] {
  return (map?.contracts ?? []).map((contract) => ({
    schemaVersion: 1,
    id: contract.id,
    uid: contract.uid,
    relations: contract.relations,
    role: 'node',
    type: t('Delivery Contract'),
    title: contract.title,
    summary: contract.summary,
    status: 'accepted',
    createdAt: map!.updatedAt,
    updatedAt: map!.updatedAt,
    resources: [{ kind: 'output', path: contract.outputPath }],
    derivedFrom: [],
    dependsOn: contract.dependsOn,
    typeTemplateRef: contract.id,
    metadata: {
      domainImpact: contract.domainImpact.kind,
      deliveryStrategy: contract.deliveryStrategy.kind,
    },
  }));
}
