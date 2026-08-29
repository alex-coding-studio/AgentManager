'use client';

import { memo, useEffect, useMemo } from 'react';
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
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileText, GitFork, Info, Plus } from 'lucide-react';
import type { TaskGraphNode } from '@/lib/task-graph';
import {
  buildTaskGraphLayout,
  type TaskGraphPreview,
} from '@/lib/task-graph-layout';
import { cn } from '@/lib/utils';

type TaskCardData = Record<string, unknown> & {
  kind: 'formal' | 'preview';
  title: string;
  type: string;
  resources: TaskGraphNode['resources'];
  color: string;
  description?: string;
  resourceSummary?: string;
  relationshipCount: number;
  onDecompose: (nodeId: string) => void;
  onInspect: (nodeId: string) => void;
};

type TaskFlowNode = Node<TaskCardData, 'task'>;

const nodeTypes = { task: memo(TaskCard) };

export function TaskGraphCanvas({
  nodes,
  previews,
  focusedNodeId,
  onFocusNode,
  onInspectNode,
  onSelectPreview,
  onDecompose,
}: {
  nodes: TaskGraphNode[];
  previews: TaskGraphPreview[];
  focusedNodeId: string;
  onFocusNode: (nodeId: string) => void;
  onInspectNode: (nodeId: string) => void;
  onSelectPreview: (previewId: string) => void;
  onDecompose: (nodeId: string) => void;
}) {
  const graph = useMemo(
    () =>
      buildFlowGraph(
        nodes,
        previews,
        focusedNodeId,
        onDecompose,
        onInspectNode,
      ),
    [focusedNodeId, nodes, onDecompose, onInspectNode, previews],
  );
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(graph.nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setFlowNodes(
      graph.nodes.map((node) => ({
        ...node,
        selected: node.id === focusedNodeId,
      })),
    );
    setFlowEdges(graph.edges);
  }, [focusedNodeId, graph, setFlowEdges, setFlowNodes]);

  return (
    <ReactFlow<TaskFlowNode, Edge>
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        if (node.data.kind === 'preview') onSelectPreview(node.id);
        else onFocusNode(node.id);
      }}
      onPaneClick={() => onFocusNode('')}
      nodesDraggable={false}
      minZoom={0.2}
      maxZoom={1.8}
      fitView
      fitViewOptions={{ padding: 0.35, minZoom: 0.55, maxZoom: 1 }}
      nodesConnectable={false}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
      className="bg-background"
      aria-label="Task graph canvas"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="var(--border)"
      />
      <Panel
        position="bottom-right"
        className="!m-3 flex items-center gap-3 rounded-lg border border-border bg-background/90 px-2.5 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-px w-5 bg-muted-foreground" />
          Lineage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 border-t border-dashed border-amber-600" />
          Selected dependencies
        </span>
      </Panel>
      <Controls
        showInteractive={false}
        className="!overflow-hidden !rounded-xl !border !border-border !bg-background !shadow-sm [&>button]:!border-border [&>button]:!bg-background [&>button]:!fill-foreground hover:[&>button]:!bg-secondary"
      />
    </ReactFlow>
  );
}

function TaskCard({ id, data, selected }: NodeProps<TaskFlowNode>) {
  const preview = data.kind === 'preview';
  return (
    <div
      className={cn(
        'group relative min-h-[156px] w-72 rounded-2xl border border-t-[3px] bg-background p-4 text-left shadow-[0_10px_30px_rgb(15_23_42/6%)] transition',
        selected && 'ring-3 ring-ring/20',
        preview && 'border-dashed bg-secondary/35',
      )}
      style={{ borderTopColor: data.color }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="lineage-target"
        className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
          {id}
        </span>
        <span className="flex items-center gap-1.5">
          {!preview && data.relationshipCount > 0 ? (
            <span
              className="flex items-center gap-1 text-[9px] text-muted-foreground"
              title={`${data.relationshipCount} direct relationships`}
            >
              <GitFork className="size-3" />
              {data.relationshipCount}
            </span>
          ) : null}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
            {preview ? 'Preview' : data.type}
          </span>
          {!preview ? (
            <button
              type="button"
              className="nodrag nopan grid size-6 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              aria-label={`Open details for ${data.title}`}
              title="Open details"
              onClick={(event) => {
                event.stopPropagation();
                data.onInspect(id);
              }}
            >
              <Info className="size-3.5" />
            </button>
          ) : null}
        </span>
      </div>
      <h2 className="mt-4 text-sm font-semibold leading-5">{data.title}</h2>
      {preview ? (
        <div className="mt-2">
          <p className="line-clamp-2 text-[11px] leading-5 text-muted-foreground">
            {data.description}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {data.resourceSummary}
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
              +{data.resources.length - 3} more
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
          aria-label={`Decompose ${data.title}`}
          title="Decompose from this node"
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
  focusedNodeId: string,
  onDecompose: (nodeId: string) => void,
  onInspect: (nodeId: string) => void,
) {
  const layout = buildTaskGraphLayout(nodes, previews);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const previewById = new Map(previews.map((preview) => [preview.id, preview]));
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
      id: layoutNode.id,
      type: 'task',
      position: { x: layoutNode.x, y: layoutNode.y },
      draggable: false,
      deletable: false,
      style: {
        opacity: focusedNodeId && !relatedIds.has(layoutNode.id) ? 0.18 : 1,
        transition: 'opacity 180ms ease',
      },
      data: {
        kind: layoutNode.kind,
        title: node?.title ?? 'Decomposition request',
        type: node?.type ?? 'request',
        resources: node?.resources ?? [],
        relationshipCount: node
          ? node.dependsOn.length +
            nodes.filter((candidate) => candidate.dependsOn.includes(node.id))
              .length
          : 0,
        description: preview?.instruction,
        resourceSummary: preview
          ? `${preview.inheritedResourceCount} inherited · ${preview.additionalResourceCount} added`
          : undefined,
        color:
          node?.presentation?.color ??
          (layoutNode.kind === 'preview'
            ? '#8b5cf6'
            : nodeTypeColor(node?.type ?? 'node')),
        onDecompose,
        onInspect,
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
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: 'lineage-source',
      targetHandle: 'lineage-target',
      type: 'bezier',
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
