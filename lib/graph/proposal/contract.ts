import {
  CANDIDATE_ALIAS_PATTERN,
  NODE_ALIAS_PATTERN,
  type GraphIdentityFields,
  type StableRelations,
} from '../identity.ts';
import {
  GRAPH_REFERENCE_SCHEMA,
  LOCAL_KEY_SCHEMA,
  NODE_REFERENCE_SCHEMA,
  type GraphReference,
  type NodeReference,
} from './reference.ts';

export type GraphResourceReference = { kind: string; path: string };

export type GraphClarificationOption = {
  id: string;
  label: string;
  effect: string;
  recommended: boolean;
};

export type GraphClarification = {
  question: string;
  options: GraphClarificationOption[];
};

export type GraphProposalCandidate = {
  localKey: string;
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

export type GraphCandidateFields = {
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

export type GraphCandidateInput = GraphIdentityFields & GraphCandidateFields;

export type GraphCandidateRecord = GraphCandidateFields & {
  uid: string;
  relations: StableRelations;
};

export type GraphProposalRevision = {
  candidateId: string;
  revision: number;
  uid: string;
};

export const NON_EMPTY_STRING_SCHEMA = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

export const NODE_ID_SCHEMA = {
  type: 'string',
  pattern: NODE_ALIAS_PATTERN,
} as const;

export const CANDIDATE_ID_SCHEMA = {
  type: 'string',
  pattern: CANDIDATE_ALIAS_PATTERN,
} as const;

export const STRING_ARRAY_SCHEMA = {
  type: 'array',
  uniqueItems: true,
  items: NON_EMPTY_STRING_SCHEMA,
} as const;

export const NODE_ID_ARRAY_SCHEMA = {
  type: 'array',
  uniqueItems: true,
  items: NODE_ID_SCHEMA,
} as const;

export const DEPENDENCY_ID_ARRAY_SCHEMA = {
  type: 'array',
  uniqueItems: true,
  items: { oneOf: [NODE_ID_SCHEMA, CANDIDATE_ID_SCHEMA] },
} as const;

export const REQUEST_IDENTITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId', 'requestId', 'inputFingerprint'],
  properties: {
    sessionId: NON_EMPTY_STRING_SCHEMA,
    requestId: NON_EMPTY_STRING_SCHEMA,
    inputFingerprint: NON_EMPTY_STRING_SCHEMA,
  },
} as const;

export const RESOURCE_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'path'],
  properties: {
    kind: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 80 },
    path: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 500 },
  },
} as const;

export const PRESENTATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  },
} as const;

export const CLARIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options'],
  properties: {
    question: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 600 },
    options: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'effect', 'recommended'],
        properties: {
          id: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 80 },
          label: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 160 },
          effect: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 600 },
          recommended: { type: 'boolean' },
        },
      },
    },
  },
} as const;

export const GRAPH_CANDIDATE_RECORD_REQUIRED = [
  'candidateId',
  'revision',
  'type',
  'title',
  'summary',
  'derivedFrom',
  'dependsOn',
  'resources',
  'typeTemplateRef',
  'metadata',
  'presentation',
  'assumptions',
] as const;

export const GRAPH_CANDIDATE_RECORD_PROPERTIES = {
  candidateId: CANDIDATE_ID_SCHEMA,
  revision: { type: 'integer', minimum: 1 },
  type: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 80 },
  title: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 160 },
  summary: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 600 },
  derivedFrom: { ...NODE_ID_ARRAY_SCHEMA, minItems: 1 },
  dependsOn: DEPENDENCY_ID_ARRAY_SCHEMA,
  resources: {
    type: 'array',
    uniqueItems: true,
    items: { $ref: '#/$defs/resource' },
  },
  typeTemplateRef: { oneOf: [NODE_ID_SCHEMA, { type: 'null' }] },
  metadata: { type: 'object' },
  presentation: PRESENTATION_SCHEMA,
  assumptions: STRING_ARRAY_SCHEMA,
} as const;

export const GRAPH_PROPOSAL_CANDIDATE_REQUIRED = [
  'localKey',
  'type',
  'title',
  'summary',
  'derivedFrom',
  'dependsOn',
  'resources',
  'typeTemplateRef',
  'metadata',
  'presentation',
  'assumptions',
] as const;

export const GRAPH_PROPOSAL_CANDIDATE_PROPERTIES = {
  localKey: LOCAL_KEY_SCHEMA,
  type: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 80 },
  title: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 160 },
  summary: { ...NON_EMPTY_STRING_SCHEMA, maxLength: 600 },
  derivedFrom: {
    type: 'array',
    uniqueItems: true,
    minItems: 1,
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
  presentation: PRESENTATION_SCHEMA,
  assumptions: STRING_ARRAY_SCHEMA,
} as const;

export const GRAPH_PROPOSAL_CANDIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: GRAPH_PROPOSAL_CANDIDATE_REQUIRED,
  properties: GRAPH_PROPOSAL_CANDIDATE_PROPERTIES,
} as const;
