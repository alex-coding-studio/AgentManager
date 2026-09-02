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
  const changed = update.runs ?? [];
  return [
    ...current.filter(
      (run) =>
        !deleted.has(run.runId) &&
        !changed.some((candidate) => candidate.runId === run.runId),
    ),
    ...changed,
  ];
}
