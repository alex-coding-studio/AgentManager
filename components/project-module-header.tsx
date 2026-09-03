import type { ReactNode } from 'react';

export function ProjectModuleHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-16 w-full shrink-0 items-center gap-4 border-b border-border px-5 py-2.5 lg:pr-5 lg:pl-8">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
