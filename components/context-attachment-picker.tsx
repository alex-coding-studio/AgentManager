'use client';
import { useUiText } from '@/components/ui-language-provider';

import { useRef, useState, type DragEvent } from 'react';
import { ChevronDown, FileText, Upload, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { ContextBrowserFolder } from '@/lib/product-context';
import { cn } from '@/lib/utils';

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
  accept = '.md,.markdown',
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
}) {
  const { t } = useUiText();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folder =
    folders.find((entry) => entry.path === folderPath) ?? folders[0];

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', open && 'rotate-180')}
        />
        {label}
        {refs.length + files.length > 0 ? (
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            {refs.length + files.length} {t('attached')}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {folders.length > 0 ? (
              <div className="flex flex-col">
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
                <div className="mt-2 flex max-h-64 min-h-[8.5rem] flex-col gap-0.5 overflow-y-auto">
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
              <div className="grid min-h-[8.5rem] place-items-center rounded-lg border border-border px-4 text-center">
                <p className="text-[11px] leading-5 text-muted-foreground">
                  {t('This project has no Product Context library yet.')}
                </p>
              </div>
            )}

            <div
              className={cn(
                'grid min-h-[8.5rem] place-items-center rounded-lg border border-dashed border-border p-4 text-center transition',
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
                onAddFiles(
                  [...event.dataTransfer.files].filter((file) =>
                    accept
                      .split(',')
                      .some((extension) =>
                        file.name
                          .toLowerCase()
                          .endsWith(extension.trim().toLowerCase()),
                      ),
                  ),
                );
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept={accept}
                disabled={disabled}
                multiple
                className="hidden"
                onChange={(event) => {
                  onAddFiles([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={disabled}
                className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" />
                {t('Drop Markdown files here, or browse')}
              </button>
            </div>
          </div>

          {files.length > 0 ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {files.map((file, index) => (
                <span
                  key={`${file.name}:${index}`}
                  className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs"
                >
                  <FileText className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
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
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
