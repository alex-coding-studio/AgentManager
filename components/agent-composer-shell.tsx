'use client';

import type { ReactNode } from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';

export function AgentComposerShell({
  children,
  controls,
  className,
}: {
  children: ReactNode;
  controls: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-background p-2 transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15 [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:shadow-none [&_textarea]:focus-visible:ring-0',
        className,
      )}
    >
      {children}
      <div className="mt-1 px-1 pb-0.5">{controls}</div>
    </div>
  );
}

export function AgentComposerAttachments({
  label,
  items,
  className,
}: {
  label: string;
  items: Array<{ id: string; label: string; onRemove: () => void }>;
  className?: string;
}) {
  const { t } = useUiText();
  if (items.length === 0) return null;
  return (
    <section className={cn('space-y-2', className)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs"
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('Remove resource {name}', { name: item.label })}
              onClick={item.onRemove}
            >
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
