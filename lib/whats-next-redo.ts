import type { TaskGraphNode } from './task-graph.ts';
import type { WhatsNextRunRecord } from './whats-next-runs.ts';

export type ProposalReplacement = {
  state: 'pending' | 'applied';
  candidateIds: string[];
  runIds: string[];
  snapshot: string;
};

export function isPendingReplacement(run: WhatsNextRunRecord) {
  return run.replacement?.state === 'pending';
}

export function redoProposalPlan(
  nodes: TaskGraphNode[],
  runs: WhatsNextRunRecord[],
  sourceIds: string[],
) {
  const sources = nodes.filter((node) => sourceIds.includes(node.id));
  if (!sourceIds.length || sources.length !== sourceIds.length)
    throw new Error('The origin Node is unavailable.');
  const sourceUids = new Set(sources.map((node) => node.uid).filter(Boolean));
  const fromSources = (value: {
    derivedFrom?: string[];
    relations?: { derivedFrom: string[] };
  }) =>
    value.relations
      ? value.relations.derivedFrom.some((uid) => sourceUids.has(uid))
      : value.derivedFrom?.some((id) => sourceIds.includes(id));
  const formalChildren = nodes.filter(fromSources);
  if (formalChildren.length)
    throw new Error(
      `Cannot redo: this parent already has Formal Nodes (${formalChildren.map((node) => node.title).join(', ')}).`,
    );
  const latest = new Map<
    string,
    {
      runId: string;
      candidate: NonNullable<
        Extract<WhatsNextRunRecord['result'], { outcome: 'proposal' }>
      >['candidates'][number];
    }
  >();
  for (const run of runs) {
    if (isPendingReplacement(run) || run.result?.outcome !== 'proposal')
      continue;
    for (const candidate of run.result.candidates) {
      const previous = latest.get(candidate.candidateId);
      if (!previous || previous.candidate.revision < candidate.revision)
        latest.set(candidate.candidateId, { runId: run.runId, candidate });
    }
  }
  const targets = [...latest.values()].filter(({ candidate }) =>
    fromSources(candidate),
  );
  if (!targets.length)
    throw new Error(
      'There is no unaccepted proposal to redo from this parent.',
    );
  if (
    targets.some(({ candidate }) =>
      candidate.derivedFrom.some((id) => !sourceIds.includes(id)),
    )
  )
    throw new Error(
      'This proposal also belongs to another origin. Redo all of its origins together.',
    );
  const candidateIds = targets
    .map(({ candidate }) => candidate.candidateId)
    .sort();
  const targetUids = new Set(targets.map(({ candidate }) => candidate.uid));
  const external = [
    ...nodes,
    ...[...latest.values()]
      .filter(({ candidate }) => !candidateIds.includes(candidate.candidateId))
      .map(({ candidate }) => candidate),
  ];
  if (
    external.some((entity) =>
      entity.relations
        ? entity.relations.dependsOn.some((uid) => targetUids.has(uid))
        : entity.dependsOn.some((id) => candidateIds.includes(id)),
    )
  )
    throw new Error(
      'Other Nodes depend on this proposal. Resolve those dependencies before redoing it.',
    );
  const histories = runs.filter(
    (run) =>
      !isPendingReplacement(run) &&
      run.result?.outcome === 'proposal' &&
      run.result.candidates.some((candidate) =>
        candidateIds.includes(candidate.candidateId),
      ),
  );
  if (
    histories.some(
      (run) =>
        run.result?.outcome === 'proposal' &&
        run.result.candidates.some(
          (candidate) => !candidateIds.includes(candidate.candidateId),
        ),
    )
  )
    throw new Error(
      'This proposal shares a Run with protected directions. It cannot be replaced as a whole.',
    );
  const runIds = [
    ...new Set(
      histories.flatMap((run) => [
        run.runId,
        ...(run.replacement?.state === 'applied' ? run.replacement.runIds : []),
      ]),
    ),
  ].sort();
  if (
    external.some((entity) =>
      entity.resources.some((resource) =>
        runIds.some((id) => resource.path.startsWith(`whats-next/runs/${id}/`)),
      ),
    )
  )
    throw new Error(
      'Other Nodes use files from this proposal. Keep those resources before redoing it.',
    );
  return {
    candidateIds,
    runIds,
    targets,
    histories,
    snapshot: JSON.stringify(
      targets
        .map(({ runId, candidate }) => ({ runId, candidate }))
        .sort((a, b) =>
          a.candidate.candidateId.localeCompare(b.candidate.candidateId),
        ),
    ),
  };
}
