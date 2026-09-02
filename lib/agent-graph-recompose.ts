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
