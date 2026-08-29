'use client';

import Link from 'next/link';
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
  Folder,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { TaskGraphCanvas } from '@/components/task-graph-canvas';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import type {
  TaskDecompositionRunRecord,
  TaskDecompositionRunTransport,
} from '@/lib/task-decomposition-runs';
import { cn } from '@/lib/utils';

type DecompositionRequestPreview = TaskGraphPreview & {
  contextRefs: string[];
  files: File[];
};

const AGENT_LABELS: Record<LocalAgentKind, string> = {
  codex: 'Codex',
  claude: 'Claude',
};

const TRANSPORT_LABELS: Record<TaskDecompositionRunTransport, string> = {
  'codex-cli': 'Codex',
  'claude-cli': 'Claude',
};

type RunSnapshot = {
  sourceNodeId: string;
  instruction: string;
  contextRefs: string[];
  files: File[];
  revisionTarget?: { runId: string; candidateId: string };
  operation: 'propose' | 'append-candidates';
};

export function TaskDecompositionWorkspace({
  projectId,
  folders,
  initialNodes,
  initialPreviews,
  developmentPreview,
}: {
  projectId: string;
  folders: ContextBrowserFolder[];
  initialNodes: TaskGraphNode[];
  initialPreviews: TaskGraphPreview[];
  developmentPreview: boolean;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [title, setTitle] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState(
    folders[0]?.path ?? '',
  );
  const [files, setFiles] = useState<File[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState('');
  const [inspectorNodeId, setInspectorNodeId] = useState('');
  const [locateRequest, setLocateRequest] = useState<{
    nodeId: string;
    sequence: number;
  } | null>(null);
  const [requestPreviews, setRequestPreviews] = useState<
    DecompositionRequestPreview[]
  >(
    initialPreviews.map((preview) => ({
      ...preview,
      contextRefs: [],
      files: [],
    })),
  );
  const [decomposeSourceId, setDecomposeSourceId] = useState('');
  const [decompositionGoal, setDecompositionGoal] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<LocalAgentKind>('codex');
  const [revisionTarget, setRevisionTarget] = useState<{
    runId: string;
    candidateId: string;
  } | null>(null);
  const [runOperation, setRunOperation] = useState<
    'propose' | 'append-candidates'
  >('propose');
  const [requestSelectedRefs, setRequestSelectedRefs] = useState<string[]>([]);
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [requestFolderPath, setRequestFolderPath] = useState(
    folders[0]?.path ?? '',
  );
  const [requestDragging, setRequestDragging] = useState(false);
  const [runContextOpen, setRunContextOpen] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [retainedAttachmentRefs, setRetainedAttachmentRefs] = useState<
    string[]
  >([]);
  const [preview, setPreview] = useState<{
    title: string;
    path: string;
    markdown: string;
  } | null>(null);
  const [previewingPath, setPreviewingPath] = useState('');
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [candidateDeleteOpen, setCandidateDeleteOpen] = useState(false);
  const [discardingCandidate, setDiscardingCandidate] = useState(false);
  const [candidateActionError, setCandidateActionError] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestFileInputRef = useRef<HTMLInputElement>(null);
  const runSnapshots = useRef(new Map<string, RunSnapshot>());
  const restoredRuns = useRef(false);
  const selectedFolder =
    folders.find((folder) => folder.path === selectedFolderPath) ?? folders[0];
  const requestFolder =
    folders.find((folder) => folder.path === requestFolderPath) ?? folders[0];
  const availableSourceCount = folders.reduce(
    (count, folder) =>
      count + folder.entries.filter((entry) => entry.kind === 'file').length,
    0,
  );
  const sourceCount =
    selectedRefs.length + retainedAttachmentRefs.length + files.length;
  const selectedNode =
    nodes.find((node) => node.id === inspectorNodeId) ?? null;
  const selectedCandidatePreview =
    requestPreviews.find(
      (preview) =>
        preview.id === inspectorNodeId && preview.kind === 'candidate',
    ) ?? null;
  const selectedCandidate = selectedCandidatePreview?.candidate ?? null;
  const selectedCandidateIsRevising = selectedCandidate
    ? requestPreviews.some(
        (preview) =>
          preview.kind === 'run' &&
          preview.revisionOf === selectedCandidate.candidateId,
      )
    : false;
  const selectedRelationships = selectedNode
    ? getTaskGraphRelationships(nodes, selectedNode.id)
    : null;
  const deletionBlockers = selectedRelationships
    ? [
        ...new Map(
          [
            ...selectedRelationships.derivedNodes,
            ...selectedRelationships.dependents,
          ].map((node) => [node.id, node]),
        ).values(),
      ]
    : [];
  const decomposeSource =
    nodes.find((node) => node.id === decomposeSourceId) ?? null;

  function toggleSource(ref: string, selected: boolean) {
    setSelectedRefs((current) =>
      selected
        ? [...current, ref]
        : current.filter((candidate) => candidate !== ref),
    );
    setError('');
  }

  function addFiles(candidates: File[]) {
    const markdownFiles = candidates.filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    );
    if (markdownFiles.length !== candidates.length) {
      setError('Only Markdown source files can be added right now.');
    } else {
      setError('');
    }
    setFiles((current) => {
      const known = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      const additions = markdownFiles.filter(
        (file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`),
      );
      return [...current, ...additions].slice(0, 20);
    });
  }

  async function saveTask(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || sourceCount === 0) return;
    setCreating(true);
    setError('');
    const formData = new FormData();
    if (editingId) formData.set('id', editingId);
    formData.set('title', title.trim());
    for (const ref of selectedRefs) formData.append('contextRefs', ref);
    for (const ref of retainedAttachmentRefs) {
      formData.append('retainedAttachmentRefs', ref);
    }
    for (const file of files) formData.append('files', file);
    const response = await fetch(`/api/projects/${projectId}/nodes`, {
      method: editingId ? 'PATCH' : 'POST',
      body: formData,
    });
    const result = (await response.json()) as {
      node?: TaskGraphNode;
      nodes?: TaskGraphNode[];
      error?: string;
    };
    setCreating(false);
    if (!response.ok || !result.node || !result.nodes) {
      setError(
        result.error ??
          (editingId
            ? 'Could not update the start node.'
            : 'Could not create the start node.'),
      );
      return;
    }
    setNodes(result.nodes);
    setFocusedNodeId(result.node.id);
    setTitle('');
    setSelectedRefs([]);
    setEditingId('');
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setFormOpen(false);
  }

  function editNode(node: TaskGraphNode) {
    setEditingId(node.id);
    setTitle(node.title);
    setSelectedRefs(
      node.resources
        .filter((resource) => resource.kind === 'context')
        .map((resource) => resource.path),
    );
    setRetainedAttachmentRefs(
      node.resources
        .filter((resource) => resource.kind === 'attachment')
        .map((resource) => resource.path),
    );
    setFiles([]);
    setError('');
    setInspectorNodeId('');
    setFormOpen(true);
  }

  function cancelEditing() {
    setEditingId('');
    setTitle('');
    setSelectedRefs([]);
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setError('');
    setFormOpen(false);
  }

  function createNode() {
    setEditingId('');
    setTitle('');
    setSelectedRefs([]);
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setError('');
    setFormOpen(true);
  }

  function openDecomposition(nodeId: string) {
    const hasExistingChildren =
      nodes.some((node) => node.derivedFrom?.includes(nodeId)) ||
      requestPreviews.some(
        (candidate) =>
          candidate.kind === 'candidate' &&
          candidate.derivedFrom?.includes(nodeId),
      );
    setDecomposeSourceId(nodeId);
    setDecompositionGoal('');
    setRequestSelectedRefs([]);
    setRequestFiles([]);
    setRunContextOpen(false);
    setRequestError('');
    setRevisionTarget(null);
    setRunOperation(hasExistingChildren ? 'append-candidates' : 'propose');
  }

  function selectRequestPreview(previewId: string) {
    const preview = requestPreviews.find(
      (candidate) => candidate.id === previewId,
    );
    if (!preview) return;
    setDecomposeSourceId(preview.sourceNodeId);
    setDecompositionGoal(preview.instruction);
    setRequestSelectedRefs(preview.contextRefs);
    setRequestFiles(preview.files);
    setRunContextOpen(
      preview.contextRefs.length > 0 || preview.files.length > 0,
    );
    setRequestError('');
  }

  function closeDecomposition() {
    setDecomposeSourceId('');
    setDecompositionGoal('');
    setRequestSelectedRefs([]);
    setRequestFiles([]);
    setRequestDragging(false);
    setRunContextOpen(false);
    setRequestError('');
    setRevisionTarget(null);
    setRunOperation('propose');
  }

  function toggleRequestSource(ref: string, selected: boolean) {
    setRequestSelectedRefs((current) =>
      selected
        ? [...current, ref]
        : current.filter((candidate) => candidate !== ref),
    );
    setRequestError('');
  }

  function addRequestFiles(candidates: File[]) {
    const markdownFiles = candidates.filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    );
    if (markdownFiles.length !== candidates.length) {
      setRequestError('Only Markdown Resources can be added right now.');
    } else {
      setRequestError('');
    }
    setRequestFiles((current) => {
      const known = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      const additions = markdownFiles.filter(
        (file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`),
      );
      return [...current, ...additions].slice(0, 20);
    });
  }

  async function previewDecomposition(
    event: React.SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const goal = decompositionGoal.trim();
    if (!decomposeSource || !goal) return;
    if (!developmentPreview) {
      setRequestError('');
      const snapshot: RunSnapshot = {
        sourceNodeId: decomposeSource.id,
        instruction: goal,
        contextRefs: [...requestSelectedRefs],
        files: [...requestFiles],
        revisionTarget: revisionTarget ?? undefined,
        operation: runOperation,
      };
      const formData = new FormData();
      formData.set('sourceNodeId', decomposeSource.id);
      formData.set('instruction', goal);
      formData.set('agent', selectedAgent);
      formData.set('operation', runOperation);
      if (revisionTarget) {
        formData.set('revisionRunId', revisionTarget.runId);
        formData.set('revisionCandidateId', revisionTarget.candidateId);
      }
      for (const ref of requestSelectedRefs)
        formData.append('contextRefs', ref);
      for (const file of requestFiles) formData.append('files', file);
      const response = await fetch(
        `/api/projects/${projectId}/decomposition-runs`,
        { method: 'POST', body: formData },
      );
      const result = (await response.json()) as {
        run?: TaskDecompositionRunRecord;
        error?: string;
      };
      if (!response.ok || !result.run) {
        setRequestError(result.error ?? 'Could not start the Agent Run.');
        return;
      }
      const run = result.run;
      runSnapshots.current.set(run.runId, snapshot);
      setRequestPreviews((current) => [
        ...(revisionTarget || runOperation === 'append-candidates'
          ? current
          : current.filter(
              (candidate) => candidate.sourceNodeId !== decomposeSource.id,
            )),
        runPreview(run, snapshot, decomposeSource.resources.length),
      ]);
      closeDecomposition();
      return;
    }
    const preview: DecompositionRequestPreview = {
      id: `REQUEST-PREVIEW-${decomposeSource.id}`,
      sourceNodeId: decomposeSource.id,
      instruction: goal,
      inheritedResourceCount: decomposeSource.resources.length,
      additionalResourceCount: requestSelectedRefs.length + requestFiles.length,
      contextRefs: requestSelectedRefs,
      files: requestFiles,
      kind: 'request',
    };
    setRequestPreviews((current) => [
      ...current.filter((candidate) => candidate.id !== preview.id),
      preview,
    ]);
    closeDecomposition();
  }

  function replaceRunWithOutcome(
    runId: string,
    sourceNodeId: string,
    title: string,
    description: string,
    status: string,
  ) {
    setRequestPreviews((current) => [
      ...current.filter((preview) => preview.id !== runId),
      {
        id: runId,
        sourceNodeId,
        instruction: description,
        inheritedResourceCount: 0,
        additionalResourceCount: 0,
        contextRefs: [],
        files: [],
        kind: 'outcome',
        title,
        type: status,
        description,
        status,
      },
    ]);
    runSnapshots.current.delete(runId);
  }

  function applyRunRecord(run: TaskDecompositionRunRecord) {
    if (['running', 'validating'].includes(run.status)) {
      setRequestPreviews((current) =>
        current.map((preview) =>
          preview.id === run.runId
            ? { ...preview, status: run.status }
            : preview,
        ),
      );
      return;
    }
    const snapshot = runSnapshots.current.get(run.runId);
    if (run.status === 'canceled') {
      setRequestPreviews((current) =>
        current.filter((preview) => preview.id !== run.runId),
      );
      return;
    }
    if (run.status === 'proposal' && run.result?.outcome === 'proposal') {
      const result = run.result;
      const acceptedCandidateIds = new Set(
        nodes.flatMap((node) =>
          node.provenance?.candidateId ? [node.provenance.candidateId] : [],
        ),
      );
      const candidateIds = new Set(
        result.candidates.map((candidate) => candidate.candidateId),
      );
      setRequestPreviews((current) => [
        ...current.filter(
          (preview) =>
            preview.id !== run.runId && !candidateIds.has(preview.id),
        ),
        ...result.candidates
          .filter(
            (candidate) => !acceptedCandidateIds.has(candidate.candidateId),
          )
          .map((candidate) => ({
            candidate: {
              ...candidate,
              dependsOn: resolveCandidateDependencyIds(
                candidate.dependsOn,
                nodes,
              ),
            },
            id: candidate.candidateId,
            sourceNodeId: run.sourceNodeId,
            instruction: snapshot?.instruction ?? '',
            inheritedResourceCount: 0,
            additionalResourceCount: candidate.resources.length,
            contextRefs: [],
            files: [],
            kind: 'candidate' as const,
            title: candidate.title,
            type: candidate.type,
            description: candidate.summary,
            color: candidate.presentation.color,
            status: 'proposal',
            derivedFrom: candidate.derivedFrom,
            dependsOn: resolveCandidateDependencyIds(
              candidate.dependsOn,
              nodes,
            ),
            outputPath: candidateOutputPath(run.runId, candidate.candidateId),
            runId: run.runId,
          })),
      ]);
      runSnapshots.current.delete(run.runId);
      return;
    }
    if (
      run.status === 'clarification' &&
      run.result?.outcome === 'clarification'
    ) {
      const options = run.result.clarification.options
        .map((option) => option.label)
        .join(' · ');
      replaceRunWithOutcome(
        run.runId,
        run.sourceNodeId,
        'Clarification needed',
        `${run.result.clarification.question} ${options}`,
        run.status,
      );
      return;
    }
    if (
      run.status === 'insufficient-evidence' &&
      run.result?.outcome === 'insufficient-evidence'
    ) {
      replaceRunWithOutcome(
        run.runId,
        run.sourceNodeId,
        'More evidence needed',
        run.result.missingEvidence.join(' · '),
        run.status,
      );
      return;
    }
    if (run.status === 'no-change' && run.result?.outcome === 'no-change') {
      replaceRunWithOutcome(
        run.runId,
        run.sourceNodeId,
        'No new boundary found',
        run.result.reason,
        run.status,
      );
      return;
    }
    replaceRunWithOutcome(
      run.runId,
      run.sourceNodeId,
      'Agent Run failed',
      run.error ?? 'The Agent did not return a valid result.',
      'failed',
    );
  }

  async function cancelRun(runId: string) {
    const snapshot = runSnapshots.current.get(runId);
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-runs`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      },
    );
    if (!response.ok) return;
    setRequestPreviews((current) =>
      current.filter((preview) => preview.id !== runId),
    );
    if (snapshot) {
      setDecomposeSourceId(snapshot.sourceNodeId);
      setDecompositionGoal(snapshot.instruction);
      setRequestSelectedRefs(snapshot.contextRefs);
      setRequestFiles(snapshot.files);
      setRunContextOpen(
        snapshot.contextRefs.length > 0 || snapshot.files.length > 0,
      );
      setRevisionTarget(snapshot.revisionTarget ?? null);
      setRunOperation(snapshot.operation);
    }
    runSnapshots.current.delete(runId);
  }

  function reviseCandidate() {
    if (!selectedCandidatePreview?.runId || !selectedCandidate) return;
    setRevisionTarget({
      runId: selectedCandidatePreview.runId,
      candidateId: selectedCandidate.candidateId,
    });
    setDecomposeSourceId(selectedCandidate.derivedFrom[0] ?? '');
    setDecompositionGoal('');
    setRequestSelectedRefs([]);
    setRequestFiles([]);
    setRunContextOpen(false);
    setRequestError('');
    setRunOperation('propose');
    setCandidateActionError('');
    setInspectorNodeId('');
  }

  async function acceptCandidate() {
    if (!selectedCandidatePreview?.runId || !selectedCandidate) return;
    setAccepting(true);
    setCandidateActionError('');
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-runs`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          runId: selectedCandidatePreview.runId,
          candidateId: selectedCandidate.candidateId,
        }),
      },
    );
    const payload = (await response.json()) as {
      node?: TaskGraphNode;
      nodes?: TaskGraphNode[];
      error?: string;
    };
    setAccepting(false);
    if (!response.ok || !payload.node || !payload.nodes) {
      setCandidateActionError(
        payload.error ?? 'Could not accept the Candidate.',
      );
      return;
    }
    setNodes(payload.nodes);
    setRequestPreviews((current) =>
      current
        .filter((preview) => preview.id !== selectedCandidate.candidateId)
        .map((preview) => {
          if (!preview.dependsOn?.includes(selectedCandidate.candidateId)) {
            return preview;
          }
          const dependsOn = preview.dependsOn.map((dependencyId) =>
            dependencyId === selectedCandidate.candidateId
              ? (payload.node?.id ?? dependencyId)
              : dependencyId,
          );
          return {
            ...preview,
            dependsOn,
            candidate: preview.candidate
              ? { ...preview.candidate, dependsOn }
              : undefined,
          };
        }),
    );
    setInspectorNodeId('');
    setFocusedNodeId(payload.node.id);
    setLocateRequest((current) => ({
      nodeId: payload.node?.id ?? '',
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }

  async function discardCandidate() {
    if (!selectedCandidate) return;
    if (developmentPreview || !selectedCandidatePreview?.runId) {
      setRequestPreviews((current) =>
        current.filter(
          (preview) => preview.id !== selectedCandidate.candidateId,
        ),
      );
      finishCandidateDiscard();
      return;
    }
    setDiscardingCandidate(true);
    setCandidateActionError('');
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-runs`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discard',
          runId: selectedCandidatePreview.runId,
          candidateId: selectedCandidate.candidateId,
        }),
      },
    );
    const payload = (await response.json()) as { error?: string };
    setDiscardingCandidate(false);
    if (!response.ok) {
      setCandidateActionError(
        payload.error ?? 'Could not discard the Candidate.',
      );
      return;
    }
    setRequestPreviews((current) =>
      current.filter((preview) => preview.id !== selectedCandidate.candidateId),
    );
    finishCandidateDiscard();
  }

  function finishCandidateDiscard() {
    setCandidateDeleteOpen(false);
    setInspectorNodeId('');
    setFocusedNodeId('');
    setLocateRequest(null);
  }

  const applyRunRecordEvent = useEffectEvent(applyRunRecord);
  const replaceRunWithOutcomeEvent = useEffectEvent(replaceRunWithOutcome);

  useEffect(() => {
    if (developmentPreview || restoredRuns.current) return;
    restoredRuns.current = true;
    void fetch(`/api/projects/${projectId}/decomposition-runs`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          runs?: TaskDecompositionRunRecord[];
        };
        if (!response.ok || !payload.runs) return;
        for (const run of payload.runs) {
          if (['running', 'validating'].includes(run.status)) {
            const snapshot: RunSnapshot = {
              sourceNodeId: run.sourceNodeId,
              instruction: 'Agent Run restored from disk.',
              contextRefs: [],
              files: [],
              operation:
                run.operation === 'append-candidates'
                  ? 'append-candidates'
                  : 'propose',
            };
            setRequestPreviews((current) =>
              current.some((preview) => preview.id === run.runId)
                ? current
                : [...current, runPreview(run, snapshot, 0)],
            );
          } else {
            applyRunRecordEvent(run);
          }
        }
      })
      .catch(() => undefined);
  }, [developmentPreview, projectId]);

  useEffect(() => {
    const running = requestPreviews.filter(
      (preview) =>
        preview.kind === 'run' &&
        ['running', 'validating'].includes(preview.status ?? ''),
    );
    if (running.length === 0) return;

    const timer = window.setInterval(() => {
      void Promise.all(
        running.map(async (preview) => {
          const response = await fetch(
            `/api/projects/${projectId}/decomposition-runs?runId=${encodeURIComponent(preview.id)}`,
          );
          const payload = (await response.json()) as {
            run?: TaskDecompositionRunRecord;
            error?: string;
          };
          if (!response.ok || !payload.run) {
            replaceRunWithOutcomeEvent(
              preview.id,
              preview.sourceNodeId,
              'Agent Run unavailable',
              payload.error ?? 'Could not read the Agent Run.',
              'failed',
            );
            return;
          }
          applyRunRecordEvent(payload.run);
        }),
      );
    }, 750);
    return () => window.clearInterval(timer);
  }, [projectId, requestPreviews]);

  async function previewResource(resourcePath: string) {
    setPreviewingPath(resourcePath);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(resourcePath)}`,
    );
    const result = (await response.json()) as {
      fileName?: string;
      path?: string;
      markdown?: string;
      error?: string;
    };
    setPreviewingPath('');
    if (
      !response.ok ||
      !result.fileName ||
      !result.path ||
      result.markdown === undefined
    ) {
      setError(result.error ?? 'Could not read the source document.');
      return;
    }
    setPreview({
      title: result.fileName,
      path: result.path,
      markdown: result.markdown,
    });
  }

  function dropFiles(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function locateNode(nodeId: string) {
    setInspectorNodeId('');
    setFocusedNodeId(nodeId);
    setLocateRequest((current) => ({
      nodeId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
  }

  async function deleteSelectedNode() {
    if (!selectedNode || deletionBlockers.length > 0) return;
    setDeleting(true);
    setDeleteError('');

    if (developmentPreview) {
      setNodes((current) =>
        current.filter((node) => node.id !== selectedNode.id),
      );
      setRequestPreviews((current) =>
        current.filter((preview) => preview.sourceNodeId !== selectedNode.id),
      );
      finishNodeDeletion();
      return;
    }

    const response = await fetch(`/api/projects/${projectId}/nodes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedNode.id }),
    });
    const result = (await response.json()) as {
      nodes?: TaskGraphNode[];
      error?: string;
    };
    if (!response.ok || !result.nodes) {
      setDeleting(false);
      setDeleteError(result.error ?? 'Could not delete the node.');
      return;
    }
    setNodes(result.nodes);
    setRequestPreviews((current) =>
      current.filter((preview) => preview.sourceNodeId !== selectedNode.id),
    );
    finishNodeDeletion();
  }

  function finishNodeDeletion() {
    setDeleting(false);
    setDeleteOpen(false);
    setInspectorNodeId('');
    setFocusedNodeId('');
    setLocateRequest(null);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <header className="flex shrink-0 items-end justify-between gap-6 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Task decomposition
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            Task canvas
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Capture one starting point, then decompose it into Task nodes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-foreground" />
            {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
          </div>
          <Link
            href={`/projects/${projectId}/decomposition/context`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <SlidersHorizontal /> Context
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <section className="relative h-[calc(100vh-10rem)] min-h-[480px] overflow-hidden">
          {nodes.length === 0 ? (
            <div className="min-h-full bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:22px_22px] p-8 lg:p-12">
              <div className="grid min-h-[440px] place-items-center">
                <button
                  type="button"
                  className="grid min-h-[156px] w-72 place-items-center rounded-2xl border border-dashed border-border bg-background/80 text-muted-foreground shadow-sm transition hover:border-foreground/40 hover:bg-secondary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  aria-label="Create Start"
                  onClick={createNode}
                >
                  <span className="flex flex-col items-center gap-2">
                    <Plus className="size-5" />
                    <span className="text-xs font-medium">Start</span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <TaskGraphCanvas
              nodes={nodes}
              previews={requestPreviews}
              focusedNodeId={focusedNodeId}
              locateRequest={locateRequest}
              onFocusNode={setFocusedNodeId}
              onInspectNode={(nodeId) => {
                setFocusedNodeId(nodeId);
                setInspectorNodeId(nodeId);
              }}
              onSelectPreview={selectRequestPreview}
              onDecompose={openDecomposition}
              onCancelRun={cancelRun}
            />
          )}
        </section>

        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            if (open) setFormOpen(true);
            else cancelEditing();
          }}
        >
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={saveTask} className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold">
                  {editingId ? `Edit ${editingId}` : 'New start node'}
                </h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Select every document needed to understand what will be
                  decomposed.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="task-title" className="text-xs font-medium">
                  Start-node title
                </label>
                <Input
                  id="task-title"
                  value={title}
                  maxLength={160}
                  placeholder="Task decomposition MVP"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="context-folder" className="text-xs font-medium">
                  Context Library folder
                </label>
                <div className="relative">
                  <select
                    id="context-folder"
                    value={selectedFolder?.path ?? ''}
                    onChange={(event) =>
                      setSelectedFolderPath(event.target.value)
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
                  >
                    {folders.map((folder) => {
                      const depth = folder.path.split('/').length - 2;
                      return (
                        <option key={folder.path} value={folder.path}>
                          {`${'— '.repeat(depth)}${folder.title}`}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {availableSourceCount === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      No Markdown documents are available yet.
                    </p>
                  ) : !selectedFolder || selectedFolder.entries.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      This folder is empty.
                    </p>
                  ) : (
                    selectedFolder.entries.map((entry, index) => {
                      if (entry.kind === 'folder') {
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/50"
                            onClick={() => setSelectedFolderPath(entry.path)}
                          >
                            <Folder className="size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {entry.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Folder
                            </span>
                          </button>
                        );
                      }
                      const checked = selectedRefs.includes(entry.path);
                      const inputId = `context-source-${index}`;
                      return (
                        <label
                          key={entry.path}
                          htmlFor={inputId}
                          className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition hover:bg-muted/50"
                        >
                          <Checkbox
                            id={inputId}
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleSource(entry.path, value === true)
                            }
                            aria-label={`Use ${entry.name}`}
                            className="mt-0.5"
                          />
                          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[11px] font-medium">
                              {entry.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {entry.title}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium">Local Markdown</p>
                <button
                  type="button"
                  className={cn(
                    'flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-4 text-center transition',
                    dragging && 'border-foreground bg-secondary',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragging(false)}
                  onDrop={dropFiles}
                >
                  <Upload className="size-4" />
                  <span className="mt-2 text-xs font-medium">
                    Drop Markdown or choose files
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    Up to 20 files, 2 MB each
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  multiple
                  hidden
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                {files.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}:${file.size}:${file.lastModified}`}
                        className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2"
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${file.name}`}
                          title="Remove source"
                          onClick={() =>
                            setFiles((current) =>
                              current.filter(
                                (_, candidateIndex) => candidateIndex !== index,
                              ),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {retainedAttachmentRefs.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {retainedAttachmentRefs.map((ref) => (
                      <li
                        key={ref}
                        className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2"
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {resourceName(ref)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${resourceName(ref)}`}
                          title="Remove source"
                          onClick={() =>
                            setRetainedAttachmentRefs((current) =>
                              current.filter((candidate) => candidate !== ref),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="border-t border-border pt-5">
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!title.trim() || sourceCount === 0 || creating}
                >
                  {editingId ? <Pencil /> : <Plus />}{' '}
                  {creating
                    ? editingId
                      ? 'Saving…'
                      : 'Creating…'
                    : editingId
                      ? 'Save changes'
                      : 'Create start node'}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}{' '}
                  selected
                </p>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={decomposeSource !== null}
          onOpenChange={(open) => {
            if (!open) closeDecomposition();
          }}
        >
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            {decomposeSource ? (
              <form onSubmit={previewDecomposition} className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold">
                    {revisionTarget
                      ? `Revise ${revisionTarget.candidateId}`
                      : runOperation === 'append-candidates'
                        ? `Extend ${decomposeSource.id}`
                        : `Decompose from ${decomposeSource.id}`}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {revisionTarget
                      ? 'Redefine this Candidate only. Revisions cannot create siblings or child Nodes.'
                      : runOperation === 'append-candidates'
                        ? `Existing child boundaries will not be replaced. Add new evidence or guidance so ${AGENT_LABELS[selectedAgent]} can propose only genuinely new siblings.`
                        : 'Define this round of work. Inherited Resources stay on the source Node; additions apply only to this request.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="decomposition-agent"
                    className="text-xs font-medium"
                  >
                    Agent
                  </label>
                  <div className="relative">
                    <select
                      id="decomposition-agent"
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
                    htmlFor="decomposition-goal"
                    className="text-xs font-medium"
                  >
                    Instruction
                  </label>
                  <Textarea
                    id="decomposition-goal"
                    value={decompositionGoal}
                    maxLength={1_000}
                    placeholder={
                      revisionTarget
                        ? 'Describe how this Candidate itself should change.'
                        : runOperation === 'append-candidates'
                          ? 'Describe the new evidence or boundary that may require additional siblings.'
                          : 'Generate several candidate modules from this product definition.'
                    }
                    className="min-h-28"
                    onChange={(event) =>
                      setDecompositionGoal(event.target.value)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">Inherited Resources</p>
                    <span className="text-[10px] text-muted-foreground">
                      {decomposeSource.resources.length}
                    </span>
                  </div>
                  <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                    {decomposeSource.resources.map((resource) => (
                      <div
                        key={`${resource.kind}:${resource.path}`}
                        className="flex items-center gap-2.5 px-3 py-2.5"
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {resourceName(resource.path)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {resource.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
                    aria-expanded={runContextOpen}
                    onClick={() => setRunContextOpen((current) => !current)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">
                        Run-only context
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        Optional Resources for this Agent Run only
                      </span>
                    </span>
                    {requestSelectedRefs.length + requestFiles.length > 0 ? (
                      <span className="text-[10px] text-muted-foreground">
                        {requestSelectedRefs.length + requestFiles.length}
                      </span>
                    ) : null}
                    <ChevronDown
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform',
                        runContextOpen && 'rotate-180',
                      )}
                    />
                  </button>

                  {runContextOpen ? (
                    <div className="space-y-5 border-t border-border p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium">
                            Additional Context Library Resources
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {requestSelectedRefs.length}
                          </span>
                        </div>
                        <div className="relative">
                          <select
                            aria-label="Additional Resource folder"
                            value={requestFolder?.path ?? ''}
                            onChange={(event) =>
                              setRequestFolderPath(event.target.value)
                            }
                            className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
                          >
                            {folders.map((folder) => {
                              const depth = folder.path.split('/').length - 2;
                              return (
                                <option key={folder.path} value={folder.path}>
                                  {`${'— '.repeat(depth)}${folder.title}`}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        </div>
                        <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                          {!requestFolder ||
                          requestFolder.entries.length === 0 ? (
                            <p className="p-4 text-xs text-muted-foreground">
                              This folder is empty.
                            </p>
                          ) : (
                            requestFolder.entries.map((entry, index) => {
                              if (entry.kind === 'folder') {
                                return (
                                  <button
                                    key={entry.path}
                                    type="button"
                                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/50"
                                    onClick={() =>
                                      setRequestFolderPath(entry.path)
                                    }
                                  >
                                    <Folder className="size-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                      {entry.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      Folder
                                    </span>
                                  </button>
                                );
                              }
                              const checked = requestSelectedRefs.includes(
                                entry.path,
                              );
                              const inputId = `request-context-${index}`;
                              return (
                                <label
                                  key={entry.path}
                                  htmlFor={inputId}
                                  className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition hover:bg-muted/50"
                                >
                                  <Checkbox
                                    id={inputId}
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      toggleRequestSource(
                                        entry.path,
                                        value === true,
                                      )
                                    }
                                    aria-label={`Add ${entry.name} to this request`}
                                    className="mt-0.5"
                                  />
                                  <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0">
                                    <span className="block truncate font-mono text-[11px] font-medium">
                                      {entry.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                                      {entry.title}
                                    </span>
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium">
                            Additional Local Markdown
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {requestFiles.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'flex min-h-20 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-3 text-center transition',
                            requestDragging && 'border-foreground bg-secondary',
                          )}
                          onClick={() => requestFileInputRef.current?.click()}
                          onDragEnter={(event) => {
                            event.preventDefault();
                            setRequestDragging(true);
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDragLeave={() => setRequestDragging(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setRequestDragging(false);
                            addRequestFiles(
                              Array.from(event.dataTransfer.files),
                            );
                          }}
                        >
                          <Upload className="size-4" />
                          <span className="mt-1.5 text-xs font-medium">
                            Drop Markdown or choose files
                          </span>
                        </button>
                        <input
                          ref={requestFileInputRef}
                          type="file"
                          accept=".md,.markdown,text/markdown"
                          multiple
                          hidden
                          onChange={(event) => {
                            addRequestFiles(
                              Array.from(event.target.files ?? []),
                            );
                            event.target.value = '';
                          }}
                        />
                        {requestFiles.length > 0 ? (
                          <ul className="space-y-1.5 pt-1">
                            {requestFiles.map((file, index) => (
                              <li
                                key={`${file.name}:${file.size}:${file.lastModified}`}
                                className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2"
                              >
                                <FileText className="size-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-[11px]">
                                  {file.name}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Remove ${file.name}`}
                                  title="Remove Resource"
                                  onClick={() =>
                                    setRequestFiles((current) =>
                                      current.filter(
                                        (_, candidateIndex) =>
                                          candidateIndex !== index,
                                      ),
                                    )
                                  }
                                >
                                  <X />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                {requestError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {requestError}
                  </p>
                ) : null}

                <div className="border-t border-border pt-5">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={!decompositionGoal.trim()}
                  >
                    {developmentPreview
                      ? 'Create fixture request'
                      : revisionTarget
                        ? `Send revision to ${AGENT_LABELS[selectedAgent]}`
                        : runOperation === 'append-candidates'
                          ? 'Find additional nodes'
                          : `Send to ${AGENT_LABELS[selectedAgent]}`}
                  </Button>
                  <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">
                    {developmentPreview
                      ? 'Development fixture only. Nothing is sent to an Agent.'
                      : `${AGENT_LABELS[selectedAgent]} runs locally with your existing subscription login.`}
                  </p>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>

      <Sheet
        open={selectedNode !== null || selectedCandidate !== null}
        onOpenChange={(open) => {
          if (!open) setInspectorNodeId('');
        }}
      >
        <SheetContent className="sm:max-w-md">
          {selectedNode ? (
            <>
              <SheetHeader className="border-b border-border px-6 py-6 pr-14">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
                    {selectedNode.id}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                    {selectedNode.type}
                  </span>
                </div>
                <SheetTitle className="text-xl font-semibold tracking-[-0.025em]">
                  {selectedNode.title}
                </SheetTitle>
                <SheetDescription>
                  A captured {selectedNode.role} node and its fixed source
                  boundary.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-3 gap-3">
                  <NodeFact label="Role" value={selectedNode.role} />
                  <NodeFact label="Type" value={selectedNode.type} />
                  <NodeFact label="Status" value={selectedNode.status} />
                </dl>

                {selectedRelationships ? (
                  <section className="mt-7">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Relationships
                    </h3>
                    <div className="mt-3 grid gap-4">
                      <RelationshipList
                        title="Derived from"
                        nodes={selectedRelationships.derivedFrom}
                        onSelect={locateNode}
                      />
                      <RelationshipList
                        title="Depends on"
                        nodes={selectedRelationships.dependsOn}
                        onSelect={locateNode}
                      />
                      <RelationshipList
                        title="Derived nodes"
                        nodes={selectedRelationships.derivedNodes}
                        onSelect={locateNode}
                      />
                      <RelationshipList
                        title="Dependents"
                        nodes={selectedRelationships.dependents}
                        onSelect={locateNode}
                      />
                    </div>
                  </section>
                ) : null}

                <section className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Sources
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedNode.resources.length}
                    </span>
                  </div>
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {selectedNode.resources.map((resource) => (
                      <button
                        key={`${resource.kind}:${resource.path}`}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/50"
                        disabled={previewingPath === resource.path}
                        onClick={() => previewResource(resource.path)}
                      >
                        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
                          <FileText className="size-3.5" />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {previewingPath === resource.path
                              ? 'Opening…'
                              : resourceName(resource.path)}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                            {resource.path}
                          </span>
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {resource.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="mt-7 border-t border-border pt-5">
                  <dl className="space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd>{formatTimestamp(selectedNode.createdAt)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>{formatTimestamp(selectedNode.updatedAt)}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <SheetFooter className="border-t border-border px-6 py-4">
                <div className="flex gap-2">
                  {selectedNode.role === 'start' ? (
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => editNode(selectedNode)}
                    >
                      <Pencil /> Edit start node
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={deletionBlockers.length > 0}
                    title={
                      deletionBlockers.length > 0
                        ? 'Delete the referencing nodes first'
                        : 'Move node to Trash'
                    }
                    onClick={() => {
                      setDeleteError('');
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 /> Delete node
                  </Button>
                </div>
                {deletionBlockers.length > 0 ? (
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Referenced by {deletionBlockers.length}{' '}
                    {deletionBlockers.length === 1 ? 'node' : 'nodes'}. Select
                    them above and delete them first.
                  </p>
                ) : null}
              </SheetFooter>
            </>
          ) : selectedCandidate ? (
            <>
              <SheetHeader className="border-b border-border px-6 py-6 pr-14">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
                    {selectedCandidate.candidateId}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                    Candidate · revision {selectedCandidate.revision}
                  </span>
                </div>
                <SheetTitle className="text-xl font-semibold tracking-[-0.025em]">
                  {selectedCandidate.title}
                </SheetTitle>
                <SheetDescription>{selectedCandidate.summary}</SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-2 gap-3">
                  <NodeFact label="Type" value={selectedCandidate.type} />
                  <NodeFact
                    label="Revision"
                    value={String(selectedCandidate.revision)}
                  />
                </dl>

                {selectedCandidatePreview?.outputPath ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 w-full"
                    disabled={
                      previewingPath === selectedCandidatePreview.outputPath
                    }
                    onClick={() =>
                      previewResource(selectedCandidatePreview.outputPath ?? '')
                    }
                  >
                    <FileText />
                    {previewingPath === selectedCandidatePreview.outputPath
                      ? 'Opening output…'
                      : 'Open output.md'}
                  </Button>
                ) : null}

                <section className="mt-7">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Relationships
                  </h3>
                  <div className="mt-3 grid gap-4">
                    <CandidateRelationshipList
                      title="Derived from"
                      nodeIds={selectedCandidate.derivedFrom}
                      nodes={nodes}
                      previews={requestPreviews}
                      onSelect={locateNode}
                    />
                    <CandidateRelationshipList
                      title="Depends on"
                      nodeIds={selectedCandidate.dependsOn}
                      nodes={nodes}
                      previews={requestPreviews}
                      onSelect={locateNode}
                    />
                  </div>
                </section>

                <section className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Resources
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedCandidate.resources.length}
                    </span>
                  </div>
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {selectedCandidate.resources.map((resource) => (
                      <button
                        key={`${resource.kind}:${resource.path}`}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/50"
                        disabled={previewingPath === resource.path}
                        onClick={() => previewResource(resource.path)}
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {resourceName(resource.path)}
                        </span>
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {resource.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                {selectedCandidate.assumptions.length > 0 ? (
                  <section className="mt-7">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Assumptions
                    </h3>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                      {selectedCandidate.assumptions.map((assumption) => (
                        <li key={assumption}>{assumption}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {Object.keys(selectedCandidate.metadata).length > 0 ? (
                  <section className="mt-7">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Metadata
                    </h3>
                    <pre className="mt-3 overflow-x-auto rounded-xl bg-secondary p-3 text-[10px] leading-4">
                      {JSON.stringify(selectedCandidate.metadata, null, 2)}
                    </pre>
                  </section>
                ) : null}
              </div>
              <SheetFooter className="border-t border-border px-6 py-4">
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={
                      accepting ||
                      discardingCandidate ||
                      selectedCandidateIsRevising
                    }
                    aria-label="Discard Candidate"
                    title="Discard Candidate"
                    onClick={() => setCandidateDeleteOpen(true)}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={
                      accepting ||
                      discardingCandidate ||
                      selectedCandidateIsRevising
                    }
                    onClick={reviseCandidate}
                  >
                    <Pencil /> Revise
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={
                      accepting ||
                      discardingCandidate ||
                      selectedCandidateIsRevising
                    }
                    onClick={acceptCandidate}
                  >
                    {accepting ? 'Accepting…' : 'Accept revision'}
                  </Button>
                </div>
                {selectedCandidateIsRevising ? (
                  <p className="text-[10px] text-muted-foreground">
                    The next revision is running.
                  </p>
                ) : null}
                {candidateActionError ? (
                  <p className="text-[10px] text-destructive">
                    {candidateActionError}
                  </p>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={candidateDeleteOpen}
        onOpenChange={(open) => {
          if (!discardingCandidate) setCandidateDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Discard {selectedCandidate?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This Candidate and its output will move to the operating system
              Trash. Other Candidates from the same proposal stay unchanged.
              {candidateActionError ? (
                <span className="mt-2 block text-destructive">
                  {candidateActionError}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discardingCandidate}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={discardingCandidate}
              onClick={discardCandidate}
            >
              {discardingCandidate ? 'Discarding…' : 'Discard'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {selectedNode?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {developmentPreview
                ? 'This removes the node from the development preview until the page reloads.'
                : 'The node folder will move to the operating system Trash. Its upstream relationships will disappear with it.'}
              {deleteError ? (
                <span className="mt-2 block text-destructive">
                  {deleteError}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={deleteSelectedNode}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-5xl"
        >
          {preview ? (
            <MarkdownReader
              title={preview.title}
              filePath={preview.path}
              markdown={preview.markdown}
              onClose={() => setPreview(null)}
              showFocusButton={false}
              className="min-h-[70vh] border-0 shadow-none"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function runPreview(
  run: TaskDecompositionRunRecord,
  snapshot: RunSnapshot,
  inheritedResourceCount: number,
): DecompositionRequestPreview {
  return {
    id: run.runId,
    sourceNodeId: run.sourceNodeId,
    instruction: snapshot.instruction,
    inheritedResourceCount,
    additionalResourceCount:
      snapshot.contextRefs.length + snapshot.files.length,
    contextRefs: snapshot.contextRefs,
    files: snapshot.files,
    kind: 'run',
    title: `${TRANSPORT_LABELS[run.transport]} decomposition`,
    agentLabel: TRANSPORT_LABELS[run.transport],
    type: 'Running',
    description: snapshot.instruction,
    status: run.status,
    revisionOf: run.revisionOf,
  };
}

function candidateOutputPath(runId: string, candidateId: string) {
  return `task-decomposition/runs/${runId}/candidates/${candidateId}/output.md`;
}

function CandidateRelationshipList({
  title,
  nodeIds,
  nodes,
  previews,
  onSelect,
}: {
  title: string;
  nodeIds: string[];
  nodes: TaskGraphNode[];
  previews: TaskGraphPreview[];
  onSelect: (nodeId: string) => void;
}) {
  const relatedNodes = nodeIds.flatMap((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node) return [node];
    const candidate = previews.find(
      (preview) => preview.id === nodeId && preview.kind === 'candidate',
    );
    return candidate
      ? [{ id: candidate.id, title: candidate.title ?? candidate.id }]
      : [];
  });
  return (
    <RelationshipList title={title} nodes={relatedNodes} onSelect={onSelect} />
  );
}

function RelationshipList({
  title,
  nodes,
  onSelect,
}: {
  title: string;
  nodes: Array<{ id: string; title: string }>;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h4 className="text-[10px] font-medium text-muted-foreground">
          {title}
        </h4>
        <span className="text-[9px] text-muted-foreground">{nodes.length}</span>
      </div>
      {nodes.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50"
              onClick={() => onSelect(node.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">
                  {node.title}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">
                  {node.id}
                </span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[10px] text-muted-foreground">
          None
        </div>
      )}
    </div>
  );
}

function resolveCandidateDependencyIds(
  dependencyIds: string[],
  nodes: TaskGraphNode[],
) {
  return dependencyIds.map((dependencyId) => {
    if (!dependencyId.startsWith('CANDIDATE-')) return dependencyId;
    return (
      nodes.find((node) => node.provenance?.candidateId === dependencyId)?.id ??
      dependencyId
    );
  });
}

function resourceName(resourcePath: string) {
  return resourcePath.split('/').at(-1) ?? resourcePath;
}

function NodeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate text-xs font-medium capitalize">{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}
