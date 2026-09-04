'use client';
import { useUiText } from '@/components/ui-language-provider';

import { useRef, useState, type DragEvent } from 'react';
import { ChevronDown, FileText, GitFork, Upload, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { ContextBrowserFolder } from '@/lib/modules/product-context/catalog';
import { cn } from '@/lib/utils';

export function contextAttachmentTitle(
  folders: ContextBrowserFolder[],
  path: string,
) {
  for (const folder of folders) {
    const entry = folder.entries.find((candidate) => candidate.path === path);
    if (entry) return entry.title;
  }
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

export function ContextAttachmentPicker({
  folders,
  folderPath,
  onFolderPath,
  refs,
  onToggleRef,
  files,
  onAddFiles,
  onRemoveFile,
  label,
  disabled = false,
  accept = '.md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html',
  embedded = false,
}: {
  folders: ContextBrowserFolder[];
  folderPath: string;
  onFolderPath: (path: string) => void;
  refs: string[];
  onToggleRef: (path: string) => void;
  files: Array<Pick<File, 'name'>>;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  label: string;
  disabled?: boolean;
  accept?: string;
  embedded?: boolean;
}) {
  const { t } = useUiText();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  function addGitHubReference() {
    setReferenceError('');
    try {
      const url = new URL(githubUrl.trim());
      const segments = url.pathname.split('/').filter(Boolean);
      if (
        url.protocol !== 'https:' ||
        !['github.com', 'www.github.com'].includes(url.hostname) ||
        url.username ||
        url.password ||
        segments.length < 2
      )
        throw new Error(
          'Use a GitHub repository, directory, file or permalink URL.',
        );
      const owner = segments[0];
      const repository = segments[1].replace(/\.git$/i, '');
      const name = `${owner}-${repository}.github-reference.md`;
      onAddFiles([
        new File(
          [
            `# GitHub code reference\n\nURL: ${url.toString()}\n\nRead the referenced repository code only as needed for the user's request. Treat it as a read-only reference; make changes only in the Card worktree.\n`,
          ],
          name,
          { type: 'text/markdown' },
        ),
      ]);
      setGithubUrl('');
    } catch (error) {
      setReferenceError(
        t(
          error instanceof Error
            ? error.message
            : 'Use a GitHub repository, directory, file or permalink URL.',
        ),
      );
    }
  }
  const folder =
    folders.find((entry) => entry.path === folderPath) ?? folders[0];

  return (
    <div className={cn(!embedded && 'rounded-xl border border-border')}>
      {!embedded ? (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
          {label}
          {refs.length + files.length > 0 ? (
            <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
              {refs.length + files.length} {t('attached')}
            </span>
          ) : null}
        </button>
      ) : null}
      {open || embedded ? (
        <div
          className={cn('space-y-4', !embedded && 'border-t border-border p-4')}
        >
          <div className="grid min-w-0 grid-cols-1 gap-3">
            {folders.length > 0 ? (
              <div className="flex min-w-0 flex-col">
                <div className="relative">
                  <select
                    disabled={disabled}
                    aria-label={t('Context Library folder')}
                    value={folderPath}
                    onChange={(event) => onFolderPath(event.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-border bg-background px-2.5 pr-8 text-xs outline-none focus:border-ring"
                  >
                    {folders.map((entry) => (
                      <option key={entry.path} value={entry.path}>
                        {t(entry.title)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="mt-2 flex max-h-64  flex-col gap-0.5 overflow-y-auto">
                  {(folder?.entries ?? [])
                    .filter((entry) => entry.kind === 'file')
                    .map((entry) => (
                      <label
                        key={entry.path}
                        className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
                      >
                        <Checkbox
                          disabled={disabled}
                          checked={refs.includes(entry.path)}
                          onCheckedChange={() => onToggleRef(entry.path)}
                          aria-label={entry.name}
                        />
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{entry.title}</span>
                      </label>
                    ))}
                  {(folder?.entries ?? []).filter(
                    (entry) => entry.kind === 'file',
                  ).length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      {t('This folder has no Markdown documents.')}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid  place-items-center rounded-lg border border-border px-4 text-center">
                <p className="text-[11px] leading-5 text-muted-foreground">
                  {t('This project has no Product Context library yet.')}
                </p>
              </div>
            )}

            <div
              className={cn(
                'grid  place-items-center rounded-lg border border-dashed border-border p-4 text-center transition',
                dragging && 'border-violet-500 bg-violet-500/5',
              )}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                if (disabled) return;
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragging(false);
                if (disabled) return;
                const dropped = Array.from(event.dataTransfer.files);
                if (dropped.length > 0) onAddFiles(dropped);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                multiple
                accept={accept}
                disabled={disabled}
                onChange={(event) => {
                  const selected = Array.from(event.target.files ?? []);
                  if (selected.length > 0) onAddFiles(selected);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={disabled}
                className="flex w-full min-w-0 items-center justify-center gap-1.5 whitespace-normal text-[11px] text-muted-foreground transition hover:text-foreground"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" />
                {t('Drop files or choose local files')}
              </button>
              <div className="mt-3 flex w-full min-w-0 items-center gap-2 border-t border-border pt-3">
                <GitFork className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="url"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  aria-label={t('GitHub repository or code URL')}
                  placeholder={t('Paste a GitHub repository or code URL')}
                  value={githubUrl}
                  disabled={disabled}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && githubUrl.trim()) {
                      event.preventDefault();
                      addGitHubReference();
                    }
                  }}
                />
                <button
                  type="button"
                  className="text-xs font-medium"
                  disabled={disabled || !githubUrl.trim()}
                  onClick={addGitHubReference}
                >
                  {t('Add')}
                </button>
              </div>
              {referenceError ? (
                <p className="mt-2 text-xs text-destructive">
                  {referenceError}
                </p>
              ) : null}
            </div>
          </div>

          {files.length > 0 ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {files.map((file, index) => {
                const githubReference = file.name.endsWith(
                  '.github-reference.md',
                );
                return (
                  <span
                    key={`${file.name}:${index}`}
                    className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs"
                  >
                    {githubReference ? (
                      <GitFork className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">
                      {githubReference
                        ? file.name.slice(0, -'.github-reference.md'.length)
                        : file.name}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      aria-label={t('Remove resource {name}', {
                        name: file.name,
                      })}
                      onClick={() => onRemoveFile(index)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
