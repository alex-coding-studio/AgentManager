'use client';

import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import type { TaskGraphNode } from '@/lib/graph/task/model';
import { cn } from '@/lib/utils';

const width = 216;
const height = 112;
const nodeTypes = { productDesign: ProductDesignPickerCard };
const fitOptions = { padding: 0.2, minZoom: 0.3, maxZoom: 1 };

type PickerNode = Node<
  {
    node: TaskGraphNode;
    state: 'source' | 'added' | 'selected' | 'available';
    hasIncomingConnection: boolean;
    hasOutgoingConnection: boolean;
    onToggle: (uid: string) => void;
  },
  'productDesign'
>;

export function ProductDesignFeaturePicker({
  open,
  onOpenChange,
  nodes,
  existingUids,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: TaskGraphNode[];
  existingUids: string[];
  onConfirm: (uids: string[]) => void;
}) {
  const { t } = useUiText();
  const [draft, setDraft] = useState<string[]>([]);
  const [geometryRevision, setGeometryRevision] = useState(0);
  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) setDraft([]);
    onOpenChange(nextOpen);
  }
  const graph = useMemo(
    () =>
      buildPickerGraph(nodes, existingUids, draft, (uid) =>
        setDraft((current) =>
          current.includes(uid)
            ? current.filter((candidate) => candidate !== uid)
            : [...current, uid],
        ),
      ),
    [nodes, existingUids, draft],
  );
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="flex h-[min(820px,90dvh)] w-[calc(100vw-2rem)] max-w-[1240px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1240px]"
        onAnimationEnd={(event) => {
          if (open && event.currentTarget === event.target)
            setGeometryRevision((current) => current + 1);
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pr-14 pb-4">
          <DialogTitle>{t('Add Product Design Feature')}</DialogTitle>
          <DialogDescription>
            {t(
              'Choose accepted Product Design Features as the Main Context for this Delivery Map.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="relative min-h-[320px] flex-1">
          <ReactFlow<PickerNode, Edge>
            key={graph.nodes.map((node) => node.id).join('|')}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            deleteKeyCode={null}
            minZoom={0.2}
            maxZoom={1.6}
            fitView
            fitViewOptions={fitOptions}
            onInit={(instance) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => void instance.fitView(fitOptions)),
              );
            }}
            ariaLabelConfig={{
              'controls.zoomIn.ariaLabel': t('Zoom In'),
              'controls.zoomOut.ariaLabel': t('Zoom Out'),
              'controls.fitView.ariaLabel': t('Fit View'),
            }}
          >
            <PickerGraphInternalsUpdater
              nodeIdsKey={graph.nodes.map((node) => node.id).join('|')}
              revision={geometryRevision}
            />
            <Background gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-border px-5 py-4">
          <span className="text-xs text-muted-foreground">
            {draft.length} {t('selected')}
          </span>
          <Button
            className="ml-auto"
            variant="outline"
            onClick={() => changeOpen(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            disabled={draft.length === 0}
            onClick={() => {
              onConfirm(draft);
              changeOpen(false);
            }}
          >
            {t('Add selected Features')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function PickerGraphInternalsUpdater({
  nodeIdsKey,
  revision,
}: {
  nodeIdsKey: string;
  revision: number;
}) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() =>
        updateNodeInternals(nodeIdsKey.split('|')),
      );
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [nodeIdsKey, revision, updateNodeInternals]);
  return null;
}

function ProductDesignPickerCard({ data }: NodeProps<PickerNode>) {
  const { t } = useUiText();
  const selectable = data.state === 'available' || data.state === 'selected';
  const selected = data.state === 'selected';
  const added = data.state === 'added';
  const content = (
    <>
      <span className="flex min-h-0 flex-1 items-start gap-2 overflow-hidden">
        {data.state !== 'source' ? (
          <span
            className={cn(
              'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
              selected || added
                ? 'border-foreground bg-foreground text-background'
                : 'border-muted-foreground/50',
            )}
          >
            {selected || added ? <Check className="size-2.5" /> : null}
          </span>
        ) : null}
        <span className="min-w-0 overflow-hidden">
          <span className="block max-h-[18px] overflow-hidden text-[13px] font-medium leading-[18px]">
            {data.node.title}
          </span>
          <span className="mt-1 line-clamp-2 block max-h-8 overflow-hidden text-[10px] leading-4 text-muted-foreground">
            {data.node.summary}
          </span>
        </span>
      </span>
      <span className="mt-1.5 flex shrink-0 items-center justify-between text-[9px] text-muted-foreground">
        <span>
          {t(
            data.state === 'source'
              ? 'Product Source'
              : 'Product Design Feature',
          )}
        </span>
        <span className="font-mono">Node-{data.node.id.slice(5)}</span>
      </span>
    </>
  );
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={cn(
          '!size-1.5 !border-0',
          data.hasIncomingConnection
            ? '!bg-muted-foreground'
            : '!bg-transparent !opacity-0',
        )}
      />
      {data.state !== 'source' && data.node.uid ? (
        <button
          type="button"
          disabled={!selectable}
          aria-pressed={selected}
          aria-label={`${t(selected ? 'Remove' : data.state === 'added' ? 'Already added' : 'Add')} ${data.node.title}`}
          className={cn(
            'nodrag nopan pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm transition enabled:hover:border-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
            selected && 'border-foreground ring-1 ring-foreground/20',
            added && 'border-border bg-muted/60 text-foreground',
          )}
          onClick={() => data.onToggle(data.node.uid!)}
        >
          {content}
        </button>
      ) : (
        <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-left shadow-sm">
          {content}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={cn(
          '!size-1.5 !border-0',
          data.hasOutgoingConnection
            ? '!bg-muted-foreground'
            : '!bg-transparent !opacity-0',
        )}
      />
    </>
  );
}

function buildPickerGraph(
  nodes: TaskGraphNode[],
  existingUids: string[],
  draftUids: string[],
  onToggle: (uid: string) => void,
) {
  const sources = nodes.filter((node) => node.role === 'start');
  const features = nodes.filter(
    (node) =>
      node.role === 'node' &&
      node.status === 'accepted' &&
      node.layer === 'product-design' &&
      node.artifactKind === 'feature',
  );
  const visible = [...sources, ...features];
  const ids = new Set(visible.map((node) => node.id));
  const sourceId = sources[0]?.id;
  const edges = features.flatMap((feature) => {
    const origins = (feature.derivedFrom ?? []).filter((id) => ids.has(id));
    const parents = origins.length ? origins : sourceId ? [sourceId] : [];
    return parents.map((parent) => ({
      id: `product-design:${parent}:${feature.id}`,
      source: parent,
      target: feature.id,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.2 },
    }));
  });
  const layout = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({
      rankdir: 'LR',
      ranksep: 84,
      nodesep: 24,
      marginx: 32,
      marginy: 32,
    });
  for (const node of visible) layout.setNode(node.id, { width, height });
  for (const edge of edges) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);
  const incomingNodeIds = new Set(edges.map((edge) => edge.target));
  const outgoingNodeIds = new Set(edges.map((edge) => edge.source));
  return {
    nodes: visible.map((node) => {
      const position = layout.node(node.id) as { x: number; y: number };
      return {
        id: node.uid ?? node.id,
        type: 'productDesign' as const,
        position: { x: position.x - width / 2, y: position.y - height / 2 },
        width,
        height,
        style: { width, height },
        data: {
          node,
          state:
            node.role === 'start'
              ? 'source'
              : node.uid && existingUids.includes(node.uid)
                ? 'added'
                : node.uid && draftUids.includes(node.uid)
                  ? 'selected'
                  : 'available',
          hasIncomingConnection: incomingNodeIds.has(node.id),
          hasOutgoingConnection: outgoingNodeIds.has(node.id),
          onToggle,
        },
      } satisfies PickerNode;
    }),
    edges: edges.map((edge) => ({
      ...edge,
      source: nodes.find((node) => node.id === edge.source)?.uid ?? edge.source,
      target: nodes.find((node) => node.id === edge.target)?.uid ?? edge.target,
    })),
  };
}
