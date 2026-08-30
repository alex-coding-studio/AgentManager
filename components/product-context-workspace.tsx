'use client';
import { useUiText } from '@/components/ui-language-provider';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  const { t } = useUiText();
  const [sections, setSections] = useState(initialSections);
  const [selectedSlug, setSelectedSlug] = useState(
    initialSections[0]?.slug ?? '',
  );
  const [selectedFileName, setSelectedFileName] = useState(
    initialSections[0]?.documents[0]?.fileName ?? '',
  );
  const [initializing, setInitializing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    files: File[];
    conflicts: string[];
  }>();
  const [documentTitle, setDocumentTitle] = useState('');
  const [folderName, setFolderName] = useState('');
  const [renameFolderName, setRenameFolderName] = useState('');
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

  async function createFolder(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/context/sections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: folderName.trim() }),
      },
    );
    const result = (await response.json()) as {
      slug?: string;
      sections?: ContextSection[];
      error?: string;
    };
    setCreatingFolder(false);
    if (!response.ok || !result.sections || !result.slug) {
      setError(result.error ?? 'Could not create the folder.');
      return;
    }
    setSections(result.sections);
    setSelectedSlug(result.slug);
    setSelectedFileName('');
    setFolderOpen(false);
    setFolderName('');
  }

  async function renameFolder(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSection || !renameFolderName.trim()) return;
    setRenamingFolder(true);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/context/sections`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: selectedSection.slug,
          title: renameFolderName.trim(),
        }),
      },
    );
    const result = (await response.json()) as {
      slug?: string;
      sections?: ContextSection[];
      error?: string;
    };
    setRenamingFolder(false);
    if (!response.ok || !result.sections || !result.slug) {
      setError(result.error ?? 'Could not rename the folder.');
      return;
    }
    setSections(result.sections);
    setSelectedSlug(result.slug);
    setRenameOpen(false);
    setRenameFolderName('');
  }

  async function importFiles(files: File[], overwrite = false) {
    if (!selectedSection || files.length === 0) return;
    setAdding(true);
    setError('');
    const formData = new FormData();
    formData.set('section', selectedSection.slug);
    if (overwrite) formData.set('overwrite', 'true');
    for (const file of files) formData.append('files', file);
    const response = await fetch(
      `/api/projects/${projectId}/context/documents`,
      { method: 'POST', body: formData },
    );
    const result = (await response.json()) as {
      created?: string[];
      sections?: ContextSection[];
      conflicts?: string[];
      error?: string;
    };
    setAdding(false);
    if (response.status === 409 && result.conflicts?.length) {
      setPendingImport({ files, conflicts: result.conflicts });
      return;
    }
    if (!response.ok || !result.sections || !result.created?.length) {
      setError(result.error ?? 'Could not import the document.');
      return;
    }
    setSections(result.sections);
    setSelectedFileName(result.created[0]);
    setPendingImport(undefined);
    return true;
  }

  async function deleteDocument() {
    if (!selectedSection || !selectedDocument) return;
    setDeleting(true);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/context/documents`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: selectedSection.slug,
          fileName: selectedDocument.fileName,
        }),
      },
    );
    const result = (await response.json()) as {
      sections?: ContextSection[];
      error?: string;
    };
    setDeleting(false);
    if (!response.ok || !result.sections) {
      setError(result.error ?? 'Could not delete the document.');
      return;
    }
    const nextSection = result.sections.find(
      (section) => section.slug === selectedSection.slug,
    );
    setSections(result.sections);
    setSelectedFileName(nextSection?.documents[0]?.fileName ?? '');
    setDeleteOpen(false);
  }

  async function dropFiles(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    await importFiles(Array.from(event.dataTransfer.files));
  }

  async function revealSection(section: string) {
    const response = await fetch(`/api/projects/${projectId}/context/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error ?? 'Could not open the folder.');
    }
  }

  async function revealSelectedSection() {
    if (!selectedSection) return;
    await revealSection(selectedSection.slug);
  }

  if (sections.length === 0) {
    return (
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-5 py-12 lg:px-8">
        <div className="w-full rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary">
            <FolderPlus className="size-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {t('Initialize Product Context')}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            {t(
              'Create the fixed Product, Design, Engineering, Milestones, References, and Other folders with README guidance for people and agents.',
            )}
          </p>
          <Button
            className="mt-6"
            size="lg"
            onClick={initialize}
            disabled={initializing}
          >
            <FolderPlus />{' '}
            {initializing ? t('Initializing…') : t('Create context structure')}
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
          {t('Product context')}
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">
          {t('Context library')}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t(
            'Select a section to read its purpose and Agent loading guidance. The folder structure is the source of truth.',
          )}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <ul
            className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
            aria-label={t('Context sections')}
          >
            {sections.map((section) => {
              const selected = selectedSection?.slug === section.slug;
              return (
                <li
                  key={section.slug}
                  className={cn(
                    'group flex items-center',
                    selected && 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="ml-2"
                    aria-label={`Open ${section.title} folder in file manager`}
                    title={t('Show in file manager')}
                    onClick={() => {
                      void revealSection(section.slug).catch((error) => {
                        setError(
                          error instanceof Error
                            ? error.message
                            : 'Could not open the folder.',
                        );
                      });
                    }}
                  >
                    <Folder />
                  </Button>
                  <button
                    type="button"
                    aria-label={`Read ${section.title} context`}
                    onClick={() => selectSection(section)}
                    className={cn(
                      'flex min-h-14 min-w-0 flex-1 items-center px-2 py-2.5 text-left transition',
                      !selected && 'hover:bg-muted/50',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{section.title}</p>
                      <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                        {section.summary}
                      </p>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                    aria-label={`Rename ${section.title} folder`}
                    title={t('Rename folder')}
                    onClick={() => {
                      selectSection(section);
                      setRenameFolderName(section.slug);
                      setRenameOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </li>
              );
            })}
          </ul>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex h-10 items-center border-b border-border px-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('Documents')}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto"
                      aria-label={t('Add document')}
                      title={t('Add document')}
                    />
                  }
                >
                  <Plus />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setFolderOpen(true)}>
                    <FolderPlus /> {t('New Folder')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                    <FilePlus2 /> {t('New Markdown')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload /> {t('Import Markdown')}
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
              {adding ? t('Adding…') : t('Drop Markdown or choose files')}
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

        {selectedDocument ? (
          <MarkdownReader
            title={selectedDocument.title}
            filePath={`context/${selectedSection?.slug}/${selectedDocument.fileName}`}
            markdown={selectedDocument.markdown}
            onReveal={revealSelectedSection}
            onDelete={() => setDeleteOpen(true)}
            deleting={deleting}
          />
        ) : (
          <section className="grid min-h-[560px] place-items-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div>
              <div className="mx-auto grid size-10 place-items-center rounded-xl bg-secondary">
                <FileText className="size-4" />
              </div>
              <h2 className="mt-4 text-sm font-medium">
                {t('No Markdown documents')}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('Add or import a document for this folder.')}
              </p>
            </div>
          </section>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createDocument}>
            <DialogHeader>
              <DialogTitle>{t('New Markdown document')}</DialogTitle>
              <DialogDescription>
                {t('Create a readable Markdown file inside')}
                {selectedSection?.title}.
              </DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-2">
              <label htmlFor="document-title" className="text-xs font-medium">
                {t('Document title')}
              </label>
              <Input
                id="document-title"
                value={documentTitle}
                maxLength={120}
                placeholder="Product Foundation"
                onChange={(event) => setDocumentTitle(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'The title becomes an English slug such as product-foundation.md.',
                )}
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!documentTitle.trim() || adding}>
                {adding ? t('Creating…') : t('Create document')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <form onSubmit={createFolder}>
            <DialogHeader>
              <DialogTitle>{t('New context folder')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Create a flexible Product Context section. A README can be added later.',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-2">
              <label htmlFor="folder-name" className="text-xs font-medium">
                {t('Folder name')}
              </label>
              <Input
                id="folder-name"
                value={folderName}
                maxLength={80}
                placeholder="Research Notes"
                onChange={(event) => setFolderName(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('The name becomes an English slug such as research-notes.')}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!folderName.trim() || creatingFolder}
              >
                {creatingFolder ? t('Creating…') : t('Create folder')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={renameFolder}>
            <DialogHeader>
              <DialogTitle>{t('Rename context folder')}</DialogTitle>
              <DialogDescription>
                {t('Rename the folder on disk without changing its documents.')}
              </DialogDescription>
            </DialogHeader>
            <div className="my-5 space-y-2">
              <label
                htmlFor="rename-folder-name"
                className="text-xs font-medium"
              >
                {t('Folder name')}
              </label>
              <Input
                id="rename-folder-name"
                value={renameFolderName}
                maxLength={80}
                onChange={(event) => setRenameFolderName(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('The folder path uses an English slug.')}
              </p>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={!renameFolderName.trim() || renamingFolder}
              >
                {renamingFolder ? t('Renaming…') : t('Rename folder')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('Delete')}
              {selectedDocument?.fileName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('This removes the Markdown file from the project. The')}{' '}
              {selectedSection?.title} {t('folder will remain.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={deleteDocument}
            >
              {deleting ? t('Deleting…') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingImport)}
        onOpenChange={(open) => {
          if (!open && !adding) setPendingImport(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Upload />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {t('Replace existing documents?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingImport?.conflicts.join(', ')} {t('already')}{' '}
              {pendingImport?.conflicts.length === 1 ? 'exists' : 'exist'}{' '}
              {t('in this folder. Importing will replace the existing')}{' '}
              {pendingImport?.conflicts.length === 1 ? 'file' : 'files'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adding}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={adding}
              onClick={() => {
                if (pendingImport) {
                  void importFiles(pendingImport.files, true);
                }
              }}
            >
              {adding ? t('Replacing…') : t('Replace')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
