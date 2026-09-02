'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleEllipsis,
  GitFork,
  LoaderCircle,
  Plus,
  X,
} from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';
import { CanvasNodeCardFrame } from '@/components/canvas-node-card-frame';
import { cn } from '@/lib/utils';
import { graphCardLabel } from '@/lib/graph-identity';
import type { TaskGraphPreview } from '@/lib/task-graph-layout';

export type GraphNodeCardData = Record<string, unknown> & {
  readOnly?: boolean;
  displayId: string;
  kind: 'formal' | 'preview';
  title: string;
  type: string;
  inputCount: number;
  outputCount: number;
  color: string;
  description?: string;
  revision?: number;
  transientKind?: TaskGraphPreview['kind'];
  status?: string;
  agentLabel?: string;
  runId?: string;
  startedAt?: string;
  updatedAt?: string;
  relationshipCount: number;
  dependenciesFocused?: boolean;
  onFocusDependencies: (nodeId: string) => void;
  selectedForRun?: boolean;
  selectionEnabled?: boolean;
  plusLabel?: string;
  onDecompose: (nodeId: string) => void;
  onToggleSelection: (nodeId: string) => void;
  onInspect: (nodeId: string) => void;
  onCancelRun: (runId: string) => void;
};

export function GraphNodeCard({
  data,
  selected,
}: {
  data: GraphNodeCardData;
  selected?: boolean;
}) {
  const { t } = useUiText();
  const id = data.displayId;
  const preview = data.kind === 'preview';
  const running = data.transientKind === 'run';
  const elapsed = useRunElapsed(data.startedAt, running);
  const sinceUpdate = useRunElapsed(data.updatedAt, running);
  const runningBaseLabel = t('{agent} is running', {
    agent: data.agentLabel?.trim() || 'Agent',
  });
  const runningLabel = elapsed
    ? `${runningBaseLabel} (${elapsed})`
    : runningBaseLabel;
  const showDetails = !preview || data.transientKind === 'candidate';
  const showEdgeAction = !preview && !data.readOnly && !data.selectionEnabled;

  return (
    <CanvasNodeCardFrame
      density="standard"
      appearance={preview ? 'provisional' : 'default'}
      accentColor={data.color}
      busy={running}
      bodyInset={data.selectionEnabled}
      focused={selected}
      selected={data.selectedForRun}
      selectionControl={
        data.selectionEnabled ? (
          <button
            type="button"
            className="nodrag nopan relative -ml-1 mr-1 grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition after:absolute after:-inset-1 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label={
              data.selectedForRun
                ? t('Remove {title} from selection', { title: data.title })
                : t('Select {title}', { title: data.title })
            }
            aria-pressed={Boolean(data.selectedForRun)}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleSelection(id);
            }}
          >
            {data.selectedForRun ? (
              <CheckCircle2 className="size-4 text-foreground" />
            ) : (
              <Circle className="size-4" />
            )}
          </button>
        ) : null
      }
      kindLabel={
        <span
          data-node-type-label
          className={cn(
            'min-w-0 rounded-lg px-1.5 py-0.5 text-[9px] font-medium leading-3.5 whitespace-normal capitalize [overflow-wrap:anywhere]',
            preview
              ? 'bg-secondary text-secondary-foreground'
              : 'bg-foreground text-background',
          )}
          title={running ? runningLabel : data.type}
          style={
            preview
              ? {
                  backgroundColor: `color-mix(in srgb, ${data.color} 12%, transparent)`,
                  color: data.color,
                }
              : undefined
          }
        >
          {running ? (
            <LoaderCircle
              className="mr-1 inline size-2.5 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {running ? runningLabel : data.type}
        </span>
      }
      headerActions={
        <>
          {data.relationshipCount > 0 ? (
            <button
              type="button"
              className="nodrag nopan flex h-6 shrink-0 items-center gap-1 rounded-full px-1 text-[9px] leading-3 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              title={t('Show only {count} direct dependencies', {
                count: data.relationshipCount,
              })}
              aria-label={t('Show direct dependencies for {title}', {
                title: data.title,
              })}
              aria-pressed={Boolean(data.dependenciesFocused)}
              onClick={(event) => {
                event.stopPropagation();
                data.onFocusDependencies(id);
              }}
            >
              <GitFork className="size-3" />
              {data.relationshipCount}
            </button>
          ) : null}
          {running ? (
            <button
              type="button"
              className="nodrag nopan relative grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition after:absolute after:-inset-1 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              aria-label={t('Cancel Agent Run')}
              title={t('Cancel Agent Run')}
              onClick={(event) => {
                event.stopPropagation();
                data.onCancelRun(data.runId ?? id);
              }}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </>
      }
      detailsControl={
        showDetails ? (
          <button
            type="button"
            className="nodrag nopan relative -mr-1 grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition after:absolute after:-inset-1 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            aria-label={t('Open details for {title}', { title: data.title })}
            title={t('Open details')}
            onClick={(event) => {
              event.stopPropagation();
              data.onInspect(id);
            }}
          >
            <CircleEllipsis className="size-4" />
          </button>
        ) : null
      }
      title={data.title}
      summary={
        data.description || running ? (data.description ?? '') : undefined
      }
      footer={
        <>
          <span className="shrink-0 text-[9px] leading-3 text-muted-foreground">
            {running
              ? t('Updated {elapsed} ago', { elapsed: sinceUpdate || '0:00' })
              : data.revision !== undefined
                ? t('Rev {revision} · In {inputs} · Out {outputs}', {
                    revision: data.revision,
                    inputs: data.inputCount,
                    outputs: data.outputCount,
                  })
                : t('In {inputs} · Out {outputs}', {
                    inputs: data.inputCount,
                    outputs: data.outputCount,
                  })}
          </span>
          <span
            className="ml-auto min-w-0 break-all text-right font-mono text-[8px] font-normal leading-3 text-muted-foreground"
            title={id}
            aria-label={id}
          >
            {graphCardLabel(id)}
          </span>
        </>
      }
      edgeAction={
        showEdgeAction ? (
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
        ) : null
      }
    />
  );
}

function useRunElapsed(startedAt: string | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);
  if (!running || !startedAt) return '';
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1_000),
  );
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}
