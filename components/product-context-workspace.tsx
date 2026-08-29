'use client';

import { useMemo, useState } from 'react';
import { BookOpen, FileText, Folder, FolderPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import type { ContextSection } from '@/lib/product-context';
import { cn } from '@/lib/utils';

export function ProductContextWorkspace({
  projectId,
  initialSections,
}: {
  projectId: string;
  initialSections: ContextSection[];
}) {
  const [sections, setSections] = useState(initialSections);
  const [selectedSlug, setSelectedSlug] = useState(
    initialSections[0]?.slug ?? '',
  );
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const selectedSection = useMemo(
    () =>
      sections.find((section) => section.slug === selectedSlug) ?? sections[0],
    [sections, selectedSlug],
  );

  async function initialize() {
    setInitializing(true);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/context/initialize`,
      { method: 'POST' },
    );
    const result = (await response.json()) as {
      sections?: ContextSection[];
      error?: string;
    };
    setInitializing(false);
    if (!response.ok || !result.sections) {
      setError(result.error ?? 'Could not initialize Product Context.');
      return;
    }
    setSections(result.sections);
    setSelectedSlug(result.sections[0]?.slug ?? '');
  }

  if (sections.length === 0) {
    return (
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-5 py-12 lg:px-8">
        <div className="w-full rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary">
            <FolderPlus className="size-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Initialize Product Context
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Create the fixed Product, Design, Engineering, Milestones,
            References, and Other folders with README guidance for people and
            agents.
          </p>
          <Button
            className="mt-6"
            size="lg"
            onClick={initialize}
            disabled={initializing}
          >
            <FolderPlus />{' '}
            {initializing ? 'Initializing…' : 'Create context structure'}
          </Button>
          {error ? (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Product context
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">
          Context library
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Select a section to read its purpose and Agent loading guidance. The
          folder structure is the source of truth.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <ul
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
          aria-label="Context sections"
        >
          {sections.map((section) => {
            const selected = selectedSection?.slug === section.slug;
            return (
              <li key={section.slug}>
                <button
                  type="button"
                  onClick={() => setSelectedSlug(section.slug)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition',
                    selected
                      ? 'bg-secondary text-secondary-foreground'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <Folder
                    className={cn(
                      'size-4 shrink-0',
                      selected ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{section.title}</p>
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                      {section.summary}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <article className="min-h-[560px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/5%)]">
          <header className="flex items-center gap-3 border-b border-border px-6 py-4">
            <div className="grid size-9 place-items-center rounded-xl bg-secondary">
              <BookOpen className="size-4" />
            </div>
            <div>
              <p className="font-medium">{selectedSection?.title}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3" />
                context/{selectedSection?.slug}/README.md
              </p>
            </div>
          </header>
          <div className="px-6 py-7 sm:px-9 sm:py-9">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-5 text-3xl font-semibold tracking-tight">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mt-8 mb-3 text-lg font-semibold">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-6 mb-2 font-semibold">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="my-3 text-sm leading-7 text-foreground/78">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="my-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground/78">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-foreground/78">
                    {children}
                  </ol>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    {children}
                  </a>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-5 border-l-2 border-foreground/25 pl-4 text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]">
                    {children}
                  </code>
                ),
                table: ({ children }) => (
                  <div className="my-5 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-border bg-secondary px-3 py-2 text-left font-medium">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-border px-3 py-2">{children}</td>
                ),
              }}
            >
              {selectedSection?.markdown ?? ''}
            </ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}
