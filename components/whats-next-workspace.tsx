'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { TaskGraphCanvas } from '@/components/task-graph-canvas';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ContextBrowserFolder } from '@/lib/product-context';
import type { TaskGraphNode } from '@/lib/task-graph';
import type { TaskGraphPreview } from '@/lib/task-graph-layout';
import type { LocalAgentKind } from '@/lib/local-agent-transport';
import type { WhatsNextRunRecord } from '@/lib/whats-next-runs';
import { cn } from '@/lib/utils';

const AGENT_LABELS: Record<LocalAgentKind, string> = {
  codex: 'Codex',
  claude: 'Claude',
};

type RunSnapshot = {
  sourceNodeIds: string[];
  instruction: string;
  revisionTarget?: { runId: string; candidateId: string };
};

type WhatsNextPreview = TaskGraphPreview;

export function WhatsNextWorkspace({
  projectId,
  folders,
  initialNodes,
}: {
  projectId: string;
  folders: ContextBrowserFolder[];
  initialNodes: TaskGraphNode[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [idea, setIdea] = useState('');
  const [creatingStart, setCreatingStart] = useState(false);
  const [startRefs, setStartRefs] = useState<string[]>([]);
  const [startFiles, setStartFiles] = useState<File[]>([]);
  const [startFolderPath, setStartFolderPath] = useState(
    folders[0]?.path ?? '',
  );
  const [runRefs, setRunRefs] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<File[]>([]);
  const [runFolderPath, setRunFolderPath] = useState(folders[0]?.path ?? '');
  const [instruction, setInstruction] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<LocalAgentKind>('claude');
  const [previews, setPreviews] = useState<WhatsNextPreview[]>([]);
  const [focusedNodeId, setFocusedNodeId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [locateRequest, setLocateRequest] = useState<{
    nodeId: string;
    sequence: number;
  } | null>(null);
  const locateSequence = useRef(0);
  const [revisionTarget, setRevisionTarget] = useState<{
    runId: string;
    candidateId: string;
  } | null>(null);
  const [reviseNote, setReviseNote] = useState('');
  const [preview, setPreview] = useState<{
    title: string;
    path: string;
    markdown: string;
  } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState('');
  const runSnapshots = useRef(new Map<string, RunSnapshot>());
  const restoredRuns = useRef(false);

  const selectedNode = nodes.find((node) => node.id === inspectorId) ?? null;
  const selectedCandidatePreview =
    previews.find(
      (item) => item.id === inspectorId && item.kind === 'candidate',
    ) ?? null;

  const selectedCandidate = selectedCandidatePreview?.candidate ?? null;
  const hasGraph = nodes.length > 0;
  const acceptedCandidateIds = new Set(
    nodes.flatMap((node) =>
      node.provenance?.candidateId ? [node.provenance.candidateId] : [],
    ),
  );
  const visiblePreviews = previews.filter(
    (item) =>
      item.kind !== 'candidate' ||
      !acceptedCandidateIds.has(item.candidate?.candidateId ?? ''),
  );
  const busy = previews.some((item) => item.kind === 'run');

  const restoreRuns = useEffectEvent(async () => {
    const response = await fetch(
      `/api/projects/${projectId}/whats-next-runs`,
    ).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { runs: WhatsNextRunRecord[] };
    setPreviews(payload.runs.flatMap(runToPreviews));
  });

  useEffect(() => {
    if (restoredRuns.current) return;
    restoredRuns.current = true;
    void restoreRuns();
  }, []);

  async function pollRun(runId: string) {
    for (let attempt = 0; attempt < 3_600; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const response = await fetch(
        `/api/projects/${projectId}/whats-next-runs?runId=${runId}`,
      ).catch(() => null);
      if (!response?.ok) continue;
      const { run } = (await response.json()) as { run: WhatsNextRunRecord };
      if (['running', 'validating'].includes(run.status)) continue;
      setPreviews((current) => [
        ...current.filter((item) => item.runId !== runId),
        ...runToPreviews(run),
      ]);
      return;
    }
  }

  async function createStart() {
    const sentence = idea.trim();
    if (!sentence || creatingStart) return;
    setCreatingStart(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', sentence.slice(0, 160));
      body.append('idea', sentence);
      for (const ref of startRefs) body.append('contextRefs', ref);
      for (const file of startFiles) body.append('files', file);
      const response = await fetch(`/api/projects/${projectId}/nodes`, {
        method: 'POST',
        body,
      });
      const payload = (await response.json()) as {
        nodes?: TaskGraphNode[];
        node?: TaskGraphNode;
        error?: string;
      };
      if (!response.ok || !payload.nodes) {
        throw new Error(payload.error ?? 'Could not create the start node.');
      }
      setNodes(payload.nodes);
      setSelectedNodeIds(payload.node ? [payload.node.id] : []);
      setIdea('');
      setStartRefs([]);
      setStartFiles([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setCreatingStart(false);
    }
  }

  async function sendRun(target?: { runId: string; candidateId: string }) {
    const text = (target ? reviseNote : instruction).trim();
    const origins = target
      ? (previews.find(
          (item) =>
            item.kind === 'candidate' &&
            item.candidate?.candidateId === target.candidateId,
        )?.derivedFrom ?? [])
      : selectedNodeIds;
    if (!text || origins.length === 0) return;
    setError('');
    try {
      const body = new FormData();
      for (const nodeId of origins) body.append('sourceNodeIds', nodeId);
      body.append('instruction', text);
      body.append('agent', selectedAgent);
      if (!target) {
        for (const ref of runRefs) body.append('contextRefs', ref);
        for (const file of runFiles) body.append('files', file);
      }
      if (target) {
        body.append('revisionRunId', target.runId);
        body.append('revisionCandidateId', target.candidateId);
      }
      const response = await fetch(
        `/api/projects/${projectId}/whats-next-runs`,
        { method: 'POST', body },
      );
      const payload = (await response.json()) as {
        run?: WhatsNextRunRecord;
        error?: string;
      };
      if (!response.ok || !payload.run) {
        throw new Error(payload.error ?? 'Could not start the Agent Run.');
      }
      runSnapshots.current.set(payload.run.runId, {
        sourceNodeIds: origins,
        instruction: text,
        revisionTarget: target,
      });
      setPreviews((current) => [...current, ...runToPreviews(payload.run!)]);
      if (target) {
        setRevisionTarget(null);
        setReviseNote('');
        setInspectorId('');
      } else {
        setInstruction('');
        setRunRefs([]);
        setRunFiles([]);
      }
      void pollRun(payload.run.runId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    }
  }

  async function cancelRun(runId: string) {
    const snapshot = runSnapshots.current.get(runId);
    setPreviews((current) => current.filter((item) => item.runId !== runId));
    await fetch(`/api/projects/${projectId}/whats-next-runs`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    }).catch(() => null);
    if (snapshot && !snapshot.revisionTarget) {
      setSelectedNodeIds(snapshot.sourceNodeIds);
      setInstruction(snapshot.instruction);
    }
  }

  async function updateCandidate(action: 'accept' | 'discard') {
    if (!selectedCandidatePreview?.runId || !selectedCandidate) return;
    const setBusy = action === 'accept' ? setAccepting : setDiscarding;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/projects/${projectId}/whats-next-runs`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action,
            runId: selectedCandidatePreview.runId,
            candidateId: selectedCandidate.candidateId,
          }),
        },
      );
      const payload = (await response.json()) as {
        nodes?: TaskGraphNode[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not update the direction.');
      }
      if (payload.nodes) setNodes(payload.nodes);
      setPreviews((current) =>
        current.filter((item) => item.id !== selectedCandidatePreview.id),
      );
      setInspectorId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setBusy(false);
    }
  }

  async function openOutput(path: string, title: string) {
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(path)}`,
    ).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { markdown: string };
    setPreview({ title, path, markdown: payload.markdown });
  }

  function toggleSelect(nodeId: string) {
    setSelectedNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((value) => value !== nodeId)
        : [...current, nodeId],
    );
  }

  if (!hasGraph) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-6">
        <div className="w-full max-w-3xl">
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            What&apos;s next
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            What do you want to build?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Write the idea in your own words. It becomes the Start of this
            Canvas, and every direction grows outward from it.
          </p>
          <Textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            rows={4}
            placeholder="A manager that brings an Agent into task decomposition…"
            maxLength={160}
            className="mt-5 resize-none text-sm"
            aria-label="Your idea"
          />
          <div className="mt-4">
            <SourcePicker
              folders={folders}
              folderPath={startFolderPath}
              onFolderPath={setStartFolderPath}
              refs={startRefs}
              onToggleRef={(refPath) =>
                setStartRefs((current) =>
                  current.includes(refPath)
                    ? current.filter((value) => value !== refPath)
                    : [...current, refPath],
                )
              }
              files={startFiles}
              onAddFiles={(added) =>
                setStartFiles((current) => [...current, ...added])
              }
              onRemoveFile={(index) =>
                setStartFiles((current) =>
                  current.filter((_, value) => value !== index),
                )
              }
              label="Optional sources"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">
              {idea.trim().length}/160 characters
            </span>
            <Button
              onClick={() => void createStart()}
              disabled={!idea.trim() || creatingStart}
            >
              {creatingStart ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Set as Start
            </Button>
          </div>
          {error ? (
            <p className="mt-4 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="min-h-0 flex-1">
        <TaskGraphCanvas
          nodes={nodes}
          previews={visiblePreviews}
          focusedNodeId={focusedNodeId}
          locateRequest={locateRequest}
          selectedNodeIds={selectedNodeIds}
          plusLabel="Ask what's next from"
          onToggleSelect={toggleSelect}
          onFocusNode={setFocusedNodeId}
          onInspectNode={setInspectorId}
          onSelectPreview={setInspectorId}
          onDecompose={(nodeId) => setSelectedNodeIds([nodeId])}
          onCancelRun={(runId) => void cancelRun(runId)}
        />
      </div>

      <div className="border-t border-border bg-background px-5 py-4 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Origins
            </span>
            {selectedNodeIds.length === 0 ? (
              <span className="text-[11px] text-muted-foreground">
                Select one or more cards on the Canvas.
              </span>
            ) : (
              selectedNodeIds.map((nodeId) => {
                const node = nodes.find((value) => value.id === nodeId);
                return (
                  <span
                    key={nodeId}
                    className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-700 dark:text-violet-300"
                  >
                    {node?.title ?? nodeId}
                    <button
                      type="button"
                      aria-label={`Remove ${node?.title ?? nodeId}`}
                      onClick={() => toggleSelect(nodeId)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })
            )}
          </div>
          <SourcePicker
            folders={folders}
            folderPath={runFolderPath}
            onFolderPath={setRunFolderPath}
            refs={runRefs}
            onToggleRef={(refPath) =>
              setRunRefs((current) =>
                current.includes(refPath)
                  ? current.filter((value) => value !== refPath)
                  : [...current, refPath],
              )
            }
            files={runFiles}
            onAddFiles={(added) =>
              setRunFiles((current) => [...current, ...added])
            }
            onRemoveFile={(index) =>
              setRunFiles((current) =>
                current.filter((_, value) => value !== index),
              )
            }
            label="Run-only sources"
          />
          <div className="flex items-end gap-3">
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={2}
              placeholder="What's next? Add a hint, or ask to combine the selected cards…"
              className="resize-none text-sm"
              aria-label="What's next instruction"
            />
            <div className="flex shrink-0 flex-col gap-2">
              <fieldset
                className="flex rounded-lg border border-border p-0.5"
                aria-label="Agent"
              >
                {(['claude', 'codex'] as LocalAgentKind[]).map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => setSelectedAgent(agent)}
                    className={cn(
                      'rounded-[7px] px-2.5 py-1 text-[11px] transition',
                      selectedAgent === agent
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {AGENT_LABELS[agent]}
                  </button>
                ))}
              </fieldset>
              <Button
                onClick={() => void sendRun()}
                disabled={
                  busy || !instruction.trim() || selectedNodeIds.length === 0
                }
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                What&apos;s next
              </Button>
            </div>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </div>

      <Sheet
        open={Boolean(inspectorId)}
        onOpenChange={(open) => {
          if (!open) {
            setInspectorId('');
            setRevisionTarget(null);
            setReviseNote('');
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          {selectedCandidate ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCandidate.title}</SheetTitle>
                <SheetDescription>
                  {selectedCandidate.candidateId} · revision{' '}
                  {selectedCandidate.revision} · unaccepted direction
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 overflow-y-auto px-4 text-sm">
                <p className="leading-6 text-muted-foreground">
                  {selectedCandidate.summary}
                </p>
                <Fact
                  label="Grew from"
                  value={selectedCandidate.derivedFrom.join(', ')}
                />
                <Fact
                  label="Depends on"
                  value={selectedCandidate.dependsOn.join(', ') || 'Nothing'}
                />
                {selectedCandidate.assumptions.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Assumptions
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {selectedCandidate.assumptions.map((assumption) => (
                        <li
                          key={assumption}
                          className="text-xs leading-5 text-muted-foreground"
                        >
                          {assumption}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selectedCandidatePreview?.outputPath ? (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-foreground underline-offset-4 hover:underline"
                    onClick={() =>
                      void openOutput(
                        selectedCandidatePreview.outputPath!,
                        selectedCandidate.title,
                      )
                    }
                  >
                    Read the generated Markdown
                    <ArrowUpRight className="size-3.5" />
                  </button>
                ) : null}
                {revisionTarget ? (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] font-medium">
                      Tell the Agent what to change
                    </p>
                    <Textarea
                      value={reviseNote}
                      onChange={(event) => setReviseNote(event.target.value)}
                      rows={3}
                      placeholder="This direction is interesting, but…"
                      className="mt-2 resize-none text-sm"
                      aria-label="Revision note"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRevisionTarget(null);
                          setReviseNote('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!reviseNote.trim()}
                        onClick={() => void sendRun(revisionTarget)}
                      >
                        Regenerate this card
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  className="flex-1"
                  disabled={accepting || discarding}
                  onClick={() => void updateCandidate('accept')}
                >
                  {accepting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Accept
                </Button>
                <Button
                  variant="outline"
                  disabled={accepting || discarding || Boolean(revisionTarget)}
                  onClick={() =>
                    setRevisionTarget({
                      runId: selectedCandidatePreview!.runId!,
                      candidateId: selectedCandidate.candidateId,
                    })
                  }
                >
                  Revise
                </Button>
                <Button
                  variant="ghost"
                  disabled={accepting || discarding}
                  aria-label="Discard this direction"
                  onClick={() => void updateCandidate('discard')}
                >
                  {discarding ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </SheetFooter>
            </>
          ) : selectedNode ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedNode.title}</SheetTitle>
                <SheetDescription>
                  {selectedNode.id} · {selectedNode.role} · {selectedNode.type}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 overflow-y-auto px-4 text-sm">
                {selectedNode.summary ? (
                  <p className="leading-6 text-muted-foreground">
                    {selectedNode.summary}
                  </p>
                ) : null}
                <Fact
                  label="Grew from"
                  value={selectedNode.derivedFrom?.join(', ') || 'Nothing'}
                />
                <Fact
                  label="Came from"
                  value={
                    selectedNode.provenance?.feature === 'whats-next'
                      ? "What's next"
                      : selectedNode.provenance
                        ? 'Task decomposition'
                        : 'Created by hand'
                  }
                />
              </div>
              <SheetFooter>
                <Button
                  className="w-full"
                  onClick={() => {
                    toggleSelect(selectedNode.id);
                    setInspectorId('');
                    locateSequence.current += 1;
                    setLocateRequest({
                      nodeId: selectedNode.id,
                      sequence: locateSequence.current,
                    });
                  }}
                >
                  {selectedNodeIds.includes(selectedNode.id)
                    ? 'Remove from origins'
                    : 'Use as origin'}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {preview ? (
        <MarkdownReader
          title={preview.title}
          filePath={preview.path}
          markdown={preview.markdown}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  );
}

function SourcePicker({
  folders,
  folderPath,
  onFolderPath,
  refs,
  onToggleRef,
  files,
  onAddFiles,
  onRemoveFile,
  label,
}: {
  folders: ContextBrowserFolder[];
  folderPath: string;
  onFolderPath: (path: string) => void;
  refs: string[];
  onToggleRef: (path: string) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folder =
    folders.find((entry) => entry.path === folderPath) ?? folders[0];

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
        {label}
        {refs.length + files.length > 0 ? (
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            {refs.length + files.length} attached
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {folders.length > 0 ? (
              <div className="flex flex-col">
                <div className="relative">
                  <select
                    aria-label="Context Library folder"
                    value={folderPath}
                    onChange={(event) => onFolderPath(event.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-2.5 pr-8 text-xs outline-none focus:border-ring"
                  >
                    {folders.map((entry) => (
                      <option key={entry.path} value={entry.path}>
                        {entry.path}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="mt-2 flex max-h-64 min-h-[8.5rem] flex-col gap-0.5 overflow-y-auto">
                  {(folder?.entries ?? [])
                    .filter((entry) => entry.kind === 'file')
                    .map((entry) => (
                      <label
                        key={entry.path}
                        className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
                      >
                        <Checkbox
                          checked={refs.includes(entry.path)}
                          onCheckedChange={() => onToggleRef(entry.path)}
                        />
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{entry.name}</span>
                      </label>
                    ))}
                  {(folder?.entries ?? []).filter(
                    (entry) => entry.kind === 'file',
                  ).length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      This folder has no Markdown documents.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid min-h-[8.5rem] place-items-center rounded-lg border border-border px-4 text-center">
                <p className="text-[11px] leading-5 text-muted-foreground">
                  This project has no Product Context library yet.
                </p>
              </div>
            )}

            <div
              className={cn(
                'grid min-h-[8.5rem] place-items-center rounded-lg border border-dashed border-border p-4 text-center transition',
                dragging && 'border-violet-500 bg-violet-500/5',
              )}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragging(false);
                onAddFiles(
                  [...event.dataTransfer.files].filter((file) =>
                    /\.(md|markdown)$/i.test(file.name),
                  ),
                );
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown"
                multiple
                className="hidden"
                onChange={(event) => {
                  onAddFiles([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" />
                Drop Markdown files here, or browse
              </button>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {files.map((file, index) => (
                <span
                  key={`${file.name}:${index}`}
                  className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs"
                >
                  <FileText className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onRemoveFile(index)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs leading-5">{value}</p>
    </div>
  );
}

function runToPreviews(run: WhatsNextRunRecord): WhatsNextPreview[] {
  const origin = run.sourceNodeIds[0] ?? '';
  const base = {
    sourceNodeId: origin,
    instruction: run.input?.instruction ?? '',
    inheritedResourceCount: run.input?.resourcePaths.length ?? 0,
    additionalResourceCount: 0,
    runId: run.runId,
    derivedFrom: run.sourceNodeIds,
  };

  if (['running', 'validating'].includes(run.status)) {
    return [
      {
        ...base,
        id: run.runId,
        kind: 'run',
        title: run.transport === 'claude-cli' ? 'Claude' : 'Codex',
        type: 'Running',
        description: run.input?.instruction ?? '',
        agentLabel: run.transport === 'claude-cli' ? 'Claude' : 'Codex',
        status: run.status,
      },
    ];
  }

  if (run.result?.outcome === 'proposal') {
    return run.result.candidates.map((candidate) => ({
      ...base,
      id: candidate.candidateId,
      kind: 'candidate' as const,
      title: candidate.title,
      type: candidate.type,
      description: candidate.summary,
      color: candidate.presentation?.color,
      derivedFrom: candidate.derivedFrom,
      dependsOn: candidate.dependsOn,
      candidate,
      outputPath: `whats-next/runs/${run.runId}/candidates/${candidate.candidateId}/output.md`,
      revisionOf: run.revisionOf,
    }));
  }

  if (['failed', 'clarification', 'no-change'].includes(run.status)) {
    return [
      {
        ...base,
        id: run.runId,
        kind: 'outcome' as const,
        title:
          run.status === 'failed'
            ? 'Run failed'
            : run.status === 'clarification'
              ? 'Needs one answer'
              : 'No further direction',
        type: run.status,
        description:
          run.error ??
          (run.result?.outcome === 'clarification'
            ? run.result.clarification.question
            : run.result?.outcome === 'no-change'
              ? run.result.reason
              : ''),
        status: run.status,
      },
    ];
  }
  return [];
}
