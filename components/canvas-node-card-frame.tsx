'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  type CanvasNodeCardDensity,
  canvasNodeCardMinHeight,
} from '@/lib/graph/canvas-node-card-metrics';

export type CanvasNodeCardAppearance = 'default' | 'provisional';

export type CanvasNodeCardFrameProps = {
  density?: CanvasNodeCardDensity;
  appearance?: CanvasNodeCardAppearance;
  accentColor?: string;
  selected?: boolean;
  focused?: boolean;
  dimmed?: boolean;
  busy?: boolean;
  selectionControl?: ReactNode;
  kindLabel?: ReactNode;
  headerActions?: ReactNode;
  detailsControl?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  status?: ReactNode;
  footer?: ReactNode;
  edgeAction?: ReactNode;
};

export function CanvasNodeCardFrame({
  density = 'standard',
  appearance = 'default',
  accentColor,
  selected,
  focused,
  dimmed,
  busy,
  selectionControl,
  kindLabel,
  headerActions,
  detailsControl,
  title,
  summary,
  status,
  footer,
  edgeAction,
}: CanvasNodeCardFrameProps) {
  const provisional = appearance === 'provisional';
  const style: CSSProperties = busy
    ? {
        minHeight: canvasNodeCardMinHeight(density),
        borderColor: accentColor,
        borderWidth: 2,
      }
    : {
        minHeight: canvasNodeCardMinHeight(density),
        borderTopColor: provisional ? accentColor : 'var(--foreground)',
      };

  return (
    <div
      data-canvas-node-card
      data-density={density}
      aria-busy={busy}
      className={cn(
        'group relative flex w-72 flex-col rounded-2xl border border-t-[3px] bg-card',
        density === 'compact' ? 'px-3 py-2' : 'px-3 py-2.5',
        'text-left shadow-[0_10px_30px_rgb(15_23_42/6%)] transition',
        focused && 'ring-3 ring-ring/20',
        selected && 'ring-2 ring-foreground/35',
        dimmed && 'opacity-40',
        provisional && 'border-dashed bg-secondary/35',
      )}
      style={style}
    >
      <div
        className={cn(
          'flex items-center justify-between',
          density === 'compact' ? 'min-h-6 gap-2' : 'min-h-7 gap-2',
        )}
      >
        <span className={cn('flex min-w-0 items-center', 'gap-1')}>
          {selectionControl}
          {kindLabel}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {headerActions}
          {detailsControl}
        </span>
      </div>
      <h2
        className={cn(
          density === 'compact' ? 'mt-0.5 line-clamp-2' : 'mt-0.5 line-clamp-3',
          'text-sm font-semibold leading-5',
        )}
      >
        {title}
      </h2>
      {summary === undefined || summary === null ? null : (
        <div className="mt-1">
          <p
            className={cn(
              density === 'compact' ? 'line-clamp-1' : 'line-clamp-3',
              density === 'compact' ? 'leading-4' : 'leading-5',
              'text-[11px] text-muted-foreground',
            )}
          >
            {summary}
          </p>
        </div>
      )}
      {status === undefined || status === null ? null : (
        <div className="mt-1.5">{status}</div>
      )}
      {footer ? (
        <div
          className={cn(
            'mt-auto flex items-baseline justify-between gap-2',
            density === 'compact' ? 'pt-0.5' : 'pt-1',
          )}
        >
          {footer}
        </div>
      ) : null}
      {edgeAction}
    </div>
  );
}
