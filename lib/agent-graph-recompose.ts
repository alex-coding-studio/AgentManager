export const agentGraphRecomposeEffects = [
  'retain',
  'replace',
  'split',
  'merge',
  'add',
  'remove',
] as const;

export type AgentGraphRecomposeEffect = {
  kind: (typeof agentGraphRecomposeEffects)[number];
  from: string[];
  to: string[];
};

type RecomposeCandidate = {
  candidateId: string;
  dependsOn: string[];
};

type RecomposeRun = {
  operation: string;
  status: string;
  recomposeCandidateIds?: string[];
  result?: {
    outcome: string;
    recomposition?: { effects: AgentGraphRecomposeEffect[] };
    candidates?: Array<{ candidateId: string }>;
  } | null;
};

export function validateAgentGraphRecomposePlan(input: {
  selectedIds: string[];
  outputIds: string[];
  effects: AgentGraphRecomposeEffect[];
}) {
  const selected = uniqueNonEmpty(input.selectedIds, 'selected Candidate');
  const outputs = uniqueNonEmpty(input.outputIds, 'output Candidate', true);
  const consumed = new Map<string, number>();
  const produced = new Map<string, number>();

  for (const effect of input.effects) {
    validateEffectShape(effect);
    for (const id of effect.from) {
      if (!selected.has(id))
        throw new Error(
          `Recompose effect references unselected Candidate ${id}.`,
        );
      consumed.set(id, (consumed.get(id) ?? 0) + 1);
    }
    for (const id of effect.to) {
      if (!outputs.has(id))
        throw new Error(`Recompose effect references unknown output ${id}.`);
      produced.set(id, (produced.get(id) ?? 0) + 1);
    }
  }

  for (const id of selected)
    if (consumed.get(id) !== 1)
      throw new Error(`Selected Candidate ${id} must have exactly one effect.`);
  for (const id of outputs)
    if (produced.get(id) !== 1)
      throw new Error(`Output Candidate ${id} must have exactly one effect.`);
}

export function validateAgentGraphRecomposeDependencies(input: {
  selectedIds: string[];
  retainedIds: string[];
  outputCandidates: RecomposeCandidate[];
  knownCandidates: RecomposeCandidate[];
}) {
  const selected = new Set(input.selectedIds);
  const retained = new Set(input.retainedIds);
  const knownById = new Map(
    input.knownCandidates.map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const postRecomposeCandidates = [...input.outputCandidates];

  for (const candidateId of retained) {
    const candidate = knownById.get(candidateId);
    if (!candidate)
      throw new Error(`Retained Candidate ${candidateId} is unavailable.`);
    postRecomposeCandidates.push(candidate);
  }

  for (const candidate of postRecomposeCandidates)
    if (
      candidate.dependsOn.some(
        (dependencyId) =>
          selected.has(dependencyId) && !retained.has(dependencyId),
      )
    )
      throw new Error(
        `Candidate ${candidate.candidateId} depends on a replaced or removed Candidate.`,
      );

  for (const candidate of input.knownCandidates)
    if (
      !selected.has(candidate.candidateId) &&
      candidate.dependsOn.some((dependencyId) => selected.has(dependencyId))
    )
      throw new Error(
        `Candidate ${candidate.candidateId} still depends on the selected working set.`,
      );
}

export function successfulRecomposeSupersededCandidateIds(
  runs: RecomposeRun[],
) {
  const superseded = new Set<string>();
  for (const run of runs) {
    if (
      run.operation !== 'recompose-candidates' ||
      run.status !== 'proposal' ||
      run.result?.outcome !== 'proposal' ||
      !run.result.recomposition
    )
      continue;
    const retained = new Set(
      run.result.recomposition.effects
        .filter((effect) => effect.kind === 'retain')
        .flatMap((effect) => effect.from),
    );
    for (const candidateId of run.recomposeCandidateIds ?? [])
      if (!retained.has(candidateId)) superseded.add(candidateId);
  }
  return superseded;
}

export function successfulRecomposeOutputCandidateIds(runs: RecomposeRun[]) {
  const outputs = new Set<string>();
  for (const run of runs) {
    if (
      run.operation !== 'recompose-candidates' ||
      run.status !== 'proposal' ||
      run.result?.outcome !== 'proposal' ||
      !run.result.recomposition
    )
      continue;
    for (const candidate of run.result.candidates ?? [])
      outputs.add(candidate.candidateId);
    for (const effect of run.result.recomposition.effects)
      if (effect.kind === 'retain')
        for (const candidateId of effect.to) outputs.add(candidateId);
  }
  return outputs;
}

function validateEffectShape(effect: AgentGraphRecomposeEffect) {
  const from = uniqueNonEmpty(effect.from, 'effect input', true);
  const to = uniqueNonEmpty(effect.to, 'effect output', true);
  const legal =
    (effect.kind === 'retain' &&
      from.size === 1 &&
      to.size === 1 &&
      effect.from[0] === effect.to[0]) ||
    (effect.kind === 'replace' && from.size === 1 && to.size === 1) ||
    (effect.kind === 'split' && from.size === 1 && to.size >= 2) ||
    (effect.kind === 'merge' && from.size >= 2 && to.size === 1) ||
    (effect.kind === 'add' && from.size === 0 && to.size === 1) ||
    (effect.kind === 'remove' && from.size === 1 && to.size === 0);
  if (!legal) throw new Error(`Invalid ${effect.kind} Recompose effect shape.`);
}

function uniqueNonEmpty(values: string[], label: string, allowEmpty = false) {
  if (!allowEmpty && values.length === 0)
    throw new Error(`At least one ${label} is required.`);
  if (values.some((value) => !value.trim()))
    throw new Error(`A ${label} identifier is empty.`);
  const unique = new Set(values);
  if (unique.size !== values.length)
    throw new Error(`A ${label} identifier is duplicated.`);
  return unique;
}
