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
  ChevronDown,
  FileText,
  LoaderCircle,
  Pencil,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { TaskGraphCanvas } from '@/components/task-graph-canvas';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
import { getTaskGraphRelationships } from '@/lib/task-graph-rules';
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
  const [previews, setPreviews] = useState<TaskGraphPreview[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<LocalAgentKind>('claude');
  const [error, setError] = useState('');

  const [idea, setIdea] = useState('');
  const [starting, setStarting] = useState(false);
  const [startRefs, setStartRefs] = useState<string[]>([]);
  const [startFiles, setStartFiles] = useState<File[]>([]);
  const [startFolderPath, setStartFolderPath] = useState(
    folders[0]?.path ?? '',
  );

  const [growSourceId, setGrowSourceId] = useState('');
  const [growInstruction, setGrowInstruction] = useState('');
  const [growRefs, setGrowRefs] = useState<string[]>([]);
  const [growFiles, setGrowFiles] = useState<File[]>([]);
  const [growFolderPath, setGrowFolderPath] = useState(folders[0]?.path ?? '');

  const [combineIds, setCombineIds] = useState<string[]>([]);
  const [combineInstruction, setCombineInstruction] = useState('');

  const [focusedNodeId, setFocusedNodeId] = useState('');
  const [inspectorId, setInspectorId] = useState('');
  const [locateRequest, setLocateRequest] = useState<{
    nodeId: string;
    sequence: number;
  } | null>(null);
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
  const [editStartId, setEditStartId] = useState('');
  const [editText, setEditText] = useState('');
  const [savingStart, setSavingStart] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState('');
  const runSnapshots = useRef(new Map<string, RunSnapshot>());
  const restoredRuns = useRef(false);
  const locateSequence = useRef(0);

  const growSource = nodes.find((node) => node.id === growSourceId) ?? null;
  const editStart = nodes.find((node) => node.id === editStartId) ?? null;
  const combineNodes = combineIds.flatMap((nodeId) => {
    const node = nodes.find((value) => value.id === nodeId);
    return node ? [node] : [];
  });
  const selectedNode = nodes.find((node) => node.id === inspectorId) ?? null;
  const deletionBlockers = selectedNode
    ? (() => {
        const related = getTaskGraphRelationships(nodes, selectedNode.id);
        return [
          ...new Map(
            [...related.derivedNodes, ...related.dependents].map((node) => [
              node.id,
              node,
            ]),
          ).values(),
        ];
      })()
    : [];
  const selectedCandidatePreview =
    previews.find(
      (item) => item.id === inspectorId && item.kind === 'candidate',
    ) ?? null;
  const selectedCandidate = selectedCandidatePreview?.candidate ?? null;
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
  const hasGraph = nodes.length > 0;

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

  async function startRun(input: {
    sourceNodeIds: string[];
    instruction: string;
    contextRefs?: string[];
    files?: File[];
    revisionTarget?: { runId: string; candidateId: string };
  }) {
    const body = new FormData();
    for (const nodeId of input.sourceNodeIds) {
      body.append('sourceNodeIds', nodeId);
    }
    body.append('instruction', input.instruction);
    body.append('agent', selectedAgent);
    for (const ref of input.contextRefs ?? []) body.append('contextRefs', ref);
    for (const file of input.files ?? []) body.append('files', file);
    if (input.revisionTarget) {
      body.append('revisionRunId', input.revisionTarget.runId);
      body.append('revisionCandidateId', input.revisionTarget.candidateId);
    }
    const response = await fetch(`/api/projects/${projectId}/whats-next-runs`, {
      method: 'POST',
      body,
    });
    const payload = (await response.json()) as {
      run?: WhatsNextRunRecord;
      error?: string;
    };
    if (!response.ok || !payload.run) {
      throw new Error(payload.error ?? 'Could not start the Agent Run.');
    }
    runSnapshots.current.set(payload.run.runId, {
      sourceNodeIds: input.sourceNodeIds,
      instruction: input.instruction,
      revisionTarget: input.revisionTarget,
    });
    setPreviews((current) => [...current, ...runToPreviews(payload.run!)]);
    void pollRun(payload.run.runId);
  }

  async function beginFromIdea() {
    const sentence = idea.trim();
    if (!sentence || starting) return;
    setStarting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', sentence.slice(0, 160));
      body.append('idea', sentence);
      body.append('graph', 'whats-next');
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
      if (!response.ok || !payload.nodes || !payload.node) {
        throw new Error(payload.error ?? 'Could not create the Start.');
      }
      setNodes(payload.nodes);
      setIdea('');
      setStartRefs([]);
      setStartFiles([]);
      await startRun({
        sourceNodeIds: [payload.node.id],
        instruction: sentence,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setStarting(false);
    }
  }

  async function submitGrow() {
    if (!growSource || !growInstruction.trim()) return;
    setError('');
    try {
      await startRun({
        sourceNodeIds: [growSource.id],
        instruction: growInstruction,
        contextRefs: growRefs,
        files: growFiles,
      });
      closeGrow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    }
  }

  async function submitCombine() {
    if (combineIds.length < 2 || !combineInstruction.trim()) return;
    setError('');
    try {
      await startRun({
        sourceNodeIds: combineIds,
        instruction: combineInstruction,
      });
      setCombineIds([]);
      setCombineInstruction('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    }
  }

  function closeGrow() {
    setGrowSourceId('');
    setGrowInstruction('');
    setGrowRefs([]);
    setGrowFiles([]);
  }

  async function cancelRun(runId: string) {
    const snapshot = runSnapshots.current.get(runId);
    setPreviews((current) => current.filter((item) => item.runId !== runId));
    await fetch(`/api/projects/${projectId}/whats-next-runs`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    }).catch(() => null);
    if (!snapshot || snapshot.revisionTarget) return;
    if (snapshot.sourceNodeIds.length > 1) {
      setCombineIds(snapshot.sourceNodeIds);
      setCombineInstruction(snapshot.instruction);
    } else {
      setGrowSourceId(snapshot.sourceNodeIds[0] ?? '');
      setGrowInstruction(snapshot.instruction);
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

  async function reviseCandidate() {
    if (!revisionTarget || !reviseNote.trim()) return;
    const origins = selectedCandidate?.derivedFrom ?? [];
    setError('');
    try {
      await startRun({
        sourceNodeIds: origins,
        instruction: reviseNote,
        revisionTarget,
      });
      setRevisionTarget(null);
      setReviseNote('');
      setInspectorId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    }
  }

  async function saveStart() {
    if (!editStart || !editText.trim() || savingStart) return;
    setSavingStart(true);
    setError('');
    try {
      const body = new FormData();
      body.append('id', editStart.id);
      body.append('title', editText.trim().slice(0, 160));
      body.append('idea', editText.trim());
      body.append('graph', 'whats-next');
      for (const resource of editStart.resources) {
        if (resource.kind === 'context') {
          body.append('contextRefs', resource.path);
        }
        if (resource.kind === 'attachment') {
          body.append('retainedAttachmentRefs', resource.path);
        }
      }
      const response = await fetch(`/api/projects/${projectId}/nodes`, {
        method: 'PATCH',
        body,
      });
      const payload = (await response.json()) as {
        nodes?: TaskGraphNode[];
        error?: string;
      };
      if (!response.ok || !payload.nodes) {
        throw new Error(payload.error ?? 'Could not update the Start.');
      }
      setNodes(payload.nodes);
      setEditStartId('');
      setEditText('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setSavingStart(false);
    }
  }

  async function deleteNode(nodeId: string) {
    setDeletingNodeId(nodeId);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/nodes`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: nodeId, graph: 'whats-next' }),
      });
      const payload = (await response.json()) as {
        nodes?: TaskGraphNode[];
        error?: string;
        blockerNodeIds?: string[];
      };
      if (!response.ok || !payload.nodes) {
        throw new Error(
          payload.blockerNodeIds?.length
            ? `${nodeId} is still used by ${payload.blockerNodeIds.join(', ')}.`
            : (payload.error ?? 'Could not delete the card.'),
        );
      }
      setNodes(payload.nodes);
      setCombineIds((current) => current.filter((value) => value !== nodeId));
      setInspectorId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setDeletingNodeId('');
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
            Canvas, and {AGENT_LABELS[selectedAgent]} answers it straight away.
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
                setStartRefs((current) => toggle(current, refPath))
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
            <AgentSelect value={selectedAgent} onChange={setSelectedAgent} />
            <Button
              onClick={() => void beginFromIdea()}
              disabled={!idea.trim() || starting}
            >
              {starting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Start and ask
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
    <div className="relative h-[calc(100vh-4rem)]">
      <TaskGraphCanvas
        nodes={nodes}
        previews={visiblePreviews}
        focusedNodeId={focusedNodeId}
        locateRequest={locateRequest}
        selectedNodeIds={combineIds}
        plusLabel="Ask what's next from"
        edgeAlignedOverlays
        onMultiSelect={(nodeId) =>
          setCombineIds((current) => toggle(current, nodeId))
        }
        onFocusNode={setFocusedNodeId}
        onInspectNode={setInspectorId}
        onSelectPreview={setInspectorId}
        onDecompose={setGrowSourceId}
        onCancelRun={(runId) => void cancelRun(runId)}
      />

      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        {error ? (
          <p className="pointer-events-auto rounded-full bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {combineIds.length >= 2 ? (
        <div className="absolute right-5 bottom-5 w-[360px] rounded-2xl border border-border bg-background p-4 shadow-[0_18px_50px_rgb(15_23_42/12%)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">
                Combine {combineIds.length} cards
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                Their output becomes the input for one question.
              </p>
            </div>
            <button
              type="button"
              className="text-muted-foreground transition hover:text-foreground"
              aria-label="Clear the selection"
              onClick={() => {
                setCombineIds([]);
                setCombineInstruction('');
              }}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {combineNodes.map((node) => (
              <span
                key={node.id}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-secondary px-2.5 py-2 text-xs"
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{node.title}</span>
                <button
                  type="button"
                  className="text-muted-foreground transition hover:text-foreground"
                  aria-label={`Remove ${node.title}`}
                  onClick={() =>
                    setCombineIds((current) => toggle(current, node.id))
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>

          <Textarea
            value={combineInstruction}
            onChange={(event) => setCombineInstruction(event.target.value)}
            rows={3}
            maxLength={1_000}
            placeholder="What do you want to do with these together?"
            className="mt-3 resize-none text-sm"
            aria-label="What to do with the selected cards"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <AgentSelect value={selectedAgent} onChange={setSelectedAgent} />
            <Button
              size="sm"
              disabled={!combineInstruction.trim()}
              onClick={() => void submitCombine()}
            >
              <Sparkles className="size-3.5" />
              Ask
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={growSource !== null}
        onOpenChange={(open) => {
          if (!open) closeGrow();
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          {growSource ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitGrow();
              }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-sm font-semibold">
                  Grow from {growSource.id}
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {AGENT_LABELS[selectedAgent]} proposes two to five distinct
                  directions. Inherited Resources stay on the source Node;
                  additions apply only to this request.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="whats-next-agent"
                  className="text-xs font-medium"
                >
                  Agent
                </label>
                <div className="relative">
                  <select
                    id="whats-next-agent"
                    value={selectedAgent}
                    onChange={(event) =>
                      setSelectedAgent(event.target.value as LocalAgentKind)
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
                  >
                    <option value="codex">Codex</option>
                    <option value="claude">Claude</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="whats-next-instruction"
                  className="text-xs font-medium"
                >
                  Instruction
                </label>
                <Textarea
                  id="whats-next-instruction"
                  value={growInstruction}
                  maxLength={1_000}
                  placeholder="What should the next directions explore?"
                  className="min-h-28"
                  onChange={(event) => setGrowInstruction(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">
                    Input from {growSource.id}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    always included
                  </span>
                </div>
                <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-muted/30">
                  {growSource.resources.map((resource) => (
                    <div
                      key={`${resource.kind}:${resource.path}`}
                      className="flex items-center gap-2.5 px-3 py-2.5"
                    >
                      <Checkbox
                        checked
                        disabled
                        aria-label={`${resourceName(resource.path)} is always included`}
                      />
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {resourceName(resource.path)}
                      </span>
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        {resource.kind}
                      </span>
                    </div>
                  ))}
                  {growSource.resources.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] text-muted-foreground">
                      This Node carries no Resources yet.
                    </p>
                  ) : null}
                </div>
              </div>

              <SourcePicker
                folders={folders}
                folderPath={growFolderPath}
                onFolderPath={setGrowFolderPath}
                refs={growRefs}
                onToggleRef={(refPath) =>
                  setGrowRefs((current) => toggle(current, refPath))
                }
                files={growFiles}
                onAddFiles={(added) =>
                  setGrowFiles((current) => [...current, ...added])
                }
                onRemoveFile={(index) =>
                  setGrowFiles((current) =>
                    current.filter((_, value) => value !== index),
                  )
                }
                label="Run-only context"
              />

              <Button
                type="submit"
                className="w-full"
                disabled={!growInstruction.trim()}
              >
                <Sparkles className="size-4" />
                Find next directions
              </Button>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editStart !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditStartId('');
            setEditText('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {editStart ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveStart();
              }}
              className="space-y-5"
            >
              <div>
                <h2 className="text-sm font-semibold">Edit the idea</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  This rewrites {editStart.id} and the `idea.md` it carries.
                  Directions already grown from it are left alone.
                </p>
              </div>
              <Textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                rows={4}
                maxLength={160}
                className="resize-none text-sm"
                aria-label="Your idea"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {editText.trim().length}/160 characters
                </span>
                <Button
                  type="submit"
                  disabled={!editText.trim() || savingStart}
                >
                  {savingStart ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

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
                        onClick={() => void reviseCandidate()}
                      >
                        Regenerate this card
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <SheetFooter className="border-t border-border px-6 py-4">
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={accepting || discarding}
                    aria-label="Discard this direction"
                    title="Discard this direction"
                    onClick={() => void updateCandidate('discard')}
                  >
                    {discarding ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={
                      accepting || discarding || Boolean(revisionTarget)
                    }
                    onClick={() =>
                      setRevisionTarget({
                        runId: selectedCandidatePreview!.runId!,
                        candidateId: selectedCandidate.candidateId,
                      })
                    }
                  >
                    <Pencil /> Revise
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={accepting || discarding}
                    onClick={() => void updateCandidate('accept')}
                  >
                    {accepting ? 'Accepting…' : 'Accept'}
                  </Button>
                </div>
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
              <SheetFooter className="border-t border-border px-6 py-4">
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={
                      deletionBlockers.length > 0 ||
                      deletingNodeId === selectedNode.id
                    }
                    aria-label="Delete this card"
                    title={
                      deletionBlockers.length > 0
                        ? 'Delete the referencing cards first'
                        : 'Move this card to Trash'
                    }
                    onClick={() => void deleteNode(selectedNode.id)}
                  >
                    {deletingNodeId === selectedNode.id ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setInspectorId('');
                      setCombineIds((current) =>
                        toggle(current, selectedNode.id),
                      );
                      locateSequence.current += 1;
                      setLocateRequest({
                        nodeId: selectedNode.id,
                        sequence: locateSequence.current,
                      });
                    }}
                  >
                    {combineIds.includes(selectedNode.id)
                      ? 'Unselect'
                      : 'Add to selection'}
                  </Button>
                  {selectedNode.role === 'start' ? (
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => {
                        setEditStartId(selectedNode.id);
                        setEditText(selectedNode.title);
                        setInspectorId('');
                      }}
                    >
                      <Pencil /> Edit the idea
                    </Button>
                  ) : null}
                </div>
                {deletionBlockers.length > 0 ? (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Referenced by {deletionBlockers.length}{' '}
                    {deletionBlockers.length === 1 ? 'card' : 'cards'}. Delete
                    those first.
                  </p>
                ) : null}
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

function AgentSelect({
  value,
  onChange,
}: {
  value: LocalAgentKind;
  onChange: (agent: LocalAgentKind) => void;
}) {
  return (
    <fieldset
      className="flex rounded-lg border border-border p-0.5"
      aria-label="Agent"
    >
      {(['claude', 'codex'] as LocalAgentKind[]).map((agent) => (
        <button
          key={agent}
          type="button"
          onClick={() => onChange(agent)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 text-[11px] transition',
            value === agent
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {AGENT_LABELS[agent]}
        </button>
      ))}
    </fieldset>
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

function toggle(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

function resourceName(resourcePath: string) {
  return resourcePath.split('/').at(-1) ?? resourcePath;
}

function runToPreviews(run: WhatsNextRunRecord): TaskGraphPreview[] {
  const base = {
    sourceNodeId: run.sourceNodeIds[0] ?? '',
    instruction: run.input?.instruction ?? '',
    inheritedResourceCount: run.input?.resourcePaths.length ?? 0,
    additionalResourceCount: 0,
    runId: run.runId,
    derivedFrom: run.sourceNodeIds,
  };
  const agentLabel = run.transport === 'claude-cli' ? 'Claude' : 'Codex';

  if (['running', 'validating'].includes(run.status)) {
    return [
      {
        ...base,
        id: run.runId,
        kind: 'run',
        title: agentLabel,
        type: 'Running',
        description: run.input?.instruction ?? '',
        agentLabel,
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
