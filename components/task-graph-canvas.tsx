'use client';
import { useUiText } from '@/components/ui-language-provider';

import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileText, GitFork, Info, LoaderCircle, Plus, X } from 'lucide-react';
import type { TaskGraphNode } from '@/lib/task-graph';
import {
  buildTaskGraphLayout,
  type TaskGraphPreview,
} from '@/lib/task-graph-layout';
import { cn } from '@/lib/utils';
import { graphCardLabel } from '@/lib/graph-identity';

type TaskCardData = Record<string, unknown> & {
  displayId: string;
  kind: 'formal' | 'preview';
  title: string;
  type: string;
  resources: TaskGraphNode['resources'];
  color: string;
  description?: string;
  resourceSummary?: string;
  candidateRevision?: number;
  candidateResourceCount?: number;
  transientKind?: TaskGraphPreview['kind'];
  status?: string;
  agentLabel?: string;
  runId?: string;
  relationshipCount: number;
  selectedForRun?: boolean;
  plusLabel?: string;
  onDecompose: (nodeId: string) => void;
  onInspect: (nodeId: string) => void;
  onCancelRun: (runId: string) => void;
};

type TaskFlowNode = Node<TaskCardData, 'task'>;

const nodeTypes = { task: memo(TaskCard) };
const defaultFitViewOptions = {
  padding: 0.3,
  minZoom: 0.25,
  maxZoom: 1,
};

export function TaskGraphCanvas({
  nodes,
  previews,
  focusedNodeId,
  locateRequest,
  selectedNodeIds,
  plusLabel,
  edgeAlignedOverlays = false,
  onMultiSelect,
  onFocusNode,
  onInspectNode,
  onSelectPreview,
  onDecompose,
  onCancelRun,
}: {
  nodes: TaskGraphNode[];
  previews: TaskGraphPreview[];
  focusedNodeId: string;
  locateRequest: { nodeId: string; sequence: number } | null;
  selectedNodeIds?: string[];
  plusLabel?: string;
  edgeAlignedOverlays?: boolean;
  onMultiSelect?: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onInspectNode: (nodeId: string) => void;
  onSelectPreview: (previewId: string) => void;
  onDecompose: (nodeId: string) => void;
  onCancelRun: (runId: string) => void;
}) {
  const { t } = useUiText();
  const selectionKey = (selectedNodeIds ?? []).join(',');
  const graph = useMemo(
    () =>
      buildFlowGraph(
        nodes,
        previews,
        focusedNodeId,
        onDecompose,
        onInspectNode,
        onCancelRun,
        selectionKey ? selectionKey.split(',') : [],
        plusLabel,
      ),
    [
      focusedNodeId,
      nodes,
      onCancelRun,
      onDecompose,
      onInspectNode,
      plusLabel,
      previews,
      selectionKey,
    ],
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(graph.nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(graph.edges);
  const internalsKey = previews
    .map((preview) =>
      [preview.id, preview.kind, preview.status, preview.runId].join(':'),
    )
    .sort()
    .join('|');
  const graphNodeIdsKey = graph.nodes.map((node) => node.id).join('|');
  const flowInstance = useRef<ReactFlowInstance<TaskFlowNode, Edge> | null>(
    null,
  );

  useEffect(() => {
    setFlowNodes(graph.nodes);
    setFlowEdges(graph.edges);
  }, [focusedNodeId, graph, setFlowEdges, setFlowNodes]);

  useEffect(() => {
    if (!locateRequest || !flowInstance.current) return;
    const instance = flowInstance.current;
    const node = instance
      .getNodes()
      .find((entry) => entry.data.displayId === locateRequest.nodeId);
    if (!node) return;
    const width = node.measured?.width ?? 288;
    const height = node.measured?.height ?? 156;
    void instance.setCenter(
      node.position.x + width / 2,
      node.position.y + height / 2,
      {
        duration: 350,
        zoom: Math.max(instance.getZoom(), 0.65),
      },
    );
  }, [locateRequest]);

  return (
    <ReactFlow<TaskFlowNode, Edge>
      ariaLabelConfig={{
        'controls.zoomIn.ariaLabel': t('Zoom In'),
        'controls.zoomOut.ariaLabel': t('Zoom Out'),
        'controls.fitView.ariaLabel': t('Fit View'),
      }}
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onInit={(instance) => {
        flowInstance.current = instance;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void instance.fitView(defaultFitViewOptions);
          });
        });
      }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(event, node) => {
        if (
          onMultiSelect &&
          node.data.kind === 'formal' &&
          (event.ctrlKey || event.metaKey)
        ) {
          onMultiSelect(node.data.displayId);
          return;
        }
        if (
          node.data.kind === 'preview' &&
          node.data.transientKind === 'request'
        ) {
          onSelectPreview(node.data.displayId);
        } else onFocusNode(node.id);
      }}
      onPaneClick={() => onFocusNode('')}
      nodesDraggable={false}
      minZoom={0.2}
      maxZoom={1.8}
      fitView
      fitViewOptions={defaultFitViewOptions}
      nodesConnectable={false}
      deleteKeyCode={null}
      className="bg-background"
      aria-label={t('Graph canvas')}
    >
      <GraphInternalsUpdater
        nodeIdsKey={graphNodeIdsKey}
        revisionKey={internalsKey}
      />
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="var(--border)"
      />
      <Panel
        position="bottom-right"
        className={cn(
          '!m-3 flex items-center gap-3 rounded-lg border border-border bg-background/90 px-2.5 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur',
          edgeAlignedOverlays ? '!-bottom-2' : '!bottom-5',
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-px w-5 bg-muted-foreground" />
          {t('Lineage')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t border-dashed border-amber-600" />
          {t('Selected dependencies')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t-2 border-dashed border-violet-500" />
          {t('Candidate')}
        </span>
      </Panel>
      <Controls
        showInteractive={false}
        className={cn(
          '!overflow-hidden !rounded-xl !border !border-border !bg-background !shadow-sm [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground hover:[&>button]:!bg-secondary',
          edgeAlignedOverlays ? '!-bottom-2' : '!bottom-5',
        )}
      />
    </ReactFlow>
  );
}

function GraphInternalsUpdater({
  nodeIdsKey,
  revisionKey,
}: {
  nodeIdsKey: string;
  revisionKey: string;
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      updateNodeInternals(nodeIdsKey.split('|')),
    );
    return () => cancelAnimationFrame(frame);
  }, [nodeIdsKey, revisionKey, updateNodeInternals]);
  return null;
}

function TaskCard({ data, selected }: NodeProps<TaskFlowNode>) {
  const { t } = useUiText();
  const id = data.displayId;
  const preview = data.kind === 'preview';
  const running = data.transientKind === 'run';
  return (
    <div
      className={cn(
        'group relative min-h-[156px] w-72 rounded-2xl border border-t-[3px] bg-background p-4 text-left shadow-[0_10px_30px_rgb(15_23_42/6%)] transition',
        selected && 'ring-3 ring-ring/20',
        data.selectedForRun && 'ring-3 ring-violet-500/45',
        preview && 'border-dashed bg-secondary/35',
      )}
      style={
        running
          ? { borderColor: data.color, borderWidth: 2 }
          : { borderTopColor: preview ? data.color : 'var(--foreground)' }
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id="lineage-target"
        className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-center justify-between gap-3">
        <span
          className="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium tracking-wide text-muted-foreground"
          title={id}
          aria-label={id}
        >
          {graphCardLabel(id)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {!preview && data.relationshipCount > 0 ? (
            <span
              className="flex items-center gap-1 text-[9px] text-muted-foreground"
              title={`${data.relationshipCount} direct relationships`}
            >
              <GitFork className="size-3" />
              {data.relationshipCount}
            </span>
          ) : null}
          <span
            className={cn(
              'truncate rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
              preview
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-foreground text-background',
            )}
            title={running ? t('Running') : data.type}
            style={
              preview
                ? {
                    backgroundColor: `color-mix(in srgb, ${data.color} 12%, transparent)`,
                    color: data.color,
                  }
                : undefined
            }
          >
            {running ? t('Running') : data.type}
          </span>
          {running ? (
            <button
              type="button"
              className="nodrag nopan grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              aria-label={t('Cancel Agent Run')}
              title={t('Cancel Agent Run')}
              onClick={(event) => {
                event.stopPropagation();
                data.onCancelRun(data.runId ?? id);
              }}
            >
              <X className="size-4" />
            </button>
          ) : null}
          {!preview || data.transientKind === 'candidate' ? (
            <button
              type="button"
              className="nodrag nopan grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              aria-label={t('Open details for {title}', { title: data.title })}
              title={t('Open details')}
              onClick={(event) => {
                event.stopPropagation();
                data.onInspect(id);
              }}
            >
              <Info className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
      <h2 className="mt-4 line-clamp-3 text-sm font-semibold leading-5">
        {data.title}
      </h2>
      {preview ? (
        <div className="mt-2">
          <p className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">
            {data.description}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {running ? (
              <span className="flex items-center gap-1.5">
                <LoaderCircle className="size-3 animate-spin" />
                {data.agentLabel ?? data.title.split(' ')[0] ?? 'Agent'}{' '}
                {t('is working…')}
              </span>
            ) : data.candidateRevision !== undefined ? (
              t('Revision {revision} · {count} Resources', {
                revision: data.candidateRevision,
                count: data.candidateResourceCount ?? 0,
              })
            ) : (
              data.resourceSummary
            )}
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-1.5">
          {data.resources.slice(0, 3).map((resource) => (
            <span
              key={`${resource.kind}:${resource.path}`}
              className="flex max-w-full items-center gap-1.5 px-1.5 py-1 text-[11px] text-muted-foreground"
            >
              <FileText className="size-3 shrink-0" />
              <span className="truncate">{resourceName(resource.path)}</span>
            </span>
          ))}
          {data.resources.length > 3 ? (
            <span className="px-1.5 text-[10px] text-muted-foreground">
              +{data.resources.length - 3} {t('more')}
            </span>
          ) : null}
        </div>
      )}
      {!preview ? (
        <button
          type="button"
          className={cn(
            'nodrag nopan absolute top-1/2 -right-4 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-foreground text-background shadow-md transition hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
            selected
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          aria-label={t('{action} from {title}', {
            action: t(data.plusLabel ?? 'Decompose'),
            title: data.title,
          })}
          title={t(data.plusLabel ?? 'Decompose')}
          onClick={(event) => {
            event.stopPropagation();
            data.onDecompose(id);
          }}
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id="lineage-source"
        className="!size-2.5 !border-2 !border-background !bg-foreground"
      />
    </div>
  );
}

function buildFlowGraph(
  nodes: TaskGraphNode[],
  previews: TaskGraphPreview[],
  requestedFocusId: string,
  onDecompose: (nodeId: string) => void,
  onInspect: (nodeId: string) => void,
  onCancelRun: (runId: string) => void,
  selectedNodeIds: string[] = [],
  plusLabel?: string,
) {
  const layout = buildTaskGraphLayout(nodes, previews);
  const focusedNodeId =
    layout.nodes.find(
      (entry) =>
        entry.id === requestedFocusId ||
        entry.uid === requestedFocusId ||
        nodes.find((node) => node.id === entry.id)?.provenance?.candidateId ===
          requestedFocusId,
    )?.id ?? '';
  const selectedIds = new Set(selectedNodeIds);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const previewById = new Map(previews.map((preview) => [preview.id, preview]));
  const uidById = new Map(layout.nodes.map((node) => [node.id, node.uid]));
  const focusedEdges = focusedNodeId
    ? layout.edges.filter(
        (edge) =>
          edge.source === focusedNodeId || edge.target === focusedNodeId,
      )
    : [];
  const relatedIds = new Set([
    focusedNodeId,
    ...focusedEdges.flatMap((edge) => [edge.source, edge.target]),
  ]);
  const flowNodes: TaskFlowNode[] = layout.nodes.map((layoutNode) => {
    const node = nodeById.get(layoutNode.id);
    const preview = previewById.get(layoutNode.id);
    return {
      id: layoutNode.uid,
      selected: layoutNode.id === focusedNodeId,
      type: 'task',
      position: { x: layoutNode.x, y: layoutNode.y },
      width: 288,
      height: 156,
      initialWidth: 288,
      initialHeight: 156,
      draggable: false,
      deletable: false,
      zIndex: 20,
      style: {
        opacity: focusedNodeId && !relatedIds.has(layoutNode.id) ? 0.18 : 1,
        transition: 'opacity 180ms ease',
      },
      data: {
        displayId: layoutNode.id,
        kind: layoutNode.kind,
        title: node?.title ?? preview?.title ?? 'Decomposition request',
        type: node?.type ?? preview?.type ?? 'Preview',
        resources: node?.resources ?? [],
        relationshipCount: node
          ? node.dependsOn.length +
            nodes.filter((candidate) => candidate.dependsOn.includes(node.id))
              .length
          : 0,
        description: preview?.description ?? preview?.instruction,
        transientKind: preview?.kind ?? 'request',
        status: preview?.status,
        agentLabel: preview?.agentLabel,
        runId: preview?.runId,
        candidateRevision: preview?.candidate?.revision,
        candidateResourceCount: preview?.candidate?.resources.length,
        resourceSummary: preview
          ? preview.kind === 'candidate' && preview.candidate
            ? `Revision ${preview.candidate.revision} · ${preview.candidate.resources.length} Resources`
            : `${preview.inheritedResourceCount} inherited · ${preview.additionalResourceCount} added`
          : undefined,
        color:
          node?.presentation?.color ??
          (layoutNode.kind === 'preview'
            ? transientColor(preview)
            : nodeTypeColor(node?.type ?? 'node')),
        selectedForRun: selectedIds.has(layoutNode.id),
        plusLabel,
        onDecompose,
        onInspect,
        onCancelRun,
      },
    };
  });
  const visibleEdges = layout.edges.filter(
    (edge) =>
      edge.relation !== 'dependency' ||
      (focusedNodeId &&
        (edge.source === focusedNodeId || edge.target === focusedNodeId)),
  );
  const edges: Edge[] = visibleEdges.map((edge) => {
    const related =
      !focusedNodeId ||
      edge.source === focusedNodeId ||
      edge.target === focusedNodeId;
    return {
      id: `${edge.relation === 'dependency' ? 'depends' : 'derived'}:${uidById.get(edge.source)}:${uidById.get(edge.target)}`,
      source: uidById.get(edge.source)!,
      target: uidById.get(edge.target)!,
      sourceHandle: 'lineage-source',
      targetHandle: 'lineage-target',
      type: 'default',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color:
          edge.relation === 'request'
            ? '#8b5cf6'
            : edge.relation === 'dependency'
              ? '#d97706'
              : 'var(--muted-foreground)',
      },
      style: {
        stroke:
          edge.relation === 'request'
            ? '#8b5cf6'
            : edge.relation === 'dependency'
              ? '#d97706'
              : 'var(--muted-foreground)',
        strokeWidth: 1.5,
        opacity: related ? 1 : 0.1,
        transition: 'opacity 180ms ease',
        strokeDasharray:
          edge.relation === 'request'
            ? '7 6'
            : edge.relation === 'dependency'
              ? '4 5'
              : undefined,
      },
      selectable: false,
      deletable: false,
      zIndex: edge.relation === 'dependency' ? 10 : related ? 2 : 0,
    };
  });
  return { nodes: flowNodes, edges };
}

function resourceName(resourcePath: string) {
  return resourcePath.split('/').at(-1) ?? resourcePath;
}

function nodeTypeColor(type: string) {
  let hash = 0;
  for (const character of type) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 55% 48%)`;
}

function transientColor(preview: TaskGraphPreview | undefined) {
  if (preview?.kind === 'run') return '#2563eb';
  if (preview?.kind === 'outcome') {
    return preview.status === 'failed' ? '#dc2626' : '#d97706';
  }
  return '#8b5cf6';
}
