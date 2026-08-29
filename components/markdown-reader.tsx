'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  BookOpen,
  FileText,
  FolderOpen,
  Maximize2,
  MessageSquarePlus,
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
  showFocusButton = true,
  deleting = false,
  onAddFeedback,
  compact = false,
  className,
}: {
  title: string;
  filePath: string;
  markdown: string;
  onReveal?: () => Promise<void>;
  onDelete?: () => void;
  onClose?: () => void;
  showFocusButton?: boolean;
  deleting?: boolean;
  onAddFeedback?: (selection: MarkdownFeedbackSelection) => void;
  compact?: boolean;
  className?: string;
}) {
  const [focusMode, setFocusMode] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [selection, setSelection] = useState<MarkdownFeedbackSelection | null>(
    null,
  );
  const contentRef = useRef<HTMLDivElement>(null);

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

  const captureSelection = useEffectEvent(() => {
    if (!onAddFeedback || !contentRef.current) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || selected.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
    }
    const start = closestPositionedElement(range.startContainer);
    const end = closestPositionedElement(range.endContainer);
    const excerpt = selected.toString().trim();
    const startLine = Number(start?.dataset.lineStart);
    const endLine = Number(end?.dataset.lineEnd);
    if (!excerpt || !Number.isFinite(startLine) || !Number.isFinite(endLine)) {
      setSelection(null);
      return;
    }
    setSelection({
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      excerpt: excerpt.slice(0, 1_200),
    });
  });

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !onAddFeedback) return;
    content.addEventListener('mouseup', captureSelection);
    document.addEventListener('selectionchange', captureSelection);
    return () => {
      content.removeEventListener('mouseup', captureSelection);
      document.removeEventListener('selectionchange', captureSelection);
    };
  }, [onAddFeedback]);

  const reader = (
    <article
      className={cn(
        'min-w-0 overflow-hidden border border-border bg-card shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/5%)]',
        focusMode
          ? 'flex h-[min(88vh,960px)] w-full flex-col rounded-2xl sm:w-[80vw] sm:max-w-6xl'
          : compact
            ? 'rounded-xl'
            : 'min-h-[560px] rounded-2xl',
        className,
      )}
    >
      <header
        className={cn(
          'flex shrink-0 items-center gap-3 border-b border-border',
          compact ? 'sticky top-0 z-10 bg-card px-4 py-3' : 'px-6 py-4',
        )}
      >
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
          {onAddFeedback ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Add feedback from selected text"
              title={selection ? 'Add feedback' : 'Select text to add feedback'}
              disabled={!selection}
              onClick={() => {
                if (!selection) return;
                onAddFeedback(selection);
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }}
            >
              <MessageSquarePlus />
            </Button>
          ) : null}
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
          {showFocusButton ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                focusMode ? 'Exit focus reading' : 'Open focus reading'
              }
              aria-pressed={focusMode}
              title={focusMode ? 'Exit focus mode (Esc)' : 'Open focus mode'}
              onClick={() => setFocusMode((current) => !current)}
            >
              {focusMode ? <Minimize2 /> : <Maximize2 />}
            </Button>
          ) : null}
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
        ref={contentRef}
        className={cn(
          'relative min-w-0 px-6 py-7 sm:px-9 sm:py-9',
          compact && 'px-4 py-4 sm:px-4 sm:py-4',
          focusMode && 'mx-auto w-full max-w-4xl flex-1 overflow-y-auto',
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            h1: ({ children, node }) => (
              <h1
                {...sourcePosition(node)}
                className="mb-5 text-3xl font-semibold tracking-tight"
              >
                {children}
              </h1>
            ),
            h2: ({ children, node }) => (
              <h2
                {...sourcePosition(node)}
                className="mt-8 mb-3 text-lg font-semibold"
              >
                {children}
              </h2>
            ),
            h3: ({ children, node }) => (
              <h3 {...sourcePosition(node)} className="mt-6 mb-2 font-semibold">
                {children}
              </h3>
            ),
            p: ({ children, node }) => (
              <div className="group/feedback relative">
                <p
                  {...sourcePosition(node)}
                  className="my-3 pr-8 text-sm leading-7 text-foreground/78"
                >
                  {children}
                </p>
                {onAddFeedback ? (
                  <FeedbackButton
                    node={node}
                    excerpt={childrenText(children)}
                    onAddFeedback={onAddFeedback}
                  />
                ) : null}
              </div>
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
            li: ({ children, node }) => (
              <li
                {...sourcePosition(node)}
                className="group/feedback relative pr-8"
              >
                {children}
                {onAddFeedback ? (
                  <FeedbackButton
                    node={node}
                    excerpt={childrenText(children)}
                    onAddFeedback={onAddFeedback}
                  />
                ) : null}
              </li>
            ),
            blockquote: ({ children, node }) => (
              <blockquote
                {...sourcePosition(node)}
                className="my-5 border-l-2 border-foreground/25 pl-4 text-muted-foreground"
              >
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
        {selection ? (
          <div className="sticky bottom-3 mt-5 flex justify-end">
            <Button
              type="button"
              size="sm"
              className="shadow-lg"
              onClick={() => {
                onAddFeedback?.(selection);
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }}
            >
              Add feedback · lines {selection.startLine}–{selection.endLine}
            </Button>
          </div>
        ) : null}
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

export type MarkdownFeedbackSelection = {
  startLine: number;
  endLine: number;
  excerpt: string;
};

function sourcePosition(
  node:
    | {
        position?: {
          start: { line: number };
          end: { line: number };
        };
      }
    | undefined,
) {
  return {
    'data-line-start': node?.position?.start.line,
    'data-line-end': node?.position?.end.line,
  };
}

function closestPositionedElement(node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  return element?.closest<HTMLElement>('[data-line-start]') ?? null;
}

function FeedbackButton({
  node,
  excerpt,
  onAddFeedback,
}: {
  node:
    | {
        position?: {
          start: { line: number };
          end: { line: number };
        };
      }
    | undefined;
  excerpt: string;
  onAddFeedback: (selection: MarkdownFeedbackSelection) => void;
}) {
  const startLine = node?.position?.start.line;
  const endLine = node?.position?.end.line;
  if (!startLine || !endLine || !excerpt.trim()) return null;
  return (
    <button
      type="button"
      className="absolute top-1 right-0 grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground group-hover/feedback:opacity-100 focus:opacity-100"
      aria-label={`Add feedback for lines ${startLine} to ${endLine}`}
      title="Add feedback"
      onClick={() =>
        onAddFeedback({
          startLine,
          endLine,
          excerpt: excerpt.trim().slice(0, 1_200),
        })
      }
    >
      <MessageSquarePlus className="size-3.5" />
    </button>
  );
}

function childrenText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(childrenText).join('');
  if (value && typeof value === 'object' && 'props' in value) {
    const element = value as { props?: { children?: ReactNode } };
    return childrenText(element.props?.children);
  }
  return '';
}
