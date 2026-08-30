export const reasoningEfforts = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;
export type ReasoningEffort = (typeof reasoningEfforts)[number];
export type LocalModel = {
  id: string;
  name: string;
  description: string;
  efforts: ReasoningEffort[];
};
export type ModelCatalog = {
  agent: 'codex' | 'claude';
  models: LocalModel[];
};

export function isModelId(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}(?:\[[a-zA-Z0-9]+\])?$/.test(
    value,
  );
}
