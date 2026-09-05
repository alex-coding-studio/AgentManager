import type { GraphIdentityFields } from '../identity.ts';
import {
  GRAPH_REFERENCE_SCHEMA,
  LOCAL_KEY_SCHEMA,
  NODE_REFERENCE_SCHEMA,
  type GraphReference,
  type NodeReference,
} from './reference.ts';

export type GraphResourceReference = { kind: string; path: string };

export type GraphProposalCandidate = {
  localKey: string;
  revision: number;
  type: string;
  title: string;
  summary: string;
  derivedFrom: NodeReference[];
  dependsOn: GraphReference[];
  resources: GraphResourceReference[];
  typeTemplateRef: NodeReference | null;
  metadata: Record<string, unknown>;
  presentation: { color?: string };
  assumptions: string[];
};

export type GraphCandidateRecord = GraphIdentityFields & {
  candidateId: string;
  revision: number;
  type: string;
  title: string;
  summary: string;
  derivedFrom: string[];
  dependsOn: string[];
  resources: GraphResourceReference[];
  typeTemplateRef: string | null;
  metadata: Record<string, unknown>;
  presentation: { color?: string };
  assumptions: string[];
};

export type GraphProposalRevision = {
  candidateId: string;
  revision: number;
  uid: string;
};

const nonEmptyString = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const stringArray = {
  type: 'array',
  uniqueItems: true,
  items: nonEmptyString,
} as const;

export const RESOURCE_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'path'],
  properties: {
    kind: { ...nonEmptyString, maxLength: 80 },
    path: { ...nonEmptyString, maxLength: 500 },
  },
} as const;

export const GRAPH_PROPOSAL_CANDIDATE_PROPERTIES = {
  localKey: LOCAL_KEY_SCHEMA,
  revision: { type: 'integer', minimum: 1 },
  type: { ...nonEmptyString, maxLength: 80 },
  title: { ...nonEmptyString, maxLength: 160 },
  summary: { ...nonEmptyString, maxLength: 600 },
  derivedFrom: {
    type: 'array',
    uniqueItems: true,
    items: NODE_REFERENCE_SCHEMA,
  },
  dependsOn: {
    type: 'array',
    uniqueItems: true,
    items: GRAPH_REFERENCE_SCHEMA,
  },
  resources: {
    type: 'array',
    uniqueItems: true,
    items: RESOURCE_REFERENCE_SCHEMA,
  },
  typeTemplateRef: { oneOf: [NODE_REFERENCE_SCHEMA, { type: 'null' }] },
  metadata: { type: 'object' },
  presentation: {
    type: 'object',
    additionalProperties: false,
    properties: {
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    },
  },
  assumptions: stringArray,
} as const;
