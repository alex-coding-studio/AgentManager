'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  FileText,
  FolderOpen,
  Maximize2,
  Minimize2,
  Trash2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MarkdownReader({
  title,
  filePath,
  markdown,
  onReveal,
  onDelete,
  onClose,
  deleting = false,
  className,
}: {
  title: string;
  filePath: string;
  markdown: string;
  onReveal?: () => Promise<void>;
  onDelete?: () => void;
  onClose?: () => void;
  deleting?: boolean;
  className?: string;
}) {
  const [focusMode, setFocusMode] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setFocusMode(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [focusMode]);

  async function reveal() {
    if (!onReveal) return;
    setRevealing(true);
    setRevealError('');
    try {
      await onReveal();
    } catch (error) {
      setRevealError(
        error instanceof Error ? error.message : 'Could not open the folder.',
      );
    } finally {
      setRevealing(false);
    }
  }

  const reader = (
    <article
      className={cn(
        'min-w-0 overflow-hidden border border-border bg-card shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/5%)]',
        focusMode
          ? 'flex h-[min(88vh,960px)] w-full flex-col rounded-2xl sm:w-[80vw] sm:max-w-6xl'
          : 'min-h-[560px] rounded-2xl',
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
        <div className="grid size-9 place-items-center rounded-xl bg-secondary">
          <BookOpen className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <FileText className="size-3 shrink-0" />
            <span className="truncate">{filePath}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {onReveal ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Show README folder in file manager"
              title="Show in file manager"
              disabled={revealing}
              onClick={reveal}
            >
              <FolderOpen />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete Markdown document"
              title="Delete document"
              disabled={deleting}
              onClick={() => {
                setFocusMode(false);
                onDelete();
              }}
            >
              <Trash2 />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={focusMode ? 'Exit focus reading' : 'Open focus reading'}
            aria-pressed={focusMode}
            title={focusMode ? 'Exit focus mode (Esc)' : 'Open focus mode'}
            onClick={() => setFocusMode((current) => !current)}
          >
            {focusMode ? <Minimize2 /> : <Maximize2 />}
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close Markdown reader"
              title="Close"
              onClick={onClose}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </header>

      {revealError ? (
        <p
          role="alert"
          className="shrink-0 border-b border-border px-6 py-2 text-xs text-destructive"
        >
          {revealError}
        </p>
      ) : null}

      <div
        className={cn(
          'min-w-0 px-6 py-7 sm:px-9 sm:py-9',
          focusMode && 'mx-auto w-full max-w-4xl flex-1 overflow-y-auto',
        )}
      >
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
              <h2 className="mt-8 mb-3 text-lg font-semibold">{children}</h2>
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
            pre: ({ children }) => (
              <pre className="my-5 max-w-full overflow-x-auto rounded-xl bg-secondary p-4 font-mono text-sm leading-6 whitespace-pre-wrap break-words [&>code]:bg-transparent [&>code]:p-0">
                {children}
              </pre>
            ),
            code: ({ children }) => (
              <code className="break-words rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em]">
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
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );

  if (!focusMode) return reader;

  return (
    <dialog
      open
      aria-modal="true"
      aria-label={`${title} focus reader`}
      className="fixed inset-0 z-50 m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-black/45 p-4 backdrop-blur-[2px] sm:p-8"
    >
      <button
        type="button"
        aria-label="Close focus reading"
        className="absolute inset-0 cursor-default"
        onClick={() => setFocusMode(false)}
      />
      <div className="relative z-10">{reader}</div>
    </dialog>
  );
}
