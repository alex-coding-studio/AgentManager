'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  FileText,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { AgentSelectField, AgentToggle } from '@/components/agent-selector';
import { ContextAttachmentPicker } from '@/components/context-attachment-picker';
import {
  MarkdownReader,
  type MarkdownFeedbackSelection,
} from '@/components/markdown-reader';
import {
  NodeProvenanceFacts,
  NodeResourceSections,
} from '@/components/node-property-sections';
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
import { replaceRunWithPreviewsInPlace } from '@/lib/task-graph-preview-state';
import { getTaskGraphRelationships } from '@/lib/task-graph-rules';
import type { LocalAgentKind } from '@/lib/local-agent-transport';
import { WHATS_NEXT_HARNESS_REVISION } from '@/lib/whats-next-harness';
import { renderWhatsNextResponseMarkdown } from '@/lib/whats-next-response';
import type {
  WhatsNextFeedbackAnchor,
  WhatsNextRunRecord,
} from '@/lib/whats-next-runs';
import { cn } from '@/lib/utils';
import { redoProposalPlan, isPendingReplacement } from '@/lib/whats-next-redo';

const AGENT_LABELS: Record<LocalAgentKind, string> = {
  codex: 'Codex',
  claude: 'Claude',
};

type RunSnapshot = {
  sourceNodeIds: string[];
  instruction: string;
  revisionTarget?: { runId: string; candidateId: string };
  redoProposal?: boolean;
};

export function WhatsNextWorkspace({
  projectId,
  folders,
  initialNodes,
  initialRuns = [],
  developmentPreview = false,
  developmentTransitionRun,
  developmentCompletionRun,
}: {
  projectId: string;
  folders: ContextBrowserFolder[];
  initialNodes: TaskGraphNode[];
  initialRuns?: WhatsNextRunRecord[];
  developmentPreview?: boolean;
  developmentTransitionRun?: WhatsNextRunRecord;
  developmentCompletionRun?: WhatsNextRunRecord;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [previews, setPreviews] = useState<TaskGraphPreview[]>(
    mergePreviews([], initialRuns.flatMap(runToPreviews)),
  );
  const [runs, setRuns] = useState<WhatsNextRunRecord[]>(initialRuns);
  const [selectedAgent, setSelectedAgent] = useState<LocalAgentKind>(
    agentForRun(initialRuns.at(-1)),
  );
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
  const [redoProposal, setRedoProposal] = useState(false);
  const [submittingGrow, setSubmittingGrow] = useState(false);
  const [replacementReviewId, setReplacementReviewId] = useState('');
  const [resolvingReplacement, setResolvingReplacement] = useState(false);
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
  const [feedbackDraft, setFeedbackDraft] = useState<{
    selection: MarkdownFeedbackSelection;
    instruction: string;
  } | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<
    WhatsNextFeedbackAnchor[]
  >([]);
  const [preview, setPreview] = useState<{
    title: string;
    path: string;
    markdown: string;
  } | null>(null);
  const [comparison, setComparison] = useState<{
    title: string;
    previous: string;
    current: string;
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
  const redoBoundary = (() => {
    if (!growSource) return { count: 0, reason: '' };
    try {
      return {
        count: redoProposalPlan(nodes, runs, [growSource.id]).candidateIds
          .length,
        reason: '',
      };
    } catch (error) {
      return {
        count: 0,
        reason:
          error instanceof Error ? error.message : 'Cannot redo this proposal.',
      };
    }
  })();
  const replacementReview =
    runs.find((run) => run.runId === replacementReviewId) ?? null;
  const pendingReplacements = runs.filter(
    (run) =>
      isPendingReplacement(run) &&
      !['running', 'validating', 'canceled', 'failed'].includes(run.status),
  );
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
  const selectedCandidateLocked = Boolean(
    selectedCandidate &&
    runs.some(
      (run) =>
        isPendingReplacement(run) &&
        !['failed', 'canceled'].includes(run.status) &&
        run.replacement!.candidateIds.includes(selectedCandidate.candidateId),
    ),
  );
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
  const latestResponse = [...runs]
    .reverse()
    .find(
      (run) => run.result && !['running', 'validating'].includes(run.status),
    );
  const continuingGrow = growSource
    ? runs.some(
        (run) =>
          run.agentSessionId &&
          run.harness.revision === WHATS_NEXT_HARNESS_REVISION &&
          run.transport ===
            (selectedAgent === 'codex' ? 'codex-cli' : 'claude-cli') &&
          run.sourceNodeIds.length === 1 &&
          run.sourceNodeIds[0] === growSource.id,
      )
    : false;

  async function loadRunsFromServer() {
    const response = await fetch(
      `/api/projects/${projectId}/whats-next-runs`,
    ).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { runs: WhatsNextRunRecord[] };
    setRuns(payload.runs);
    setSelectedAgent(agentForRun(payload.runs.at(-1)));
    setPreviews(mergePreviews([], payload.runs.flatMap(runToPreviews)));
  }

  const restoreRuns = useEffectEvent(loadRunsFromServer);

  useEffect(() => {
    if (developmentPreview) return;
    if (restoredRuns.current) return;
    restoredRuns.current = true;
    void restoreRuns();
  }, [developmentPreview]);

  useEffect(() => {
    if (!developmentTransitionRun) return;
    const transitionTimeout = window.setTimeout(() => {
      setRuns((current) => upsertRun(current, developmentTransitionRun));
      setPreviews((current) =>
        mergePreviews(current, runToPreviews(developmentTransitionRun)),
      );
      setFocusedNodeId('');
    }, 800);
    const completionTimeout = developmentCompletionRun
      ? window.setTimeout(() => {
          setRuns((current) => upsertRun(current, developmentCompletionRun));
          setPreviews((current) =>
            mergeTerminalRunPreviews(current, developmentCompletionRun),
          );
        }, 1_800)
      : null;
    return () => {
      window.clearTimeout(transitionTimeout);
      if (completionTimeout !== null) {
        window.clearTimeout(completionTimeout);
      }
    };
  }, [developmentCompletionRun, developmentTransitionRun]);

  async function pollRun(runId: string) {
    for (let attempt = 0; attempt < 3_600; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const response = await fetch(
        `/api/projects/${projectId}/whats-next-runs?runId=${runId}`,
      ).catch(() => null);
      if (!response?.ok) continue;
      const { run } = (await response.json()) as { run: WhatsNextRunRecord };
      if (['running', 'validating'].includes(run.status)) continue;
      if (run.revisionOf && run.result?.outcome !== 'proposal') {
        setFocusedNodeId('');
        await loadRunsFromServer();
        return;
      }
      setRuns((current) => upsertRun(current, run));
      setPreviews((current) => mergeTerminalRunPreviews(current, run));
      if (run.revisionOf) setFocusedNodeId('');
      return;
    }
  }

  async function startRun(input: {
    sourceNodeIds: string[];
    instruction: string;
    contextRefs?: string[];
    files?: File[];
    feedback?: WhatsNextFeedbackAnchor[];
    revisionTarget?: { runId: string; candidateId: string };
    redoProposal?: boolean;
  }) {
    const body = new FormData();
    for (const nodeId of input.sourceNodeIds) {
      body.append('sourceNodeIds', nodeId);
    }
    body.append('instruction', input.instruction);
    body.append('agent', selectedAgent);
    if (input.redoProposal) body.append('redoProposal', 'true');
    for (const ref of input.contextRefs ?? []) body.append('contextRefs', ref);
    for (const file of input.files ?? []) body.append('files', file);
    if (input.feedback?.length) {
      body.append('feedback', JSON.stringify(input.feedback));
    }
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
      redoProposal: input.redoProposal,
    });
    setRuns((current) => upsertRun(current, payload.run!));
    setPreviews((current) =>
      mergePreviews(current, runToPreviews(payload.run!)),
    );
    if (input.revisionTarget) setFocusedNodeId('');
    void pollRun(payload.run.runId);
  }

  async function beginFromIdea() {
    const sentence = idea.trim();
    if (!sentence || starting) return;
    setStarting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', titleFromIdea(sentence));
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
        instruction: '',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setStarting(false);
    }
  }

  async function submitGrow() {
    if (
      !growSource ||
      submittingGrow ||
      (redoProposal && (redoBoundary.reason || !growInstruction.trim()))
    )
      return;
    setSubmittingGrow(true);
    setError('');
    try {
      await startRun({
        sourceNodeIds: [growSource.id],
        instruction: growInstruction,
        contextRefs: growRefs,
        files: growFiles,
        redoProposal,
      });
      closeGrow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    } finally {
      setSubmittingGrow(false);
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
    setRedoProposal(false);
  }

  async function cancelRun(runId: string) {
    const snapshot = runSnapshots.current.get(runId);
    setPreviews((current) => current.filter((item) => item.runId !== runId));
    await fetch(`/api/projects/${projectId}/whats-next-runs`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId }),
    }).catch(() => null);
    if (snapshot?.revisionTarget) {
      setFocusedNodeId('');
      await loadRunsFromServer();
      return;
    }
    if (!snapshot || snapshot.revisionTarget) return;
    if (snapshot.sourceNodeIds.length > 1) {
      setCombineIds(snapshot.sourceNodeIds);
      setCombineInstruction(snapshot.instruction);
    } else {
      setGrowSourceId(snapshot.sourceNodeIds[0] ?? '');
      setGrowInstruction(snapshot.instruction);
      setRedoProposal(snapshot.redoProposal ?? false);
    }
  }

  async function resolveReplacement(
    action: 'replace-proposal' | 'keep-original',
  ) {
    if (!replacementReview || resolvingReplacement) return;
    setResolvingReplacement(true);
    setError('');
    try {
      if (developmentPreview) {
        const nextRuns =
          action === 'keep-original'
            ? runs.filter((run) => run.runId !== replacementReview.runId)
            : runs
                .filter(
                  (run) =>
                    !replacementReview.replacement!.runIds.includes(run.runId),
                )
                .map((run) =>
                  run.runId === replacementReview.runId
                    ? {
                        ...run,
                        replacement: {
                          ...run.replacement!,
                          state: 'applied' as const,
                        },
                      }
                    : run,
                );
        setRuns(nextRuns);
        setPreviews(mergePreviews([], nextRuns.flatMap(runToPreviews)));
        setReplacementReviewId('');
        setFocusedNodeId('');
        setInspectorId('');
        return;
      }
      const response = await fetch(
        `/api/projects/${projectId}/whats-next-runs`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, runId: replacementReview.runId }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? 'Could not resolve the proposal.');
      setReplacementReviewId('');
      setFocusedNodeId('');
      setInspectorId('');
      await loadRunsFromServer();
      if (payload.run?.cleanupWarning) setError(payload.run.cleanupWarning);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not resolve the proposal.',
      );
    } finally {
      setResolvingReplacement(false);
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
    if (!revisionTarget || (!reviseNote.trim() && pendingFeedback.length === 0))
      return;
    const origins = selectedCandidate?.derivedFrom ?? [];
    setError('');
    try {
      await startRun({
        sourceNodeIds: origins,
        instruction:
          reviseNote.trim() ||
          'Refine the current Markdown using the attached inline feedback.',
        feedback: pendingFeedback,
        revisionTarget,
      });
      setRevisionTarget(null);
      setReviseNote('');
      setFeedbackDraft(null);
      setPendingFeedback([]);
      setInspectorId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something failed.');
    }
  }

  async function addPendingFeedback() {
    if (
      !feedbackDraft?.instruction.trim() ||
      !selectedCandidatePreview?.outputPath ||
      !selectedCandidate
    )
      return;
    const excerptHash = await sha256(feedbackDraft.selection.excerpt);
    setPendingFeedback((current) => [
      ...current,
      {
        feedbackId: `FEEDBACK-${crypto.randomUUID()}`,
        path: selectedCandidatePreview.outputPath!,
        baseRevision: selectedCandidate.revision,
        startLine: feedbackDraft.selection.startLine,
        endLine: feedbackDraft.selection.endLine,
        excerpt: feedbackDraft.selection.excerpt,
        excerptHash,
        instruction: feedbackDraft.instruction.trim(),
      },
    ]);
    setRevisionTarget({
      runId: selectedCandidatePreview.runId!,
      candidateId: selectedCandidate.candidateId,
    });
    setFeedbackDraft(null);
  }

  async function saveStart() {
    if (!editStart || !editText.trim() || savingStart) return;
    setSavingStart(true);
    setError('');
    try {
      const body = new FormData();
      body.append('id', editStart.id);
      body.append('title', titleFromIdea(editText));
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

  async function beginEditSource(node: TaskGraphNode) {
    const source = node.resources.find((resource) => resource.kind === 'idea');
    if (!source) return;
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(source.path)}`,
    ).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { markdown: string };
    setEditStartId(node.id);
    setEditText(withoutFirstHeading(payload.markdown));
    setInspectorId('');
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

  async function openComparison(
    title: string,
    previousPath: string,
    currentPath: string,
    previousMarkdown?: string,
    currentMarkdown?: string,
  ) {
    if (previousMarkdown !== undefined && currentMarkdown !== undefined) {
      setComparison({
        title,
        previous: previousMarkdown,
        current: currentMarkdown,
      });
      return;
    }
    const [previousResponse, currentResponse] = await Promise.all([
      fetch(
        `/api/projects/${projectId}/resources?path=${encodeURIComponent(previousPath)}`,
      ),
      fetch(
        `/api/projects/${projectId}/resources?path=${encodeURIComponent(currentPath)}`,
      ),
    ]);
    if (!previousResponse.ok || !currentResponse.ok) return;
    const previous = (await previousResponse.json()) as { markdown: string };
    const current = (await currentResponse.json()) as { markdown: string };
    setComparison({
      title,
      previous: previous.markdown,
      current: current.markdown,
    });
  }

  async function openMarkdown(path: string, title: string) {
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
            placeholder="A manager that helps one developer grow and decompose product intent…"
            maxLength={4_000}
            className="mt-5 resize-none text-sm"
            aria-label="Your idea"
          />
          <p className="mt-2 text-right text-[11px] text-muted-foreground">
            {idea.trim().length}/4,000 characters
          </p>
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
            <AgentToggle value={selectedAgent} onChange={setSelectedAgent} />
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
        plusLabel="Ask what's next"
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

      {latestResponse?.result ? (
        <button
          type="button"
          className="absolute top-4 left-4 z-10 w-[min(320px,calc(100%-2rem))] rounded-xl border border-border bg-background/95 p-3 text-left shadow-[0_12px_35px_rgb(15_23_42/9%)] backdrop-blur transition hover:border-foreground/25"
          onClick={() =>
            setPreview({
              title: 'Latest Response',
              path: `whats-next/runs/${latestResponse.runId}/response.md`,
              markdown: renderWhatsNextResponseMarkdown(latestResponse.result!),
            })
          }
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <MessageSquareText className="size-3.5" />
            Latest Response
            <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
              {continuationLabel(
                latestResponse.result.reflection.continuationAdvice.action,
              )}
            </span>
          </span>
          <span className="mt-1.5 block max-h-10 overflow-hidden text-[11px] leading-5 text-muted-foreground">
            {plainMarkdown(latestResponse.result.reflection.markdown)}
          </span>
        </button>
      ) : null}

      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        {error ? (
          <p className="pointer-events-auto rounded-full bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      {pendingReplacements.length ? (
        <div className="absolute right-5 top-5 flex max-w-xs flex-col gap-2">
          {pendingReplacements.map((run) => (
            <Button
              key={run.runId}
              variant="outline"
              onClick={() => {
                setError('');
                setReplacementReviewId(run.runId);
              }}
            >
              <RotateCcw className="size-4" />
              Review replacement (
              {run.result?.outcome === 'proposal'
                ? run.result.candidates.length
                : 'response'}
              )
            </Button>
          ))}
        </div>
      ) : null}

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
            <AgentToggle value={selectedAgent} onChange={setSelectedAgent} />
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
        <DialogContent className="max-h-[88vh] overflow-y-auto pb-0 sm:max-w-2xl">
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
                  {redoProposal
                    ? 'Redo proposal from'
                    : continuingGrow
                      ? 'Continue from'
                      : 'Explore from'}{' '}
                  {growSource.id}
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {redoProposal
                    ? 'Correct the whole unaccepted proposal. Original directions stay until you review and confirm their replacement.'
                    : continuingGrow
                      ? `${AGENT_LABELS[selectedAgent]} continues the same line of inquiry with only this round’s changes.`
                      : `${AGENT_LABELS[selectedAgent]} responds with a Reflection and supported next directions.`}{' '}
                  Inherited Resources stay on the source Node; additions apply
                  only to this request.
                </p>
              </div>

              <div className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!redoProposal ? 'default' : 'outline'}
                    onClick={() => setRedoProposal(false)}
                  >
                    Explore more
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={redoProposal ? 'default' : 'outline'}
                    onClick={() => setRedoProposal(true)}
                    disabled={Boolean(redoBoundary.reason)}
                    title={
                      redoBoundary.reason ||
                      'Redo all unaccepted directions from this parent'
                    }
                  >
                    <RotateCcw className="size-3.5" />
                    Redo proposal
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {redoBoundary.reason ||
                    (redoProposal
                      ? `${redoBoundary.count} directions will be reconsidered together. No Formal Nodes will be changed.`
                      : 'Explore more adds directions without replacing the current proposal.')}
                </p>
              </div>

              <AgentSelectField
                id="whats-next-agent"
                value={selectedAgent}
                onChange={setSelectedAgent}
              />

              <div className="space-y-2">
                <label
                  htmlFor="whats-next-instruction"
                  className="text-xs font-medium"
                >
                  {redoProposal ? 'Correction' : 'Instruction'}{' '}
                  <span className="font-normal text-muted-foreground">
                    {redoProposal ? 'required' : 'optional'}
                  </span>
                </label>
                <Textarea
                  id="whats-next-instruction"
                  value={growInstruction}
                  maxLength={1_000}
                  placeholder={
                    redoProposal
                      ? 'What did this proposal misunderstand, and what do you want instead?'
                      : 'Steer this round, or let the Agent respond from the current Node.'
                  }
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

              <div className="sticky bottom-0 -mx-4 border-t border-border bg-popover px-4 py-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    developmentPreview ||
                    submittingGrow ||
                    (redoProposal &&
                      (!growInstruction.trim() || Boolean(redoBoundary.reason)))
                  }
                >
                  <Sparkles className="size-4" />
                  {submittingGrow
                    ? 'Starting…'
                    : redoProposal
                      ? 'Generate replacement proposal'
                      : continuingGrow
                        ? 'Continue exploration'
                        : 'Start exploration'}
                </Button>
                {error ? (
                  <p className="mt-2 text-xs text-destructive">{error}</p>
                ) : null}
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={replacementReview !== null}
        onOpenChange={(open) => {
          if (!open && !resolvingReplacement) setReplacementReviewId('');
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          {replacementReview ? (
            <>
              <div>
                <h2 className="text-sm font-semibold">
                  Review replacement proposal
                </h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  The original{' '}
                  {replacementReview.replacement?.candidateIds.length ?? 0}{' '}
                  directions are unchanged. Replace only if this response
                  follows your correction. Superseded proposal history goes to
                  system Trash; new directions still need individual acceptance.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {replacementReview.result ? (
                  <MarkdownReader
                    title="Replacement response"
                    filePath={`whats-next/runs/${replacementReview.runId}/response.md`}
                    markdown={renderWhatsNextResponseMarkdown(
                      replacementReview.result,
                    )}
                  />
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={resolvingReplacement}
                  onClick={() => void resolveReplacement('keep-original')}
                >
                  Keep original
                </Button>
                <Button
                  disabled={
                    resolvingReplacement ||
                    replacementReview.result?.outcome !== 'proposal'
                  }
                  onClick={() => void resolveReplacement('replace-proposal')}
                >
                  Replace proposal
                </Button>
              </div>
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </>
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
                <h2 className="text-sm font-semibold">Edit source</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  This rewrites the Markdown carried by {editStart.id}. Existing
                  directions and dependencies remain unchanged.
                </p>
              </div>
              <Textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                rows={10}
                maxLength={4_000}
                className="text-sm"
                aria-label="Source Markdown"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {editText.trim().length}/4,000 characters
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
            setFeedbackDraft(null);
            setPendingFeedback([]);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-2xl">
          {selectedCandidate ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedCandidate.title}</SheetTitle>
                <SheetDescription>
                  {selectedCandidate.candidateId} · revision{' '}
                  {selectedCandidate.revision} · unaccepted direction
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 text-sm">
                <MarkdownReader
                  title={selectedCandidate.title}
                  filePath={selectedCandidatePreview?.outputPath ?? 'output.md'}
                  markdown={
                    'outputMarkdown' in selectedCandidate &&
                    typeof selectedCandidate.outputMarkdown === 'string'
                      ? selectedCandidate.outputMarkdown
                      : `# ${selectedCandidate.title}\n\n${selectedCandidate.summary}`
                  }
                  compact
                  onAddFeedback={(selection) =>
                    setFeedbackDraft({ selection, instruction: '' })
                  }
                />

                {selectedCandidatePreview?.previousOutputPath &&
                selectedCandidatePreview.outputPath ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void openComparison(
                        selectedCandidate.title,
                        selectedCandidatePreview.previousOutputPath!,
                        selectedCandidatePreview.outputPath!,
                        selectedCandidatePreview.previousMarkdown,
                        'outputMarkdown' in selectedCandidate &&
                          typeof selectedCandidate.outputMarkdown === 'string'
                          ? selectedCandidate.outputMarkdown
                          : undefined,
                      )
                    }
                  >
                    Compare with previous revision
                  </Button>
                ) : null}

                <details className="rounded-xl border border-border p-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Graph details
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Fact
                      label="Grew from"
                      value={selectedCandidate.derivedFrom.join(', ')}
                    />
                    <Fact
                      label="Depends on"
                      value={
                        selectedCandidate.dependsOn.join(', ') || 'Nothing'
                      }
                    />
                  </div>
                </details>

                <Dialog
                  open={feedbackDraft !== null}
                  onOpenChange={(open) => {
                    if (!open) setFeedbackDraft(null);
                  }}
                >
                  <DialogContent className="sm:max-w-lg">
                    {feedbackDraft ? (
                      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                        <p className="text-[11px] font-medium">
                          Lines {feedbackDraft.selection.startLine}–
                          {feedbackDraft.selection.endLine}
                        </p>
                        <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted-foreground">
                          “{feedbackDraft.selection.excerpt}”
                        </p>
                        <Textarea
                          value={feedbackDraft.instruction}
                          onChange={(event) =>
                            setFeedbackDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    instruction: event.target.value,
                                  }
                                : null,
                            )
                          }
                          rows={3}
                          placeholder="What should the Agent reconsider here?"
                          className="mt-3 resize-none text-sm"
                          aria-label="Inline feedback"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFeedbackDraft(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!feedbackDraft.instruction.trim()}
                            onClick={() => void addPendingFeedback()}
                          >
                            Add feedback
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </DialogContent>
                </Dialog>

                {pendingFeedback.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Feedback for this Refine
                    </p>
                    {pendingFeedback.map((feedback) => (
                      <div
                        key={feedback.feedbackId}
                        className="flex items-start gap-3 rounded-xl bg-secondary px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-muted-foreground">
                            Lines {feedback.startLine}–{feedback.endLine}
                          </p>
                          <p className="mt-1 text-xs leading-5">
                            {feedback.instruction}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Remove inline feedback"
                          onClick={() =>
                            setPendingFeedback((current) =>
                              current.filter(
                                (item) =>
                                  item.feedbackId !== feedback.feedbackId,
                              ),
                            )
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <SheetFooter className="shrink-0 border-t border-border px-6 py-4">
                {revisionTarget ? (
                  <div className="w-full">
                    <p className="text-[11px] font-medium">
                      Refine this Markdown
                    </p>
                    <Textarea
                      value={reviseNote}
                      onChange={(event) => setReviseNote(event.target.value)}
                      rows={3}
                      placeholder="Describe what should change…"
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
                        disabled={
                          developmentPreview ||
                          selectedCandidateLocked ||
                          (!reviseNote.trim() && pendingFeedback.length === 0)
                        }
                        onClick={() => void reviseCandidate()}
                      >
                        {developmentPreview ? 'Preview only' : 'Send Refine'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      disabled={
                        accepting ||
                        discarding ||
                        developmentPreview ||
                        selectedCandidateLocked
                      }
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
                        accepting ||
                        discarding ||
                        Boolean(revisionTarget) ||
                        selectedCandidateLocked
                      }
                      onClick={() =>
                        setRevisionTarget({
                          runId: selectedCandidatePreview!.runId!,
                          candidateId: selectedCandidate.candidateId,
                        })
                      }
                    >
                      <Pencil /> Refine
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={
                        accepting ||
                        discarding ||
                        developmentPreview ||
                        selectedCandidateLocked
                      }
                      onClick={() => void updateCandidate('accept')}
                    >
                      {accepting ? 'Accepting…' : 'Accept'}
                    </Button>
                  </div>
                )}
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
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 text-sm">
                {selectedNode.summary ? (
                  <p className="leading-6 text-muted-foreground">
                    {selectedNode.summary}
                  </p>
                ) : null}
                <Fact
                  label="Grew from"
                  value={selectedNode.derivedFrom?.join(', ') || 'Nothing'}
                />
                <NodeResourceSections
                  node={selectedNode}
                  onOpen={(path) => void openMarkdown(path, resourceName(path))}
                />
                <NodeProvenanceFacts node={selectedNode} />
              </div>
              <SheetFooter className="shrink-0 border-t border-border px-6 py-4">
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
                        void beginEditSource(selectedNode);
                      }}
                    >
                      <Pencil /> Edit source
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

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[92vh] overflow-hidden bg-transparent p-0 ring-0 sm:max-w-[min(92vw,1100px)]"
        >
          {preview ? (
            <MarkdownReader
              title={preview.title}
              filePath={preview.path}
              markdown={preview.markdown}
              onClose={() => setPreview(null)}
              className="max-h-[92vh] overflow-y-auto"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={comparison !== null}
        onOpenChange={(open) => {
          if (!open) setComparison(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
          {comparison ? (
            <>
              <div>
                <h2 className="text-sm font-semibold">
                  Review {comparison.title}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every changed line is shown before this revision is accepted.
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border font-mono text-[11px] leading-5">
                {lineDiff(comparison.previous, comparison.current).map(
                  (line, index) => (
                    <div
                      key={`${index}:${line.text}`}
                      className={cn(
                        'grid grid-cols-[24px_1fr] px-3 py-0.5',
                        line.kind === 'added' && 'bg-emerald-500/10',
                        line.kind === 'removed' && 'bg-red-500/10',
                      )}
                    >
                      <span className="select-none text-muted-foreground">
                        {line.kind === 'added'
                          ? '+'
                          : line.kind === 'removed'
                            ? '−'
                            : ' '}
                      </span>
                      <span className="whitespace-pre-wrap break-words">
                        {line.text || ' '}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
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
  return (
    <ContextAttachmentPicker
      folders={folders}
      folderPath={folderPath}
      onFolderPath={onFolderPath}
      refs={refs}
      onToggleRef={onToggleRef}
      files={files}
      onAddFiles={onAddFiles}
      onRemoveFile={onRemoveFile}
      label={label}
    />
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

function titleFromIdea(idea: string) {
  const firstLine = idea
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return (firstLine || 'Untitled idea').slice(0, 160);
}

function withoutFirstHeading(markdown: string) {
  return markdown.replace(/^#\s+[^\n]+\n+/, '').trim();
}

function agentForRun(run: WhatsNextRunRecord | undefined): LocalAgentKind {
  return run?.transport === 'codex-cli' ? 'codex' : 'claude';
}

function mergePreviews(
  current: TaskGraphPreview[],
  incoming: TaskGraphPreview[],
) {
  const merged = new Map(current.map((preview) => [preview.id, preview]));
  for (const preview of incoming) {
    const previous = merged.get(preview.id);
    merged.set(
      preview.id,
      previous?.kind === 'candidate' &&
        preview.kind === 'run' &&
        preview.revisionOf === previous.id
        ? {
            ...preview,
            title: previous.title,
            description: previous.description,
            candidate: previous.candidate,
            outputPath: previous.outputPath,
            previousOutputPath: previous.previousOutputPath,
            previousMarkdown: previous.previousMarkdown,
          }
        : previous?.kind === 'candidate' && preview.kind === 'candidate'
          ? {
              ...preview,
              previousOutputPath:
                preview.previousOutputPath ?? previous.outputPath,
              previousMarkdown:
                previous.candidate && 'outputMarkdown' in previous.candidate
                  ? previous.candidate.outputMarkdown
                  : undefined,
            }
          : preview,
    );
  }
  return [...merged.values()];
}

function mergeTerminalRunPreviews(
  current: TaskGraphPreview[],
  run: WhatsNextRunRecord,
) {
  return replaceRunWithPreviewsInPlace(current, run.runId, runToPreviews(run));
}

function upsertRun(current: WhatsNextRunRecord[], run: WhatsNextRunRecord) {
  return [...current.filter((item) => item.runId !== run.runId), run].sort(
    (left, right) => left.startedAt.localeCompare(right.startedAt),
  );
}

function continuationLabel(
  action: 'continue' | 'consider-closing' | 'consider-branching',
) {
  if (action === 'consider-closing') return 'Ready to close';
  if (action === 'consider-branching') return 'Consider branching';
  return 'Continue';
}

function plainMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^Reflection\s*/i, '')
    .trim();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function lineDiff(previous: string, current: string) {
  const before = previous.split('\n');
  const after = current.split('\n');
  const rows = Array.from(
    { length: before.length + 1 },
    () => Array(after.length + 1).fill(0) as number[],
  );
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      rows[left]![right] =
        before[left] === after[right]
          ? rows[left + 1]![right + 1]! + 1
          : Math.max(rows[left + 1]![right]!, rows[left]![right + 1]!);
    }
  }
  const lines: Array<{
    kind: 'same' | 'added' | 'removed';
    text: string;
  }> = [];
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    if (before[left] === after[right]) {
      lines.push({ kind: 'same', text: before[left]! });
      left += 1;
      right += 1;
    } else if (rows[left + 1]![right]! >= rows[left]![right + 1]!) {
      lines.push({ kind: 'removed', text: before[left]! });
      left += 1;
    } else {
      lines.push({ kind: 'added', text: after[right]! });
      right += 1;
    }
  }
  while (left < before.length) {
    lines.push({ kind: 'removed', text: before[left]! });
    left += 1;
  }
  while (right < after.length) {
    lines.push({ kind: 'added', text: after[right]! });
    right += 1;
  }
  return lines;
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
        id: run.revisionOf ?? run.runId,
        kind: 'run',
        title: run.revisionOf ? 'Refining direction' : agentLabel,
        type: run.revisionOf ? 'Refining' : 'Running',
        description: run.input?.instruction ?? '',
        agentLabel,
        status: run.status,
        revisionOf: run.revisionOf,
      },
    ];
  }

  if (run.result?.outcome === 'proposal') {
    if (isPendingReplacement(run)) return [];
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
      previousOutputPath:
        run.revisionOf && run.parentRunId
          ? `whats-next/runs/${run.parentRunId}/candidates/${candidate.candidateId}/output.md`
          : undefined,
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
