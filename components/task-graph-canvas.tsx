'use client';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { graphFocus, directDependencyCount } from '@/lib/task-graph-focus';
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
import {
  GraphNodeCard,
  type GraphNodeCardData,
} from '@/components/graph-node-card';
import { cardResourceCounts } from '@/lib/task-graph-resources';
import type { TaskGraphNode } from '@/lib/task-graph';
import {
  buildTaskGraphLayout,
  TASK_GRAPH_NODE_MIN_HEIGHT,
  type TaskGraphPreview,
} from '@/lib/task-graph-layout';

type TaskFlowNode = Node<GraphNodeCardData, 'task'>;

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
  readOnly = false,
  selectionEnabled = false,
  onMultiSelect,
  onToggleSelection,
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
  readOnly?: boolean;
  selectionEnabled?: boolean;
  onMultiSelect?: (nodeId: string) => void;
  onToggleSelection?: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onInspectNode: (nodeId: string) => void;
  onSelectPreview: (previewId: string) => void;
  onDecompose: (nodeId: string) => void;
  onCancelRun: (runId: string) => void;
}) {
  const { t } = useUiText();
  const [dependencyFocusId, setDependencyFocusId] = useState('');
  const focusDependencies = useCallback(
    (id: string) => {
      setDependencyFocusId(id);
      onFocusNode(id);
    },
    [onFocusNode],
  );
  const dependenciesOnly = Boolean(
    dependencyFocusId && dependencyFocusId === focusedNodeId,
  );
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
        focusDependencies,
        dependenciesOnly,
        selectionKey ? selectionKey.split(',') : [],
        plusLabel,
        readOnly,
        selectionEnabled,
        onToggleSelection,
      ),
    [
      focusedNodeId,
      focusDependencies,
      dependenciesOnly,
      nodes,
      onCancelRun,
      onDecompose,
      onInspectNode,
      plusLabel,
      previews,
      selectionKey,
      readOnly,
      selectionEnabled,
      onToggleSelection,
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
    const height = node.measured?.height ?? TASK_GRAPH_NODE_MIN_HEIGHT;
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
        setDependencyFocusId('');
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
      onPaneClick={() => {
        setDependencyFocusId('');
        onFocusNode('');
      }}
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
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        id="lineage-target"
        className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
      />
      <GraphNodeCard data={data} selected={selected} />
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
  onFocusDependencies: (nodeId: string) => void,
  dependenciesOnly: boolean,
  selectedNodeIds: string[] = [],
  plusLabel?: string,
  readOnly = false,
  selectionEnabled = false,
  onToggleSelection?: (nodeId: string) => void,
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
  const focus = graphFocus(layout.edges, focusedNodeId, dependenciesOnly);
  const relatedIds = focus.nodeIds;
  const flowNodes: TaskFlowNode[] = layout.nodes.map((layoutNode) => {
    const node = nodeById.get(layoutNode.id);
    const preview = previewById.get(layoutNode.id);
    return {
      id: layoutNode.uid,
      selected: layoutNode.id === focusedNodeId,
      type: 'task',
      position: { x: layoutNode.x, y: layoutNode.y },
      width: 288,
      height: TASK_GRAPH_NODE_MIN_HEIGHT,
      initialWidth: 288,
      initialHeight: TASK_GRAPH_NODE_MIN_HEIGHT,
      draggable: false,
      deletable: false,
      zIndex: 20,
      style: {
        opacity: focusedNodeId && !relatedIds.has(layoutNode.id) ? 0.18 : 1,
        transition: 'opacity 180ms ease',
      },
      data: {
        readOnly,
        displayId: layoutNode.id,
        kind: layoutNode.kind,
        title: node?.title ?? preview?.title ?? 'Decomposition request',
        type: node?.type ?? preview?.type ?? 'Preview',
        ...cardResourceCounts(node, preview),
        relationshipCount: directDependencyCount(layout.edges, layoutNode.id),
        dependenciesFocused:
          dependenciesOnly && layoutNode.id === focusedNodeId,
        onFocusDependencies,
        description:
          node?.summary ?? preview?.description ?? preview?.instruction,
        transientKind: preview?.kind ?? 'request',
        status: preview?.status,
        agentLabel: preview?.agentLabel,
        runId: preview?.runId,
        revision: preview?.candidate?.revision,
        color:
          node?.presentation?.color ??
          (layoutNode.kind === 'preview'
            ? transientColor(preview)
            : nodeTypeColor(node?.type ?? 'node')),
        selectedForRun: selectedIds.has(layoutNode.id),
        selectionEnabled: selectionEnabled && layoutNode.kind === 'formal',
        plusLabel,
        onToggleSelection: onToggleSelection ?? (() => {}),
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
    const related = !focusedNodeId || focus.edgeIds.has(edge.id);
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
            ? 'var(--graph-candidate)'
            : edge.relation === 'dependency'
              ? 'var(--graph-dependency)'
              : 'var(--muted-foreground)',
      },
      style: {
        stroke:
          edge.relation === 'request'
            ? 'var(--graph-candidate)'
            : edge.relation === 'dependency'
              ? 'var(--graph-dependency)'
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

function nodeTypeColor(type: string) {
  let hash = 0;
  for (const character of type) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 55% 48%)`;
}

function transientColor(preview: TaskGraphPreview | undefined) {
  if (preview?.kind === 'run') return 'var(--graph-running)';
  if (preview?.kind === 'outcome') {
    return preview.status === 'failed'
      ? 'var(--graph-error)'
      : 'var(--graph-dependency)';
  }
  return 'var(--graph-candidate)';
}
