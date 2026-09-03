'use client';

import { ChevronDown, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
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
  const { t } = useUiText();
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed)
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={t('Expand input panel')}
        aria-expanded={false}
        className={cn(
          'absolute right-5 bottom-5 z-10 rounded-xl bg-background shadow-[0_12px_35px_rgb(15_23_42/12%)]',
          className,
        )}
        onClick={() => setCollapsed(false)}
      >
        <Sparkles className="size-4" />
      </Button>
    );
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
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('Collapse input panel')}
            aria-expanded={true}
            onClick={() => setCollapsed(true)}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      </header>
      {children ? <div className="mt-3">{children}</div> : null}
    </aside>
  );
}
