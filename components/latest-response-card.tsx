'use client';

import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  LoaderCircle,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type { LatestResponseDocument } from '@/lib/execution-observability/types';
import {
  actorLabel,
  formatElapsed,
  phaseLabel,
  statusPresentation,
} from '@/lib/execution-observability/status-presentation';
import { cn } from '@/lib/utils';

export function LatestResponseCard({
  document,
  collapsed,
  onCollapsedChange,
  onCancel,
  cancelDisabled,
  className,
  children,
}: {
  document: LatestResponseDocument;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onCancel?: () => void;
  cancelDisabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useUiText();
  const running = document.status === 'running';
  const presentation = statusPresentation(document.status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);
  const Icon =
    document.status === 'running'
      ? LoaderCircle
      : document.status === 'completed'
        ? CheckCircle2
        : document.status === 'warning'
          ? TriangleAlert
          : CircleX;
  const statusLabel = t(presentation.label);
  const collapsible = Boolean(onCollapsedChange);
  const isCollapsed = collapsible && collapsed;
  const warnings = document.supplementaryWarnings.length;

  return (
    <>
      {collapsible ? (
        <button
          type="button"
          data-status={document.status}
          aria-expanded={false}
          aria-hidden={!isCollapsed}
          tabIndex={isCollapsed ? 0 : -1}
          aria-label={`${statusLabel}: ${document.title}`}
          onClick={() => onCollapsedChange?.(false)}
          className={cn(
            'absolute top-4 left-4 z-10 flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs font-medium shadow-[0_12px_35px_rgb(15_23_42/12%)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
            presentation.border,
            presentation.text,
            isCollapsed
              ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none -translate-y-1 scale-95 opacity-0',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-2 rounded-full',
              presentation.dot,
              presentation.pulse && 'animate-pulse',
            )}
          />
          <Icon
            aria-hidden="true"
            className={cn('size-3.5', running && 'animate-spin')}
          />
          <span className="sr-only">{statusLabel}</span>
          <span className="max-w-[12rem] truncate">{document.title}</span>
        </button>
      ) : null}
      <section
        data-status={document.status}
        data-run={document.runId}
        aria-hidden={isCollapsed}
        inert={isCollapsed || undefined}
        className={cn(
          'absolute top-4 left-4 z-10 rounded-2xl border bg-background/95 p-3 shadow-[0_18px_50px_rgb(15_23_42/12%)] backdrop-blur transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
          presentation.border,
          isCollapsed
            ? 'pointer-events-none -translate-y-2 scale-95 opacity-0'
            : 'pointer-events-auto translate-y-0 scale-100 opacity-100',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                presentation.badge,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 rounded-full',
                  presentation.dot,
                  presentation.pulse && 'animate-pulse',
                )}
              />
              {statusLabel}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {document.subject.label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {running && onCancel ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={cancelDisabled || document.phase === 'stopping'}
                onClick={onCancel}
              >
                <Square className="size-3" />
                {t(document.phase === 'stopping' ? 'Stopping' : 'Cancel')}
              </Button>
            ) : null}
            {collapsible ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('Collapse Latest Response')}
                aria-expanded={true}
                onClick={() => onCollapsedChange?.(true)}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </header>
        <div className="mt-2 flex items-start gap-2">
          <Icon
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-3.5 shrink-0',
              presentation.text,
              running && 'animate-spin',
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">
              {running
                ? `${document.actor ? actorLabel(document.actor) : t('Agent')} · ${document.phase ? t(phaseLabel(document.phase)) : t('Running')}`
                : document.title}
            </div>
            {running ? (
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {formatElapsed(document.startedAt, null, now)}
              </div>
            ) : (
              <p className="mt-1 text-[11px] leading-5 text-foreground/80">
                {document.detail}
              </p>
            )}
          </div>
        </div>
        {running ? (
          <ol className="mt-2 space-y-1 text-[11px] leading-4 text-muted-foreground">
            {(document.recentActivity.length
              ? document.recentActivity
              : [
                  {
                    sequence: 0,
                    message: document.detail,
                    actor: document.actor ?? 'AGENT',
                  },
                ]
            ).map((entry) => (
              <li key={entry.sequence} className="flex gap-2">
                <span className="shrink-0 font-mono text-[10px] uppercase opacity-70">
                  {entry.actor}
                </span>
                <span className="min-w-0 truncate">{entry.message}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {!running && warnings ? (
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-amber-700 dark:text-amber-300">
              {t('{count} additional findings', { count: warnings })}
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {document.supplementaryWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <a
            href={document.logUrlPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-6 items-center rounded-md border border-border px-2 text-[11px] font-medium hover:bg-secondary"
          >
            {t('Log')}
          </a>
          {!running ? children : null}
        </div>
      </section>
    </>
  );
}
