'use client';
import { useUiText } from '@/components/ui-language-provider';

import { FileText } from 'lucide-react';
import type { TaskGraphNode } from '@/lib/graph/task/nodes';
import { partitionNodeResources } from '@/lib/graph/task/resources';

export function NodeResourceSections({
  node,
  openingPath,
  onOpen,
}: {
  node: TaskGraphNode;
  openingPath?: string;
  onOpen: (path: string) => void;
}) {
  const { t } = useUiText();
  const { inputs, outputs } = partitionNodeResources(node.id, node.resources);
  return (
    <div className="space-y-6">
      <ResourceSection
        title={t('Inputs')}
        resources={inputs}
        openingPath={openingPath}
        onOpen={onOpen}
      />
      <ResourceSection
        title={t('Outputs')}
        resources={outputs}
        openingPath={openingPath}
        onOpen={onOpen}
      />
    </div>
  );
}

export function NodeProvenanceFacts({ node }: { node: TaskGraphNode }) {
  const { t } = useUiText();
  return (
    <dl className="space-y-3 text-xs">
      {node.uid ? (
        <PropertyRow label={t('Stable ID')} value={node.uid} />
      ) : null}
      <PropertyRow
        label={t('Created through')}
        value={
          node.provenance?.feature === 'whats-next'
            ? t('Product Discovery & Design')
            : node.provenance
              ? t('Scope Decomposition')
              : t('Manual creation')
        }
      />
      {node.provenance ? (
        <PropertyRow
          label={t('Source proposal')}
          value={`${node.provenance.candidateId} · Revision ${node.provenance.revision}`}
        />
      ) : null}
    </dl>
  );
}

function ResourceSection({
  title,
  resources,
  openingPath,
  onOpen,
}: {
  title: string;
  resources: TaskGraphNode['resources'];
  openingPath?: string;
  onOpen: (path: string) => void;
}) {
  const { t } = useUiText();
  if (resources.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
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
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
              <FileText className="size-3.5" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {openingPath === resource.path
                  ? t('Opening…')
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
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-right">{value}</dd>
    </div>
  );
}

function resourceName(path: string) {
  return path.split('/').at(-1) ?? path;
}
