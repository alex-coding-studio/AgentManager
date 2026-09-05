export const PRODUCER_KINDS = ['agent-run'] as const;

export type ProducerKind = (typeof PRODUCER_KINDS)[number];
