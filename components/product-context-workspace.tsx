'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Plus,
  Upload,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
  const [selectedFileName, setSelectedFileName] = useState(
    initialSections[0]?.documents[0]?.fileName ?? '',
  );
  const [initializing, setInitializing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedSection = useMemo(
    () =>
      sections.find((section) => section.slug === selectedSlug) ?? sections[0],
    [sections, selectedSlug],
  );
  const selectedDocument = useMemo(
    () =>
      selectedSection?.documents.find(
        (document) => document.fileName === selectedFileName,
      ) ?? selectedSection?.documents[0],
    [selectedFileName, selectedSection],
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
    setSelectedFileName(result.sections[0]?.documents[0]?.fileName ?? '');
  }

  function selectSection(section: ContextSection) {
    setSelectedSlug(section.slug);
    setSelectedFileName(section.documents[0]?.fileName ?? '');
    setError('');
  }

  async function addDocument(requestBody: BodyInit, headers?: HeadersInit) {
    if (!selectedSection) return;
    setAdding(true);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/context/documents`,
      { method: 'POST', headers, body: requestBody },
    );
    const result = (await response.json()) as {
      created?: string[];
      sections?: ContextSection[];
      error?: string;
    };
    setAdding(false);
    if (!response.ok || !result.sections || !result.created?.length) {
      setError(result.error ?? 'Could not add the document.');
      return;
    }
    setSections(result.sections);
    setSelectedFileName(result.created[0]);
    return true;
  }

  async function createDocument(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSection || !documentTitle.trim()) return;
    const created = await addDocument(
      JSON.stringify({
        section: selectedSection.slug,
        title: documentTitle.trim(),
      }),
      { 'Content-Type': 'application/json' },
    );
    if (created) {
      setCreateOpen(false);
      setDocumentTitle('');
    }
  }

  async function importFiles(files: File[]) {
    if (!selectedSection || files.length === 0) return;
    const formData = new FormData();
    formData.set('section', selectedSection.slug);
    for (const file of files) formData.append('files', file);
    await addDocument(formData);
  }

  async function dropFiles(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    await importFiles(Array.from(event.dataTransfer.files));
  }

  async function revealSelectedSection() {
    if (!selectedSection) return;
    const response = await fetch(`/api/projects/${projectId}/context/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: selectedSection.slug }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error ?? 'Could not open the folder.');
    }
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
        <div className="grid gap-4">
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
                    onClick={() => selectSection(section)}
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

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex h-10 items-center border-b border-border px-3">
              <p className="text-xs font-medium text-muted-foreground">
                Documents
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto"
                      aria-label="Add document"
                      title="Add document"
                    />
                  }
                >
                  <Plus />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                    <FilePlus2 /> New Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload /> Import Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <ul className="max-h-48 divide-y divide-border overflow-y-auto">
              {selectedSection?.documents.map((document) => {
                const selected =
                  selectedDocument?.fileName === document.fileName;
                return (
                  <li key={document.fileName}>
                    <button
                      type="button"
                      onClick={() => setSelectedFileName(document.fileName)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition',
                        selected ? 'bg-secondary' : 'hover:bg-muted/50',
                      )}
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {document.title}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {document.fileName}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              className={cn(
                'm-2 flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground transition',
                dragging && 'border-foreground bg-secondary text-foreground',
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={dropFiles}
              disabled={adding}
            >
              <Upload className="size-3.5" />
              {adding ? 'Adding…' : 'Drop Markdown or choose files'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              multiple
              hidden
              onChange={async (event) => {
                await importFiles(Array.from(event.target.files ?? []));
                event.target.value = '';
              }}
            />
          </section>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <MarkdownReader
          title={selectedDocument?.title ?? 'Markdown'}
          filePath={`context/${selectedSection?.slug}/${selectedDocument?.fileName}`}
          markdown={selectedDocument?.markdown ?? ''}
          onReveal={revealSelectedSection}
        />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createDocument}>
            <DialogHeader>
              <DialogTitle>New Markdown document</DialogTitle>
              <DialogDescription>
                Create a readable Markdown file inside {selectedSection?.title}.
              </DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-2">
              <label htmlFor="document-title" className="text-xs font-medium">
                Document title
              </label>
              <Input
                id="document-title"
                value={documentTitle}
                maxLength={120}
                placeholder="Product Foundation"
                onChange={(event) => setDocumentTitle(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                The title becomes an English slug such as product-foundation.md.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!documentTitle.trim() || adding}>
                {adding ? 'Creating…' : 'Create document'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
