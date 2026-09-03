'use client';

import dagre from '@dagrejs/dagre';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Check, CircleEllipsis } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { CanvasNodeCardFrame } from '@/components/canvas-node-card-frame';
import {
  type DerivedDomainRelationship,
  type DomainEntity,
  type DomainModel,
  type DomainRelationship,
} from '@/lib/domain-model';
import {
  deriveDomainRelationships,
  domainModelTopologyKey,
} from '@/lib/domain-model-view';
import { cn } from '@/lib/utils';
import { useUiText } from '@/components/ui-language-provider';

type EntityNodeData = {
  entity: DomainEntity;
  selectedForContext: boolean;
  focused: boolean;
  dimmed: boolean;
  onToggle: (id: string) => void;
  onInspect: (id: string) => void;
};
type EntityFlowNode = Node<EntityNodeData, 'entity'>;
const nodeTypes = { entity: memo(EntityCard) };
const edgeTypes = { domain: memo(DomainEdge) };
const entityNodeWidth = 288;
const entityNodeHeight = 104;

export function DomainModelCanvas({
  model,
  selectedIds,
  focusedId,
  onToggleSelection,
  onFocus,
  onInspectEntity,
  onInspectRelationship,
}: {
  model: DomainModel;
  selectedIds: string[];
  focusedId: string;
  onToggleSelection: (id: string) => void;
  onFocus: (id: string) => void;
  onInspectEntity: (id: string) => void;
  onInspectRelationship: (id: string) => void;
}) {
  const flow = useRef<ReactFlowInstance<EntityFlowNode, Edge> | null>(null);
  const graph = useMemo(
    () =>
      buildGraph(
        model,
        selectedIds,
        focusedId,
        onToggleSelection,
        onInspectEntity,
      ),
    [focusedId, model, onInspectEntity, onToggleSelection, selectedIds],
  );
  const topologyKey = useMemo(() => domainModelTopologyKey(model), [model]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void flow.current?.fitView({ padding: 0.34, minZoom: 0.3, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [topologyKey]);
  return (
    <div className="h-full min-h-[560px] w-full bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--foreground),transparent_98%)_0,transparent_64%)]">
      <ReactFlow<EntityFlowNode, Edge>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.34, minZoom: 0.3, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onInit={(instance) => {
          flow.current = instance;
        }}
        onNodeClick={(_, node) => onFocus(node.id)}
        onEdgeClick={(_, edge) => onInspectRelationship(edge.id)}
        onPaneClick={() => onFocus('')}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        {model.entities.length ? <Controls showInteractive={false} /> : null}
      </ReactFlow>
    </div>
  );
}

type DomainEdgeData = {
  label: string;
  derived: boolean;
  parallelIndex: number;
  parallelCount: number;
};

function DomainEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  markerEnd,
  style,
  data,
}: EdgeProps<Edge<DomainEdgeData>>) {
  const self = source === target;
  const offset = self
    ? -86
    : ((data?.parallelIndex ?? 0) - ((data?.parallelCount ?? 1) - 1) / 2) * 42;
  const path = self
    ? `M ${sourceX} ${sourceY} C ${sourceX + 94} ${sourceY - 118}, ${targetX - 94} ${targetY - 118}, ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} C ${sourceX + (targetX - sourceX) * 0.42} ${sourceY + offset}, ${targetX - (targetX - sourceX) * 0.42} ${targetY + offset}, ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = self
    ? Math.min(sourceY, targetY) - 88
    : (sourceY + targetY) / 2 + offset * 0.76;
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <span
          className="nodrag nopan pointer-events-none absolute rounded-md border border-border bg-background/95 px-1.5 py-0.5 text-[10px] text-foreground shadow-sm"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {data?.label}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}

function EntityCard({ data }: NodeProps<EntityFlowNode>) {
  const { t } = useUiText();
  return (
    <>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <CanvasNodeCardFrame
        density="compact"
        bodyInset
        selected={data.selectedForContext}
        focused={data.focused}
        dimmed={data.dimmed}
        selectionControl={
          <button
            type="button"
            aria-label={t(
              data.selectedForContext
                ? 'Remove {name} from context'
                : 'Add {name} to context',
              { name: data.entity.name },
            )}
            aria-pressed={data.selectedForContext}
            className={cn(
              '-ml-1 mr-1 grid size-4 place-items-center rounded-full border transition',
              data.selectedForContext
                ? 'border-foreground bg-foreground text-background'
                : 'border-muted-foreground/65 bg-background',
            )}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle(data.entity.id);
            }}
          >
            {data.selectedForContext ? <Check className="size-2.5" /> : null}
          </button>
        }
        kindLabel={
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            {t('Entity')}
          </span>
        }
        detailsControl={
          <button
            type="button"
            aria-label={t('Open {name} details', {
              name: data.entity.name,
            })}
            className="relative -mr-1 grid size-4 place-items-center text-muted-foreground after:absolute after:-inset-1 after:content-[''] hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              data.onInspect(data.entity.id);
            }}
          >
            <CircleEllipsis className="size-4" />
          </button>
        }
        title={data.entity.name}
        summary={data.entity.meaning}
        footer={
          <span className="text-[9px] text-muted-foreground">
            {t('{count} fields', {
              count: data.entity.fields.filter(
                (field) => field.display !== 'system',
              ).length,
            })}
          </span>
        }
      />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </>
  );
}

function buildGraph(
  model: DomainModel,
  selectedIds: string[],
  focusedId: string,
  onToggle: (id: string) => void,
  onInspect: (id: string) => void,
) {
  const entities = [...model.entities].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const relationships: Array<DomainRelationship | DerivedDomainRelationship> = [
    ...model.relationships,
    ...deriveDomainRelationships(model),
  ].sort((left, right) =>
    relationshipOrder(left).localeCompare(relationshipOrder(right)),
  );
  const neighbors = new Set<string>();
  if (focusedId)
    for (const item of relationships)
      if (item.sourceEntityId === focusedId) neighbors.add(item.targetEntityId);
      else if (item.targetEntityId === focusedId)
        neighbors.add(item.sourceEntityId);
  const selected = new Set(selectedIds);
  const dagreGraph = new dagre.graphlib.Graph({ multigraph: true });
  dagreGraph.setGraph({
    rankdir: 'LR',
    nodesep: 70,
    ranksep: 130,
    marginx: 30,
    marginy: 30,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  for (const entity of entities)
    dagreGraph.setNode(entity.id, {
      width: entityNodeWidth,
      height: entityNodeHeight,
    });
  for (const item of relationships)
    if (item.sourceEntityId !== item.targetEntityId)
      dagreGraph.setEdge(item.sourceEntityId, item.targetEntityId, {}, item.id);
  dagre.layout(dagreGraph);
  const nodes: EntityFlowNode[] = entities.map((entity) => {
    const position = dagreGraph.node(entity.id) ?? { x: 0, y: 0 };
    return {
      id: entity.id,
      type: 'entity',
      position: {
        x: position.x - entityNodeWidth / 2,
        y: position.y - entityNodeHeight / 2,
      },
      initialWidth: entityNodeWidth,
      initialHeight: entityNodeHeight,
      data: {
        entity,
        selectedForContext: selected.has(entity.id),
        focused: focusedId === entity.id,
        dimmed: Boolean(
          focusedId && focusedId !== entity.id && !neighbors.has(entity.id),
        ),
        onToggle,
        onInspect,
      },
    };
  });
  const edges: Edge[] = relationships.map((item) => {
    const derived = item.provenance === 'derived';
    const dimmed = Boolean(
      focusedId &&
      item.sourceEntityId !== focusedId &&
      item.targetEntityId !== focusedId,
    );
    const parallel = relationships.filter(
      (candidate) =>
        candidate.sourceEntityId === item.sourceEntityId &&
        candidate.targetEntityId === item.targetEntityId,
    );
    return {
      id: item.id,
      source: item.sourceEntityId,
      target: item.targetEntityId,
      type: 'domain',
      data: {
        label: item.label,
        derived,
        parallelIndex: parallel.findIndex(
          (candidate) => candidate.id === item.id,
        ),
        parallelCount: parallel.length,
      } satisfies DomainEdgeData,
      markerEnd:
        item.direction === 'directed'
          ? { type: MarkerType.ArrowClosed, width: 16, height: 16 }
          : undefined,
      style: {
        stroke: 'var(--muted-foreground)',
        strokeWidth: 1.4,
        strokeDasharray: derived ? '5 4' : undefined,
        opacity: dimmed ? 0.22 : 0.8,
      },
    };
  });
  return { nodes, edges };
}

function relationshipOrder(
  relationship: DomainRelationship | DerivedDomainRelationship,
) {
  return `${relationship.sourceEntityId}:${relationship.targetEntityId}:${relationship.semanticRole}:${relationship.id}`;
}
