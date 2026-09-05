export const MATERIALIZATION_MODULES = [
  'whats-next',
  'task-graph',
  'domain-model',
  'what-to-do',
] as const;

export type MaterializationModule = (typeof MATERIALIZATION_MODULES)[number];

export type MaterializationBasisCore = {
  project: { id: string; planningPath: string };
  module: MaterializationModule;
  operation: string;
  contract: { id: string; version: number; hash: string };
  fingerprint: string;
  preparedAt: string;
};
