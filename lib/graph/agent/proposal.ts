export function reconcileProposalRuns<T extends { runId: string }>(
  current: T[],
  update: {
    requestedRunId: string;
    runDeleted?: boolean;
    deletedRunIds?: string[];
    runs?: T[];
  },
) {
  const deleted = new Set(
    update.deletedRunIds ?? (update.runDeleted ? [update.requestedRunId] : []),
  );
  const changed = new Map(
    (update.runs ?? []).map((run) => [run.runId, run] as const),
  );
  const next = current.flatMap((run) => {
    if (deleted.has(run.runId)) return [];
    const replacement = changed.get(run.runId);
    if (!replacement) return [run];
    changed.delete(run.runId);
    return [replacement];
  });
  return [...next, ...changed.values()];
}

export function mergeLatestCandidatePreview<
  T extends {
    id: string;
    startedAt?: string;
    candidate?: { revision: number };
  },
>(current: T[], incoming: T) {
  const index = current.findIndex((candidate) => candidate.id === incoming.id);
  if (index < 0) return [...current, incoming];
  const existing = current[index];
  const existingRevision = existing?.candidate?.revision ?? 0;
  const incomingRevision = incoming.candidate?.revision ?? 0;
  if (
    incomingRevision < existingRevision ||
    (incomingRevision === existingRevision &&
      (incoming.startedAt ?? '').localeCompare(existing?.startedAt ?? '') <= 0)
  )
    return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}

export function proposalFocusNodeIds(
  previews: Array<{
    id: string;
    sourceNodeId?: string;
    derivedFrom?: string[];
  }>,
  options: {
    visibleNodeIds?: Set<string>;
    projectedRootId?: string;
  } = {},
) {
  const ids = new Set<string>();
  for (const preview of previews) {
    const origins = (preview.derivedFrom ?? []).filter(
      (nodeId) => !options.visibleNodeIds || options.visibleNodeIds.has(nodeId),
    );
    if (origins.length > 0) {
      for (const origin of origins) ids.add(origin);
    } else if (options.projectedRootId) {
      ids.add(options.projectedRootId);
    } else if (
      preview.sourceNodeId &&
      (!options.visibleNodeIds ||
        options.visibleNodeIds.has(preview.sourceNodeId))
    ) {
      ids.add(preview.sourceNodeId);
    }
    ids.add(preview.id);
  }
  return [...ids];
}
