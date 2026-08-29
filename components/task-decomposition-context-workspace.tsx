'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import {
  ArrowLeft,
  Braces,
  FileJson,
  FileText,
  Paperclip,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type {
  TaskDecompositionAttachment,
  TaskDecompositionContext,
} from '@/lib/task-decomposition-context';
import { cn } from '@/lib/utils';

type AttachmentPreview = {
  fileName: string;
  format: 'markdown' | 'json';
  content: string;
};

export function TaskDecompositionContextWorkspace({
  projectId,
  initialContext,
}: {
  projectId: string;
  initialContext: TaskDecompositionContext;
}) {
  const [context, setContext] = useState(initialContext);
  const [instructions, setInstructions] = useState(initialContext.instructions);
  const [savedInstructions, setSavedInstructions] = useState(
    initialContext.instructions,
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [previewing, setPreviewing] = useState('');
  const [deleteCandidate, setDeleteCandidate] =
    useState<TaskDecompositionAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty = instructions !== savedInstructions;

  async function saveInstructions() {
    setSaving(true);
    setMessage('');
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-context`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      },
    );
    const result = (await response.json()) as TaskDecompositionContext & {
      error?: string;
    };
    setSaving(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not save the instructions.');
      return;
    }
    setContext(result);
    setSavedInstructions(result.instructions);
    setMessage('Instructions saved.');
  }

  async function addAttachments(files: File[]) {
    if (files.length === 0) return;
    const supportedFiles = files.filter((file) =>
      /\.(md|markdown|json)$/i.test(file.name),
    );
    if (supportedFiles.length !== files.length) {
      setError('Only Markdown and JSON context attachments are supported.');
      return;
    }
    setUploading(true);
    setMessage('');
    setError('');
    const formData = new FormData();
    for (const file of supportedFiles) formData.append('files', file);
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-context`,
      { method: 'POST', body: formData },
    );
    const result = (await response.json()) as TaskDecompositionContext & {
      error?: string;
      conflicts?: string[];
    };
    setUploading(false);
    if (!response.ok) {
      const conflictDetail = result.conflicts?.join(', ');
      setError(
        conflictDetail
          ? `Already attached: ${conflictDetail}. Remove it before adding a replacement.`
          : (result.error ?? 'Could not add the context attachments.'),
      );
      return;
    }
    setContext(result);
    setMessage(
      `${supportedFiles.length} ${supportedFiles.length === 1 ? 'attachment' : 'attachments'} added.`,
    );
  }

  async function openAttachment(attachment: TaskDecompositionAttachment) {
    setPreviewing(attachment.fileName);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-context?fileName=${encodeURIComponent(attachment.fileName)}`,
    );
    const result = (await response.json()) as AttachmentPreview & {
      error?: string;
    };
    setPreviewing('');
    if (!response.ok) {
      setError(result.error ?? 'Could not read the context attachment.');
      return;
    }
    setPreview(result);
  }

  async function deleteAttachment() {
    if (!deleteCandidate) return;
    setDeleting(true);
    setMessage('');
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/decomposition-context`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: deleteCandidate.fileName }),
      },
    );
    const result = (await response.json()) as TaskDecompositionContext & {
      error?: string;
    };
    setDeleting(false);
    if (!response.ok) {
      setError(result.error ?? 'Could not remove the context attachment.');
      return;
    }
    setContext(result);
    setDeleteCandidate(null);
    setMessage('Attachment removed.');
  }

  function dropFiles(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void addAttachments(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <header className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/projects/${projectId}/decomposition`}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Task canvas
          </Link>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Task decomposition
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">
            Context
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Add project-specific guidance and reference files that should be
            available whenever this feature asks an Agent to decompose work.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'size-2 rounded-full',
              context.initialized ? 'bg-emerald-500' : 'bg-border',
            )}
          />
          {context.initialized ? 'Context ready' : 'Not configured'}
        </div>
      </header>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/4%)]">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold">Instructions</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                User-owned constraints and preferences. The feature Harness is
                separate and will not overwrite this file.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-secondary-foreground">
              instructions.md
            </span>
          </div>
          <div className="p-5 sm:p-6">
            <Textarea
              value={instructions}
              maxLength={100_000}
              aria-label="Task Decomposition instructions"
              placeholder="Describe project-specific constraints, preferred task size, naming conventions, acceptance expectations, or anything the Agent should account for while decomposing work."
              onChange={(event) => {
                setInstructions(event.target.value);
                setMessage('');
              }}
              className="min-h-[430px] resize-y font-mono text-[13px] leading-6"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-muted-foreground">
                {instructions.length.toLocaleString()} / 100,000 characters
              </p>
              <Button
                type="button"
                disabled={!dirty || saving}
                onClick={saveInstructions}
              >
                <Save /> {saving ? 'Saving…' : 'Save instructions'}
              </Button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/4%)]">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4" />
                <h2 className="text-sm font-semibold">Attachments</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Markdown and JSON references owned by this feature context.
              </p>
            </div>
            <div className="p-4">
              <button
                type="button"
                className={cn(
                  'flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-4 text-center transition hover:bg-muted/40',
                  dragging && 'border-foreground bg-secondary',
                )}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={dropFiles}
              >
                <Upload className="size-4" />
                <span className="mt-2 text-xs font-medium">
                  {uploading ? 'Adding…' : 'Drop files or choose attachments'}
                </span>
                <span className="mt-1 text-[10px] text-muted-foreground">
                  Markdown or JSON · 2 MB each
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.json,text/markdown,application/json"
                multiple
                hidden
                onChange={(event) => {
                  void addAttachments(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />

              {context.attachments.length > 0 ? (
                <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {context.attachments.map((attachment) => (
                    <li
                      key={attachment.fileName}
                      className="flex items-center gap-2 px-2 py-2"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted"
                        disabled={previewing === attachment.fileName}
                        onClick={() => openAttachment(attachment)}
                      >
                        {attachment.format === 'json' ? (
                          <FileJson className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {previewing === attachment.fileName
                              ? 'Opening…'
                              : attachment.fileName}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {formatBytes(attachment.size)}
                          </span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${attachment.fileName}`}
                        title="Remove attachment"
                        onClick={() => setDeleteCandidate(attachment)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-xs leading-5 text-muted-foreground">
                  No attachments yet. Instructions can be used on their own.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-[color-mix(in_oklch,var(--background),var(--foreground)_2%)] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <h2 className="text-sm font-semibold">Harness boundary</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              AgentManager’s feature-level generation contract will be designed
              separately. It will consume this user context but remain
              independently versioned and replaceable.
            </p>
          </section>
        </div>
      </div>

      {message ? (
        <output className="mt-5 block text-xs text-emerald-700">
          {message}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-5xl"
        >
          {preview?.format === 'markdown' ? (
            <MarkdownReader
              title={preview.fileName}
              filePath={`task-decomposition/attachments/${preview.fileName}`}
              markdown={preview.content}
              onClose={() => setPreview(null)}
              showFocusButton={false}
              className="min-h-[70vh] border-0 shadow-none"
            />
          ) : preview ? (
            <article className="min-h-[70vh] overflow-hidden rounded-xl bg-card">
              <header className="flex items-center gap-3 border-b border-border px-6 py-4">
                <div className="grid size-9 place-items-center rounded-xl bg-secondary">
                  <Braces className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{preview.fileName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    task-decomposition/attachments/{preview.fileName}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  aria-label="Close JSON preview"
                  title="Close"
                  onClick={() => setPreview(null)}
                >
                  <X />
                </Button>
              </header>
              <pre className="max-h-[calc(88vh-80px)] overflow-auto p-6 font-mono text-xs leading-6 whitespace-pre-wrap break-words sm:p-8">
                {formatJson(preview.content)}
              </pre>
            </article>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteCandidate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove context attachment?</DialogTitle>
            <DialogDescription>
              {deleteCandidate?.fileName} will be deleted from this project’s
              Task Decomposition context folder.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteCandidate(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={deleteAttachment}
            >
              <Trash2 /> {deleting ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
}

function formatJson(content: string) {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}
