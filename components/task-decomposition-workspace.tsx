'use client';

import Link from 'next/link';
import { useRef, useState, type DragEvent } from 'react';
import {
  Boxes,
  ChevronDown,
  FileText,
  Folder,
  Pencil,
  Plus,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ContextBrowserFolder } from '@/lib/product-context';
import type { TaskGraphNode } from '@/lib/task-graph';
import { cn } from '@/lib/utils';

export function TaskDecompositionWorkspace({
  projectId,
  folders,
  initialNodes,
}: {
  projectId: string;
  folders: ContextBrowserFolder[];
  initialNodes: TaskGraphNode[];
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [title, setTitle] = useState('');
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState(
    folders[0]?.path ?? '',
  );
  const [files, setFiles] = useState<File[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [retainedAttachmentRefs, setRetainedAttachmentRefs] = useState<
    string[]
  >([]);
  const [preview, setPreview] = useState<{
    title: string;
    path: string;
    markdown: string;
  } | null>(null);
  const [previewingPath, setPreviewingPath] = useState('');
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdId, setCreatedId] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFolder =
    folders.find((folder) => folder.path === selectedFolderPath) ?? folders[0];
  const availableSourceCount = folders.reduce(
    (count, folder) =>
      count + folder.entries.filter((entry) => entry.kind === 'file').length,
    0,
  );
  const sourceCount =
    selectedRefs.length + retainedAttachmentRefs.length + files.length;
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  function toggleSource(ref: string, selected: boolean) {
    setSelectedRefs((current) =>
      selected
        ? [...current, ref]
        : current.filter((candidate) => candidate !== ref),
    );
    setError('');
  }

  function addFiles(candidates: File[]) {
    const markdownFiles = candidates.filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    );
    if (markdownFiles.length !== candidates.length) {
      setError('Only Markdown source files can be added right now.');
    } else {
      setError('');
    }
    setFiles((current) => {
      const known = new Set(
        current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      );
      const additions = markdownFiles.filter(
        (file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`),
      );
      return [...current, ...additions].slice(0, 20);
    });
  }

  async function saveTask(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || sourceCount === 0) return;
    setCreating(true);
    setCreatedId('');
    setError('');
    const formData = new FormData();
    if (editingId) formData.set('id', editingId);
    formData.set('title', title.trim());
    for (const ref of selectedRefs) formData.append('contextRefs', ref);
    for (const ref of retainedAttachmentRefs) {
      formData.append('retainedAttachmentRefs', ref);
    }
    for (const file of files) formData.append('files', file);
    const response = await fetch(`/api/projects/${projectId}/nodes`, {
      method: editingId ? 'PATCH' : 'POST',
      body: formData,
    });
    const result = (await response.json()) as {
      node?: TaskGraphNode;
      nodes?: TaskGraphNode[];
      error?: string;
    };
    setCreating(false);
    if (!response.ok || !result.node || !result.nodes) {
      setError(
        result.error ??
          (editingId
            ? 'Could not update the start node.'
            : 'Could not create the start node.'),
      );
      return;
    }
    setNodes(result.nodes);
    setCreatedId(result.node.id);
    setSelectedNodeId(result.node.id);
    setTitle('');
    setSelectedRefs([]);
    setEditingId('');
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setFormOpen(false);
  }

  function editNode(node: TaskGraphNode) {
    setEditingId(node.id);
    setTitle(node.title);
    setSelectedRefs(
      node.resources
        .filter((resource) => resource.kind === 'context')
        .map((resource) => resource.path),
    );
    setRetainedAttachmentRefs(
      node.resources
        .filter((resource) => resource.kind === 'attachment')
        .map((resource) => resource.path),
    );
    setFiles([]);
    setCreatedId('');
    setError('');
    setSelectedNodeId('');
    setFormOpen(true);
  }

  function cancelEditing() {
    setEditingId('');
    setTitle('');
    setSelectedRefs([]);
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setError('');
    setFormOpen(false);
  }

  function createNode() {
    setEditingId('');
    setTitle('');
    setSelectedRefs([]);
    setRetainedAttachmentRefs([]);
    setFiles([]);
    setError('');
    setFormOpen(true);
  }

  async function previewResource(resourcePath: string) {
    setSelectedNodeId('');
    setPreviewingPath(resourcePath);
    setError('');
    const response = await fetch(
      `/api/projects/${projectId}/resources?path=${encodeURIComponent(resourcePath)}`,
    );
    const result = (await response.json()) as {
      fileName?: string;
      path?: string;
      markdown?: string;
      error?: string;
    };
    setPreviewingPath('');
    if (
      !response.ok ||
      !result.fileName ||
      !result.path ||
      result.markdown === undefined
    ) {
      setError(result.error ?? 'Could not read the source document.');
      return;
    }
    setPreview({
      title: result.fileName,
      path: result.path,
      markdown: result.markdown,
    });
  }

  function dropFiles(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <header className="flex shrink-0 items-end justify-between gap-6 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Task decomposition
          </p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">
            Task canvas
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Capture independent starting points, then decompose them into Task
            nodes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-foreground" />
            {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
          </div>
          <Button type="button" onClick={createNode}>
            <Plus /> New start node
          </Button>
          <Link
            href={`/projects/${projectId}/decomposition/context`}
            className={buttonVariants({ variant: 'outline' })}
          >
            <SlidersHorizontal /> Context
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <section
          aria-label="Task canvas"
          className="relative min-h-[calc(100vh-10rem)] overflow-auto bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:22px_22px]"
        >
          <div className="min-h-full min-w-[680px] p-8 lg:p-12">
            {nodes.length === 0 ? (
              <div className="grid min-h-[440px] place-items-center">
                <div className="max-w-xs rounded-2xl border border-dashed border-border bg-background/90 p-7 text-center shadow-sm backdrop-blur">
                  <div className="mx-auto grid size-10 place-items-center rounded-xl bg-secondary">
                    <Boxes className="size-4" />
                  </div>
                  <h2 className="mt-4 text-sm font-medium">
                    Capture the first start node
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Its source documents become the fixed boundary for future
                    decomposition.
                  </p>
                  <Button type="button" className="mt-5" onClick={createNode}>
                    <Plus /> New start node
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid max-w-5xl grid-cols-2 items-start gap-8 xl:grid-cols-3">
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    className={cn(
                      'min-h-36 rounded-2xl border border-t-[3px] border-border bg-background p-4 text-left shadow-[0_10px_30px_rgb(15_23_42/6%)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgb(15_23_42/9%)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                      node.id === createdId && 'ring-2 ring-foreground/20',
                    )}
                    style={{
                      borderTopColor:
                        node.presentation?.color ?? nodeTypeColor(node.type),
                    }}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
                        {node.id}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                        {node.type}
                      </span>
                    </div>
                    <h2 className="mt-4 text-sm font-semibold leading-5">
                      {node.title}
                    </h2>
                    <div className="mt-5 space-y-1.5">
                      {node.resources.slice(0, 3).map((resource) => (
                        <span
                          key={`${resource.kind}:${resource.path}`}
                          className="flex max-w-full items-center gap-1.5 px-1.5 py-1 text-[11px] text-muted-foreground"
                        >
                          <FileText className="size-3 shrink-0" />
                          <span className="truncate">
                            {resourceName(resource.path)}
                          </span>
                        </span>
                      ))}
                      {node.resources.length > 3 ? (
                        <span className="px-1.5 text-[10px] text-muted-foreground">
                          +{node.resources.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            if (open) setFormOpen(true);
            else cancelEditing();
          }}
        >
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <form onSubmit={saveTask} className="space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Plus className="size-3.5" />
                  </div>
                  <h2 className="text-sm font-semibold">
                    {editingId ? `Edit ${editingId}` : 'New start node'}
                  </h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Select every document needed to understand what will be
                  decomposed.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="task-title" className="text-xs font-medium">
                  Start-node title
                </label>
                <Input
                  id="task-title"
                  value={title}
                  maxLength={160}
                  placeholder="Task decomposition MVP"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="context-folder" className="text-xs font-medium">
                  Context Library folder
                </label>
                <div className="relative">
                  <select
                    id="context-folder"
                    value={selectedFolder?.path ?? ''}
                    onChange={(event) =>
                      setSelectedFolderPath(event.target.value)
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
                  >
                    {folders.map((folder) => {
                      const depth = folder.path.split('/').length - 2;
                      return (
                        <option key={folder.path} value={folder.path}>
                          {`${'— '.repeat(depth)}${folder.title}`}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {availableSourceCount === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      No Markdown documents are available yet.
                    </p>
                  ) : !selectedFolder || selectedFolder.entries.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      This folder is empty.
                    </p>
                  ) : (
                    selectedFolder.entries.map((entry, index) => {
                      if (entry.kind === 'folder') {
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/50"
                            onClick={() => setSelectedFolderPath(entry.path)}
                          >
                            <Folder className="size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {entry.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Folder
                            </span>
                          </button>
                        );
                      }
                      const checked = selectedRefs.includes(entry.path);
                      const inputId = `context-source-${index}`;
                      return (
                        <label
                          key={entry.path}
                          htmlFor={inputId}
                          className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition hover:bg-muted/50"
                        >
                          <Checkbox
                            id={inputId}
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleSource(entry.path, value === true)
                            }
                            aria-label={`Use ${entry.name}`}
                            className="mt-0.5"
                          />
                          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[11px] font-medium">
                              {entry.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                              {entry.title}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium">Local Markdown</p>
                <button
                  type="button"
                  className={cn(
                    'flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-4 text-center transition',
                    dragging && 'border-foreground bg-secondary',
                  )}
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
                    Drop Markdown or choose files
                  </span>
                  <span className="mt-1 text-[10px] text-muted-foreground">
                    Up to 20 files, 2 MB each
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  multiple
                  hidden
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                {files.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}:${file.size}:${file.lastModified}`}
                        className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2"
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${file.name}`}
                          title="Remove source"
                          onClick={() =>
                            setFiles((current) =>
                              current.filter(
                                (_, candidateIndex) => candidateIndex !== index,
                              ),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {retainedAttachmentRefs.length > 0 ? (
                  <ul className="space-y-1.5 pt-1">
                    {retainedAttachmentRefs.map((ref) => (
                      <li
                        key={ref}
                        className="flex items-center gap-2 rounded-lg bg-secondary px-2.5 py-2"
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">
                          {resourceName(ref)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${resourceName(ref)}`}
                          title="Remove source"
                          onClick={() =>
                            setRetainedAttachmentRefs((current) =>
                              current.filter((candidate) => candidate !== ref),
                            )
                          }
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="border-t border-border pt-5">
                <div className="flex gap-2">
                  {editingId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={cancelEditing}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    className="flex-1"
                    size="lg"
                    disabled={!title.trim() || sourceCount === 0 || creating}
                  >
                    {editingId ? <Pencil /> : <Plus />}{' '}
                    {creating
                      ? editingId
                        ? 'Saving…'
                        : 'Creating…'
                      : editingId
                        ? 'Save changes'
                        : 'Create start node'}
                  </Button>
                </div>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}{' '}
                  selected
                </p>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Sheet
        open={selectedNode !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedNodeId('');
        }}
      >
        <SheetContent className="sm:max-w-md">
          {selectedNode ? (
            <>
              <SheetHeader className="border-b border-border px-6 py-6 pr-14">
                <div className="mb-3 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
                    {selectedNode.id}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
                    {selectedNode.type}
                  </span>
                </div>
                <SheetTitle className="text-xl font-semibold tracking-[-0.025em]">
                  {selectedNode.title}
                </SheetTitle>
                <SheetDescription>
                  A captured {selectedNode.role} node and its fixed source
                  boundary.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-3 gap-3">
                  <NodeFact label="Role" value={selectedNode.role} />
                  <NodeFact label="Type" value={selectedNode.type} />
                  <NodeFact label="Status" value={selectedNode.status} />
                </dl>

                <section className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Sources
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedNode.resources.length}
                    </span>
                  </div>
                  <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
                    {selectedNode.resources.map((resource) => (
                      <button
                        key={`${resource.kind}:${resource.path}`}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/50"
                        disabled={previewingPath === resource.path}
                        onClick={() => previewResource(resource.path)}
                      >
                        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
                          <FileText className="size-3.5" />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {previewingPath === resource.path
                              ? 'Opening…'
                              : resourceName(resource.path)}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                            {resource.path}
                          </span>
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                          {resource.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="mt-7 border-t border-border pt-5">
                  <dl className="space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd>{formatTimestamp(selectedNode.createdAt)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>{formatTimestamp(selectedNode.updatedAt)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Dependencies</dt>
                      <dd>{selectedNode.dependsOn.length}</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <SheetFooter className="border-t border-border px-6 py-4">
                {selectedNode.role === 'start' ? (
                  <Button type="button" onClick={() => editNode(selectedNode)}>
                    <Pencil /> Edit start node
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

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
          {preview ? (
            <MarkdownReader
              title={preview.title}
              filePath={preview.path}
              markdown={preview.markdown}
              onClose={() => setPreview(null)}
              showFocusButton={false}
              className="min-h-[70vh] border-0 shadow-none"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function resourceName(resourcePath: string) {
  return resourcePath.split('/').at(-1) ?? resourcePath;
}

function NodeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate text-xs font-medium capitalize">{value}</dd>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function nodeTypeColor(type: string) {
  let hash = 0;
  for (const character of type) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 55% 48%)`;
}
