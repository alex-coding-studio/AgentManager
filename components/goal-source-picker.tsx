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
  canAddGoalSource,
  goalPickerEdgeLane,
  GOAL_PICKER_HEIGHT,
  GOAL_PICKER_WIDTH,
  type GoalPickerEntry,
} from '@/lib/graph/goal-picker';
import type { PlanningCard } from '@/lib/modules/implementation/planning-service';
import { unmetPlanningSourceDependencies } from '@/lib/modules/implementation/source-dependencies';
import type { PlanningSource } from '@/lib/modules/implementation/planning-sources';

type CompactNode = Node<
  {
    entry: GoalPickerEntry;
    disabled: boolean;
    hasIncomingConnection: boolean;
    hasOutgoingConnection: boolean;
    onChoose: (source: PlanningSource) => void;
  },
  'compactGoal'
>;
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
  const waiting = entry.executionStatus === 'waiting';
  const alreadyAdded = !['not-started', 'waiting'].includes(
    entry.executionStatus,
  );
  const canAdd = canAddGoalSource(entry, data.disabled);
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
      <button
        type="button"
        disabled={!canAdd}
        title={entry.title}
        aria-label={`${t(waiting ? 'Waiting for prerequisites' : alreadyAdded ? 'Already added' : 'Add a goal')}: ${entry.title}`}
        onClick={() => {
          if (canAdd) data.onChoose(entry);
        }}
        className={cn(
          'nodrag nopan pointer-events-auto flex h-full w-full flex-col justify-between rounded-xl border border-border px-3 py-3 text-left text-foreground shadow-sm transition enabled:hover:border-foreground/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-default disabled:focus-visible:outline-none',
          alreadyAdded
            ? 'bg-muted/60'
            : waiting
              ? 'bg-secondary/35'
              : 'bg-card',
        )}
      >
        <span className="line-clamp-2 text-[13px] font-medium leading-[18px]">
          {entry.title}
        </span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="shrink-0">
            {t(
              waiting
                ? 'Waiting'
                : alreadyAdded
                  ? 'Already added'
                  : 'Not started',
            )}
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
  const incomingNodeIds = new Set(graph.edges.map((edge) => edge.target));
  const outgoingNodeIds = new Set(graph.edges.map((edge) => edge.source));
  const nodes: CompactNode[] = graph.nodes.map(({ entry, x, y }) => ({
    id: entry.uid,
    type: 'compactGoal',
    position: { x, y },
    width: GOAL_PICKER_WIDTH,
    height: GOAL_PICKER_HEIGHT,
    style: { width: GOAL_PICKER_WIDTH, height: GOAL_PICKER_HEIGHT },
    data: {
      entry,
      disabled,
      hasIncomingConnection: incomingNodeIds.has(entry.uid),
      hasOutgoingConnection: outgoingNodeIds.has(entry.uid),
      onChoose,
    },
  }));
  const edges = graph.edges.map((edge) => {
    const lane = goalPickerEdgeLane(graph.nodes, edge);
    return {
      ...edge,
      type: 'goalRelation',
      data: { lane },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#c58a36',
        width: 16,
        height: 16,
      },
      style: { stroke: '#c58a36', strokeWidth: 1.7 },
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
        <span className="ml-auto">
          {t('Choose a goal to add. Added Cards are shown for context only.')}
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
  initialModule = 'whats-next',
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: PlanningSource[];
  cards: PlanningCard[];
  pending: boolean;
  error: string | null;
  initialModule?: PlanningSource['module'];
  onChoose: (source: PlanningSource) => void;
}) {
  const { t } = useUiText();
  const [moduleName, setModuleName] =
    useState<PlanningSource['module']>(initialModule);
  const entries: GoalPickerEntry[] = sources.map((source) => {
    const existing = cards.find((card) => card.source.uid === source.uid);
    const completed = Boolean(
      existing?.actions.length &&
      existing.actions.every((action) =>
        existing.execution?.acceptedActionIds.includes(action.id),
      ),
    );
    const waiting = Boolean(
      !existing &&
      source.module === 'what-to-do' &&
      unmetPlanningSourceDependencies(source, cards, sources).length,
    );
    return {
      ...source,
      executionStatus: completed
        ? 'completed'
        : !existing
          ? waiting
            ? 'waiting'
            : 'not-started'
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
          className="grid shrink-0 grid-cols-3 border-b border-border px-5"
        >
          {(['whats-next', 'task-graph', 'what-to-do'] as const).map(
            (value, index, modules) => (
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
                      ? modules[0]
                      : event.key === 'End'
                        ? modules.at(-1)!
                        : modules[
                            (index +
                              (event.key === 'ArrowRight' ? 1 : -1) +
                              modules.length) %
                              modules.length
                          ];
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
                {t(moduleLabel(value))}
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
            ),
          )}
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

function moduleLabel(module: PlanningSource['module']) {
  if (module === 'whats-next') return 'Product Discovery & Design';
  if (module === 'task-graph') return 'Scope Decomposition';
  return 'Delivery Planning';
}
