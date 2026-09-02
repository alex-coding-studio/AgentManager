'use client';

import type { ReactNode } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  MinusCircle,
  TriangleAlert,
} from 'lucide-react';
import type {
  LatestResponseAttention,
  LatestResponseTone,
} from '@/lib/latest-response';
import { cn } from '@/lib/utils';

const toneClasses: Record<LatestResponseTone, string> = {
  neutral: 'border-border bg-background/95',
  attention: 'border-amber-500/55 bg-amber-500/10',
  warning: 'border-amber-500/45 bg-amber-500/8',
  error: 'border-destructive/55 bg-destructive/10',
};

const statusClasses: Record<LatestResponseTone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  attention: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  error: 'bg-destructive/15 text-destructive',
};

export function LatestResponse({
  title,
  statusLabel,
  summary,
  tone,
  attention,
  icon,
  className,
  children,
}: {
  title: string;
  statusLabel: string;
  summary: string;
  tone: LatestResponseTone;
  attention: LatestResponseAttention;
  icon: 'success' | 'neutral' | 'attention' | 'warning' | 'error';
  className?: string;
  children?: ReactNode;
}) {
  const requiresAction = attention === 'action-required';
  const Icon =
    icon === 'success'
      ? CheckCircle2
      : icon === 'attention'
        ? CircleAlert
        : icon === 'warning'
          ? TriangleAlert
          : icon === 'error'
            ? CircleX
            : MinusCircle;
  return (
    <section
      data-tone={tone}
      data-attention={attention}
      className={cn(
        'overflow-hidden rounded-xl border text-left shadow-[0_12px_35px_rgb(15_23_42/9%)] backdrop-blur transition-colors',
        toneClasses[tone],
        className,
      )}
    >
      <div className="px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Icon
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0',
              icon === 'success' && 'text-emerald-500',
              (icon === 'attention' || icon === 'warning') && 'text-amber-500',
              icon === 'error' && 'text-destructive',
              icon === 'neutral' && 'text-muted-foreground',
            )}
          />
          <span>{title}</span>
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-[9px] font-medium',
              statusClasses[tone],
            )}
          >
            {statusLabel}
          </span>
        </span>
        <span className="mt-1.5 block max-h-10 overflow-hidden text-[11px] leading-5 text-muted-foreground">
          {summary}
        </span>
      </div>
      {children ? (
        <div className="border-t border-current/10 px-3 py-2.5">{children}</div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {requiresAction ? `${statusLabel}: ${summary}` : ''}
      </span>
    </section>
  );
}
