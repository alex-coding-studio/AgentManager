import { CANDIDATE_ALIAS_PATTERN, NODE_ALIAS_PATTERN } from '../identity.ts';

export type NodeReference = { kind: 'node'; id: string };
export type CandidateReference = { kind: 'candidate'; id: string };
export type ProposalReference = { kind: 'proposal'; localKey: string };

export type GraphReference =
  | NodeReference
  | CandidateReference
  | ProposalReference;

export const LOCAL_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$';

export const LOCAL_KEY_SCHEMA = {
  type: 'string',
  pattern: LOCAL_KEY_PATTERN,
} as const;

export const NODE_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: {
    kind: { const: 'node' },
    id: { type: 'string', pattern: NODE_ALIAS_PATTERN },
  },
} as const;

export const CANDIDATE_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'id'],
  properties: {
    kind: { const: 'candidate' },
    id: { type: 'string', pattern: CANDIDATE_ALIAS_PATTERN },
  },
} as const;

export const PROPOSAL_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'localKey'],
  properties: {
    kind: { const: 'proposal' },
    localKey: LOCAL_KEY_SCHEMA,
  },
} as const;

export const GRAPH_REFERENCE_SCHEMA = {
  oneOf: [
    NODE_REFERENCE_SCHEMA,
    CANDIDATE_REFERENCE_SCHEMA,
    PROPOSAL_REFERENCE_SCHEMA,
  ],
} as const;
