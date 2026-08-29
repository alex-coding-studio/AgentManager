'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  ChevronDown,
  CircleDot,
  FileText,
  FolderGit2,
  GitFork,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import type { RegisteredProject } from '@/lib/project-registry';
import { cn } from '@/lib/utils';

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, available: true },
  { label: 'Product context', icon: FileText, available: false },
  { label: 'Task decomposition', icon: Boxes, available: false },
  { label: 'Dependencies', icon: GitFork, available: false },
];

export function ProjectShell({
  project,
  projects,
  children,
}: {
  project: RegisteredProject;
  projects: RegisteredProject[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="border-b border-border bg-[color-mix(in_oklch,var(--background),var(--foreground)_2%)] lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <Link href="/" className="mb-4 flex items-center gap-2.5 px-1">
              <div className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                AM
              </div>
              <span className="font-semibold tracking-tight">AgentManager</span>
            </Link>

            <div className="relative">
              <select
                aria-label="Switch project"
                value={project.id}
                onChange={(event) =>
                  router.push(`/projects/${event.target.value}`)
                }
                className="h-12 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-left text-sm font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
              >
                {projects.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <nav className="grid gap-1 p-3" aria-label="Project navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                item.available && pathname === `/projects/${project.id}`;
              return (
                <div
                  key={item.label}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg px-3 text-sm',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                    !item.available && 'opacity-55',
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                  {!item.available ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wide">
                      Soon
                    </span>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto hidden border-t border-border p-3 lg:block">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground">
              <Settings className="size-4" />
              Settings
              <span className="ml-auto text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-border px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            {project.kind === 'repository' ? (
              <FolderGit2 className="size-4 shrink-0" />
            ) : (
              <CircleDot className="size-4 shrink-0" />
            )}
            <span className="truncate">{project.rootPath}</span>
          </div>
          <span className="ml-4 shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {project.kind === 'repository' ? 'Repository' : 'Product idea'}
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}
