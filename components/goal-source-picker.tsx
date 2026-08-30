'use client';

import { useMemo, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';
import {
  buildGoalPickerGraph,
  GOAL_PICKER_HEIGHT,
  GOAL_PICKER_WIDTH,
  type GoalPickerEntry,
} from '@/lib/goal-picker-graph';
import type { PlanningCard } from '@/lib/just-do-it-planning-service';
import type { PlanningSource } from '@/lib/just-do-it-planning-sources';

type CompactNode = Node<
  {
    entry: GoalPickerEntry;
    disabled: boolean;
    onChoose: (source: PlanningSource) => void;
  },
  'compactGoal'
>;
const statusLabels = {
  'not-started': 'Not started',
  added: 'Already added',
  planning: 'Agent running',
  'plan-ready': 'Plan finalized',
  completed: 'Completed',
};
const fitOptions = { padding: 0.18, minZoom: 0.25, maxZoom: 1 };
const nodeTypes = { compactGoal: CompactGoalCard };
const edgeTypes = { goalRelation: GoalRelationEdge };

function GoalRelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps<Edge<{ lane?: number }>>) {
  const lane = data?.lane;
  const edgePath =
    lane === undefined
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        })[0]
      : `M ${sourceX} ${sourceY} L ${sourceX + 16} ${sourceY} L ${sourceX + 16} ${lane} L ${targetX - 16} ${lane} L ${targetX - 16} ${targetY} L ${targetX} ${targetY}`;
  return (
    <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
  );
}

function CompactGoalCard({ data }: NodeProps<CompactNode>) {
  const { t } = useUiText();
  const { entry } = data;
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!size-1.5 !border-0 !bg-muted-foreground"
      />
      <button
        type="button"
        disabled={data.disabled}
        title={entry.title}
        aria-label={`${t(entry.executionStatus === 'not-started' ? 'Add a goal' : 'Open goal')}: ${entry.title}`}
        onClick={() => data.onChoose(entry)}
        className="nodrag nopan pointer-events-auto flex h-full w-full flex-col justify-between rounded-xl border border-border bg-card px-3 py-3 text-left shadow-sm transition hover:border-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <span className="line-clamp-2 text-[13px] font-medium leading-[18px]">
          {entry.title}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="shrink-0">
            {t(statusLabels[entry.executionStatus])}
          </span>
          <span className="min-w-0 truncate font-mono" title={entry.id}>
            Node-{entry.id.slice(5)}
          </span>
        </span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!size-1.5 !border-0 !bg-muted-foreground"
      />
    </>
  );
}

export function GoalSourceGraph({
  entries,
  moduleName,
  disabled,
  onChoose,
}: {
  entries: GoalPickerEntry[];
  moduleName: PlanningSource['module'];
  disabled: boolean;
  onChoose: (source: PlanningSource) => void;
}) {
  const { t } = useUiText();
  const graph = useMemo(
    () => buildGoalPickerGraph(entries, moduleName),
    [entries, moduleName],
  );
  const nodes: CompactNode[] = graph.nodes.map(({ entry, x, y }) => ({
    id: entry.uid,
    type: 'compactGoal',
    position: { x, y },
    width: GOAL_PICKER_WIDTH,
    height: GOAL_PICKER_HEIGHT,
    style: { width: GOAL_PICKER_WIDTH, height: GOAL_PICKER_HEIGHT },
    data: { entry, disabled, onChoose },
  }));
  const edges = graph.edges.map((edge, index) => {
    const source = graph.nodes.find((node) => node.entry.uid === edge.source)!;
    const target = graph.nodes.find((node) => node.entry.uid === edge.target)!;
    const needsLane =
      target.x - source.x > GOAL_PICKER_WIDTH + 65 || target.x <= source.x;
    const lane = needsLane
      ? Math.min(
          ...graph.nodes
            .filter(
              (node) =>
                node.x + GOAL_PICKER_WIDTH >= Math.min(source.x, target.x) &&
                node.x <= Math.max(source.x, target.x) + GOAL_PICKER_WIDTH,
            )
            .map((node) => node.y),
        ) -
        20 -
        (index % 3) * 8
      : undefined;
    return {
      ...edge,
      type: 'goalRelation',
      data: { lane },
      markerEnd:
        edge.kind === 'dependency'
          ? {
              type: MarkerType.ArrowClosed,
              color: '#c58a36',
              width: 16,
              height: 16,
            }
          : undefined,
      style: {
        stroke:
          edge.kind === 'dependency' ? '#c58a36' : 'var(--muted-foreground)',
        strokeWidth: edge.kind === 'dependency' ? 1.7 : 1,
        strokeDasharray: edge.kind === 'lineage' ? '4 4' : undefined,
        opacity: edge.kind === 'lineage' ? 0.55 : 1,
      },
    };
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {(graph.unresolvedDependencies > 0 || graph.dependencyCycle) && (
        <output className="border-b border-border px-5 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t(
            graph.dependencyCycle
              ? 'Some dependencies form a cycle; execution order cannot be inferred.'
              : 'Some prerequisites are outside this view. Adding a goal does not execute it.',
          )}
        </output>
      )}
      <div className="relative min-h-[280px] flex-1" aria-label={t('Goal map')}>
        {!nodes.length ? (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-muted-foreground">
            {t('No unfinished formal Nodes in this module.')}
          </div>
        ) : (
          <ReactFlow<CompactNode>
            key={`${nodes.map((node) => node.id).join('|')}:${edges.map((edge) => edge.id).join('|')}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            minZoom={0.2}
            maxZoom={1.6}
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
            <Background gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="w-7 border-t-2 border-[#c58a36]" />
          {t('Prerequisite → dependent')}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-7 border-t border-dashed border-muted-foreground" />
          {t('Decomposition / origin · not execution order')}
        </span>
        <span className="ml-auto">
          {t('Click a Card to add it or open its existing Plan.')}
        </span>
      </footer>
    </div>
  );
}

export function GoalSourcePicker({
  open,
  onOpenChange,
  sources,
  cards,
  pending,
  error,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: PlanningSource[];
  cards: PlanningCard[];
  pending: boolean;
  error: string | null;
  onChoose: (source: PlanningSource) => void;
}) {
  const { t } = useUiText();
  const [moduleName, setModuleName] =
    useState<PlanningSource['module']>('whats-next');
  const entries: GoalPickerEntry[] = sources.map((source) => {
    const existing = cards.find((card) => card.source.uid === source.uid);
    return {
      ...source,
      executionStatus: !existing
        ? 'not-started'
        : existing.run?.status === 'running'
          ? 'planning'
          : existing.plan?.status === 'finalized'
            ? 'plan-ready'
            : 'added',
    };
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(900px,92dvh)] w-[calc(100vw-2rem)] max-w-[1440px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1440px]">
        <DialogHeader className="shrink-0 px-5 pt-5 pr-14 pb-4">
          <DialogTitle>{t('Add a goal')}</DialogTitle>
          <DialogDescription>
            {t(
              'Choose your next goal from the task map. Prerequisites are on the left; dependent work follows on the right.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div
          role="tablist"
          aria-label={t('Goal source')}
          className="grid shrink-0 grid-cols-2 border-b border-border px-5"
        >
          {(['whats-next', 'task-graph'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`goal-source-tab-${value}`}
              aria-selected={moduleName === value}
              aria-controls="goal-source-panel"
              tabIndex={moduleName === value ? 0 : -1}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 'whats-next'
                    : event.key === 'End'
                      ? 'task-graph'
                      : value === 'whats-next'
                        ? 'task-graph'
                        : 'whats-next';
                setModuleName(next);
                document.getElementById(`goal-source-tab-${next}`)?.focus();
              }}
              onClick={() => setModuleName(value)}
              className={cn(
                'flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring',
                moduleName === value
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'whats-next' ? "What's Next" : 'Break It Down'}
              <span className="rounded-md bg-secondary px-1.5 text-[10px] text-muted-foreground">
                {
                  entries.filter(
                    (entry) =>
                      entry.module === value &&
                      entry.executionStatus !== 'completed',
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="px-5 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div
          id="goal-source-panel"
          role="tabpanel"
          aria-labelledby={`goal-source-tab-${moduleName}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <GoalSourceGraph
            key={moduleName}
            entries={entries}
            moduleName={moduleName}
            disabled={pending}
            onChoose={onChoose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
