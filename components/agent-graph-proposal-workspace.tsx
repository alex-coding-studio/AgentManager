'use client';

import { FileText, Focus } from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';

export function ProposalWorkspaceStatus({
  formalCount,
  candidateCount,
  activeProposalCount,
  onFocusProposal,
  className = '',
}: {
  formalCount: number;
  candidateCount: number;
  activeProposalCount: number;
  onFocusProposal: () => void;
  className?: string;
}) {
  const { t } = useUiText();
  return (
    <section
      className={`flex items-center gap-1 rounded-xl border border-border bg-background/95 p-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur ${className}`}
      aria-label={t('Proposal workspace status')}
    >
      <span className="rounded-lg bg-secondary px-1.5 py-0.5">
        <strong className="font-semibold text-foreground">{formalCount}</strong>{' '}
        {t('Formal Nodes')}
      </span>
      <span className="rounded-lg bg-secondary px-1.5 py-0.5">
        <strong className="font-semibold text-foreground">
          {candidateCount}
        </strong>{' '}
        {t('Current Candidates')}
      </span>
      <button
        type="button"
        className="grid size-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-35"
        disabled={activeProposalCount === 0}
        aria-label={t('Focus current proposal')}
        title={
          activeProposalCount > 0
            ? t('Focus current proposal')
            : t('No active proposal')
        }
        onClick={onFocusProposal}
      >
        <Focus className="size-3.5" />
      </button>
    </section>
  );
}

export function CandidateMetadataSections({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  const { t } = useUiText();
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  if (entries.length === 0) return null;
  return (
    <div className="space-y-5">
      {entries.map(([key, value]) => (
        <section key={key}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t(productLabel(key))}
          </h3>
          <div className="mt-3 rounded-xl border border-border bg-secondary/25 px-3 py-2.5 text-xs leading-5">
            <MetadataValue value={value} />
          </div>
        </section>
      ))}
    </div>
  );
}

export function CandidateResourceList({
  resources,
  openingPath,
  onOpen,
}: {
  resources: Array<{ kind: string; path: string }>;
  openingPath?: string;
  onOpen: (path: string) => void;
}) {
  const { t } = useUiText();
  if (resources.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('Resources')}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {resources.length}
        </span>
      </div>
      <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {resources.map((resource) => (
          <button
            key={`${resource.kind}:${resource.path}`}
            type="button"
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/50"
            disabled={openingPath === resource.path}
            onClick={() => onOpen(resource.path)}
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {openingPath === resource.path
                ? t('Opening…')
                : resource.path.split('/').at(-1)}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {resource.kind}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MetadataValue({ value }: { value: unknown }) {
  const { t } = useUiText();
  if (Array.isArray(value)) {
    return value.length > 0 ? (
      <ul className="space-y-1.5">
        {value.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              •
            </span>
            <span className="min-w-0">
              <MetadataValue value={item} />
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length > 0 ? (
      <dl className="space-y-2">
        {entries.map(([key, nested]) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(6rem,0.35fr)_1fr] gap-3"
          >
            <dt className="text-muted-foreground">{t(productLabel(key))}</dt>
            <dd className="min-w-0">
              <MetadataValue value={nested} />
            </dd>
          </div>
        ))}
      </dl>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (typeof value === 'boolean')
    return <span>{value ? t('Yes') : t('No')}</span>;
  return <span>{String(value)}</span>;
}

function productLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
