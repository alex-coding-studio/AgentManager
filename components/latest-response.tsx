'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, CircleX, TriangleAlert } from 'lucide-react';
import type {
  LatestResponseAttention,
  LatestResponseTone,
} from '@/lib/latest-response';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const toneClasses: Record<LatestResponseTone, string> = {
  completed: 'border-emerald-500/45 bg-emerald-500/8',
  warning: 'border-amber-500/55 bg-amber-500/10',
  fail: 'border-destructive/55 bg-destructive/10',
};

const statusClasses: Record<LatestResponseTone, string> = {
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  fail: 'bg-destructive/15 text-destructive',
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
  icon: 'success' | 'warning' | 'error';
  className?: string;
  children?: ReactNode;
}) {
  const requiresAction = attention === 'action-required';
  const Icon =
    icon === 'success'
      ? CheckCircle2
      : icon === 'warning'
        ? TriangleAlert
        : CircleX;
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
              icon === 'warning' && 'text-amber-500',
              icon === 'error' && 'text-destructive',
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

export function LatestResponseActions({
  responseLabel,
  summaryLabel,
  logLabel,
  onOpenResponse,
  onOpenSummary,
  onOpenLog,
}: {
  responseLabel: string;
  summaryLabel: string;
  logLabel: string;
  onOpenResponse: () => void;
  onOpenSummary: () => void;
  onOpenLog: () => void;
}) {
  const actions = [
    { label: responseLabel, onSelect: onOpenResponse },
    { label: summaryLabel, onSelect: onOpenSummary },
    { label: logLabel, onSelect: onOpenLog },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant="outline"
          size="xs"
          onClick={action.onSelect}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export function LatestResponseOptions({
  options,
  recommendedLabel,
  selectedId,
  onSelect,
}: {
  options: Array<{
    id: string;
    label: string;
    effect: string;
    recommended: boolean;
  }>;
  recommendedLabel: string;
  selectedId?: string;
  onSelect: (option: (typeof options)[number]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant={selectedId === option.id ? 'secondary' : 'outline'}
          aria-pressed={selectedId === option.id}
          className="h-auto w-full items-start justify-start gap-2 px-2.5 py-2 text-left whitespace-normal"
          onClick={() => onSelect(option)}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <span>{option.label}</span>
              {option.recommended ? (
                <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                  {recommendedLabel}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
              {option.effect}
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
}
