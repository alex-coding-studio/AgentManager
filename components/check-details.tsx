'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, MinusCircle, ChevronRight } from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';

export function CheckDetails({
  title,
  status,
  children,
  nonBlocking = false,
}: {
  title: string;
  status?: 'passed' | 'failed' | 'not-run';
  children: ReactNode;
  nonBlocking?: boolean;
}) {
  const { t } = useUiText();
  const Icon =
    status === 'passed'
      ? CheckCircle2
      : status === 'failed' && !nonBlocking
        ? XCircle
        : MinusCircle;
  return (
    <details className="group/check rounded-lg border border-border text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/check:rotate-90"
        />
        <span className="min-w-0 flex-1 break-words">{title}</span>
        {status && (
          <span
            title={`${t(status)}${nonBlocking ? ' · non-blocker' : ''}`}
            className={
              status === 'passed'
                ? 'text-emerald-500'
                : nonBlocking
                  ? 'text-amber-500'
                  : status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
            }
          >
            <span className="sr-only">
              {t(status)}
              {nonBlocking ? ' · non-blocker' : ''}
            </span>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
          </span>
        )}
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3">
        {children}
      </div>
    </details>
  );
}
