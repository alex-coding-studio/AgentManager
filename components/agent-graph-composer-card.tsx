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
  collapsedIcon,
  collapsedLabel,
  descriptionClassName,
  running = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  collapsedIcon?: ReactNode;
  collapsedLabel?: string;
  descriptionClassName?: string;
  running?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const { t } = useUiText();
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? localCollapsed;
  const setCollapsed = (next: boolean) => {
    if (onCollapsedChange) onCollapsedChange(next);
    else setLocalCollapsed(next);
  };
  if (running)
    return (
      <output
        aria-label={t('Running')}
        data-running="true"
        className={cn(
          'absolute right-5 bottom-5 z-10 flex size-10 items-center justify-center rounded-xl border border-sky-500/40 bg-background shadow-[0_12px_35px_rgb(15_23_42/12%)]',
          className,
        )}
      >
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-3 rounded-full bg-sky-500" />
        </span>
      </output>
    );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={collapsedLabel ?? t('Expand input panel')}
        aria-expanded={false}
        aria-hidden={!collapsed}
        tabIndex={collapsed ? 0 : -1}
        className={cn(
          'absolute right-5 bottom-5 z-10 origin-bottom-right rounded-xl bg-background shadow-[0_12px_35px_rgb(15_23_42/12%)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
          collapsed
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1 scale-75 opacity-0',
          className,
        )}
        onClick={() => setCollapsed(false)}
      >
        {collapsedIcon ?? <Sparkles className="size-4" />}
      </Button>
      <aside
        aria-hidden={collapsed}
        inert={collapsed || undefined}
        className={cn(
          'absolute right-5 bottom-5 z-10 max-h-[calc(100%-2.5rem)] w-[360px] origin-bottom-right overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-[0_18px_50px_rgb(15_23_42/12%)] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
          collapsed
            ? 'pointer-events-none translate-y-2 scale-95 opacity-0'
            : 'pointer-events-auto translate-y-0 scale-100 opacity-100',
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold">{title}</div>
            {description ? (
              <p
                className={cn(
                  'mt-1 text-[11px] leading-5 text-muted-foreground',
                  descriptionClassName,
                )}
              >
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
    </>
  );
}
