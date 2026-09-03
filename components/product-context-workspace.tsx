'use client';

import { useMemo, useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { MarkdownReader } from '@/components/markdown-reader';
import { useUiText } from '@/components/ui-language-provider';
import type { ContextSection } from '@/lib/modules/product-context/catalog';
import { cn } from '@/lib/utils';

export function ProductContextWorkspace({
  initialSections,
}: {
  initialSections: ContextSection[];
}) {
  const { t } = useUiText();
  const [selectedSlug, setSelectedSlug] = useState(
    initialSections[0]?.slug ?? '',
  );
  const [selectedPath, setSelectedPath] = useState(
    documentIdentity(initialSections[0]?.documents[0]),
  );
  const selectedSection = useMemo(
    () =>
      initialSections.find((section) => section.slug === selectedSlug) ??
      initialSections[0],
    [initialSections, selectedSlug],
  );
  const selectedDocument = useMemo(
    () =>
      selectedSection?.documents.find(
        (document) => documentIdentity(document) === selectedPath,
      ) ?? selectedSection?.documents[0],
    [selectedPath, selectedSection],
  );

  function selectSection(section: ContextSection) {
    setSelectedSlug(section.slug);
    setSelectedPath(documentIdentity(section.documents[0]));
  }

  if (initialSections.length === 0) {
    return (
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-3xl place-items-center px-5 py-12 lg:px-8">
        <div className="w-full rounded-2xl border border-dashed border-border bg-card p-8 text-center sm:p-12">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary">
            <Folder className="size-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {t('Product Context is empty')}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            {t(
              'Formal documents will appear here as you use Product Discovery & Design, Scope Decomposition, Domain Modeling, Delivery Planning, and Implementation.',
            )}
          </p>
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
            'Praxis collects accepted outputs here. Select a category and document to read the current formal context.',
          )}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <ul
            className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card"
            aria-label={t('Context sections')}
          >
            {initialSections.map((section) => {
              const selected = selectedSection?.slug === section.slug;
              return (
                <li key={section.slug}>
                  <button
                    type="button"
                    aria-label={t('Read {title} context', {
                      title: t(section.title),
                    })}
                    onClick={() => selectSection(section)}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition',
                      selected
                        ? 'bg-secondary text-secondary-foreground'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(section.title)}</p>
                      <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                        {t(section.summary)}
                      </p>
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {section.documents.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex h-10 items-center border-b border-border px-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t('Documents')}
              </p>
            </header>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {selectedSection?.documents.map((document) => {
                const identity = documentIdentity(document);
                const selected =
                  documentIdentity(selectedDocument) === identity;
                return (
                  <li key={identity}>
                    <button
                      type="button"
                      onClick={() => setSelectedPath(identity)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition',
                        selected ? 'bg-secondary' : 'hover:bg-muted/50',
                      )}
                    >
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {document.title}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {document.summary}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {selectedDocument ? (
          <MarkdownReader
            title={selectedDocument.title}
            filePath={selectedDocument.path ?? selectedDocument.fileName}
            markdown={selectedDocument.markdown}
          />
        ) : null}
      </div>
    </div>
  );
}

function documentIdentity(
  document: ContextSection['documents'][number] | undefined,
) {
  return document?.path ?? document?.fileName ?? '';
}
