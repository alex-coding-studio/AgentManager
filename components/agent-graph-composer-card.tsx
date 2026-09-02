'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AgentGraphComposerCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        'absolute right-5 bottom-5 z-10 max-h-[calc(100%-2.5rem)] w-[360px] overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-[0_18px_50px_rgb(15_23_42/12%)]',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold">{title}</div>
          {description ? (
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children ? <div className="mt-3">{children}</div> : null}
    </aside>
  );
}
