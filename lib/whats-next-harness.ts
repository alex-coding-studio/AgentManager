import Ajv2020 from 'ajv/dist/2020.js';

export const WHATS_NEXT_HARNESS_ID = 'agent-manager.whats-next';
export const WHATS_NEXT_HARNESS_REVISION = 1;

export const WHATS_NEXT_HARNESS_PROMPT = `You are AgentManager's What's next Agent. Grow the product outward from the supplied origin by proposing the distinct directions that could come next.

This Harness text is a placeholder. It is deliberately minimal so the interface can run end to end; the real contract is written separately with the user.

Read every primary file in the supplied Context Workspace. Return only JSON matching the supplied output schema: a proposal of two to five distinct directions, one bounded clarification, or no-change. Echo the request identity exactly. Only reference Nodes and Resources present in the packet.`;

export type WhatsNextRequestIdentity = {
  sessionId: string;
  requestId: string;
  inputFingerprint: string;
};

export type WhatsNextResourceReference = {
  kind: string;
  path: string;
};

export type WhatsNextCandidate = {
  candidateId: string;
  revision: number;
  type: string;
  title: string;
  summary: string;
  derivedFrom: string[];
  dependsOn: string[];
  resources: WhatsNextResourceReference[];
  typeTemplateRef: string | null;
  metadata: Record<string, unknown>;
  presentation: { color?: string };
  assumptions: string[];
};

export type WhatsNextExploration = {
  consideredNodeIds: string[];
  notes: string[];
};

type WhatsNextResultBase = {
  schemaVersion: 1;
  harness: {
    id: typeof WHATS_NEXT_HARNESS_ID;
    revision: typeof WHATS_NEXT_HARNESS_REVISION;
  };
  request: WhatsNextRequestIdentity;
  exploration: WhatsNextExploration;
};

export type WhatsNextHarnessResult = WhatsNextResultBase &
  (
    | { outcome: 'proposal'; candidates: WhatsNextCandidate[] }
    | {
        outcome: 'clarification';
        clarification: {
          question: string;
          options: Array<{
            id: string;
            label: string;
            effect: string;
            recommended: boolean;
          }>;
        };
      }
    | { outcome: 'no-change'; reason: string }
  );

export type WhatsNextValidationContext = {
  request: WhatsNextRequestIdentity;
  knownNodeIds: Iterable<string>;
  knownResourcePaths: Iterable<string>;
  previousCandidateRevisions?: Readonly<Record<string, number>>;
  reservedCandidateIds?: Iterable<string>;
  acceptedCandidateIds?: Iterable<string>;
  knownCandidates?: Iterable<
    Pick<WhatsNextCandidate, 'candidateId' | 'dependsOn'>
  >;
};

const nonEmptyString = { type: 'string', minLength: 1, pattern: '\\S' };
const nodeId = { type: 'string', pattern: '^NODE-[0-9]{4,}$' };
const candidateId = { type: 'string', pattern: '^CANDIDATE-[0-9]{4,}$' };
const stringArray = { type: 'array', uniqueItems: true, items: nonEmptyString };
const nodeIdArray = { type: 'array', uniqueItems: true, items: nodeId };
const dependencyIdArray = {
  type: 'array',
  uniqueItems: true,
  items: { oneOf: [nodeId, candidateId] },
};
const baseProperties = {
  schemaVersion: { const: 1 },
  harness: { $ref: '#/$defs/harness' },
  request: { $ref: '#/$defs/request' },
  exploration: { $ref: '#/$defs/exploration' },
};

export const WHATS_NEXT_HARNESS_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: "What's Next Harness Result",
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'harness',
        'request',
        'exploration',
        'outcome',
        'candidates',
      ],
      properties: {
        ...baseProperties,
        outcome: { const: 'proposal' },
        candidates: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          items: { $ref: '#/$defs/candidate' },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'harness',
        'request',
        'exploration',
        'outcome',
        'clarification',
      ],
      properties: {
        ...baseProperties,
        outcome: { const: 'clarification' },
        clarification: { $ref: '#/$defs/clarification' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'harness',
        'request',
        'exploration',
        'outcome',
        'reason',
      ],
      properties: {
        ...baseProperties,
        outcome: { const: 'no-change' },
        reason: { ...nonEmptyString, maxLength: 600 },
      },
    },
  ],
  $defs: {
    harness: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'revision'],
      properties: {
        id: { const: WHATS_NEXT_HARNESS_ID },
        revision: { const: WHATS_NEXT_HARNESS_REVISION },
      },
    },
    request: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId', 'requestId', 'inputFingerprint'],
      properties: {
        sessionId: nonEmptyString,
        requestId: nonEmptyString,
        inputFingerprint: nonEmptyString,
      },
    },
    exploration: {
      type: 'object',
      additionalProperties: false,
      required: ['consideredNodeIds', 'notes'],
      properties: {
        consideredNodeIds: nodeIdArray,
        notes: stringArray,
      },
    },
    resource: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'path'],
      properties: {
        kind: { ...nonEmptyString, maxLength: 80 },
        path: { ...nonEmptyString, maxLength: 500 },
      },
    },
    candidate: {
      type: 'object',
      additionalProperties: false,
      required: [
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
      ],
      properties: {
        candidateId,
        revision: { type: 'integer', minimum: 1 },
        type: { ...nonEmptyString, maxLength: 80 },
        title: { ...nonEmptyString, maxLength: 160 },
        summary: { ...nonEmptyString, maxLength: 600 },
        derivedFrom: { ...nodeIdArray, minItems: 1 },
        dependsOn: dependencyIdArray,
        resources: {
          type: 'array',
          uniqueItems: true,
          items: { $ref: '#/$defs/resource' },
        },
        typeTemplateRef: { oneOf: [nodeId, { type: 'null' }] },
        metadata: { type: 'object' },
        presentation: {
          type: 'object',
          additionalProperties: false,
          properties: {
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          },
        },
        assumptions: stringArray,
      },
    },
    clarification: {
      type: 'object',
      additionalProperties: false,
      required: ['question', 'options'],
      properties: {
        question: { ...nonEmptyString, maxLength: 600 },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label', 'effect', 'recommended'],
            properties: {
              id: { ...nonEmptyString, maxLength: 80 },
              label: { ...nonEmptyString, maxLength: 160 },
              effect: { ...nonEmptyString, maxLength: 600 },
              recommended: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
} as const;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateStructure = ajv.compile(WHATS_NEXT_HARNESS_OUTPUT_SCHEMA);

export class WhatsNextResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhatsNextResultValidationError';
  }
}

export function parseWhatsNextHarnessResult(
  json: string,
  context: WhatsNextValidationContext,
) {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    fail("The What's next result is not valid JSON.");
  }
  return validateWhatsNextHarnessResult(value, context);
}

export function validateWhatsNextHarnessResult(
  value: unknown,
  context: WhatsNextValidationContext,
): WhatsNextHarnessResult {
  if (!validateStructure(value)) {
    const detail = validateStructure.errors?.[0]?.message;
    fail(
      detail
        ? `The What's next result is invalid: ${detail}.`
        : "The What's next result is invalid.",
    );
  }

  const result = value as WhatsNextHarnessResult;
  validateRequest(result.request, context.request);
  const knownNodeIds = new Set(context.knownNodeIds);
  requireKnownNodes(result.exploration.consideredNodeIds, knownNodeIds);

  if (result.outcome === 'proposal') {
    validateCandidates(result.candidates, context, knownNodeIds);
  } else if (result.outcome === 'clarification') {
    requireUnique(
      result.clarification.options.map((option) => option.id),
      'Clarification option identifiers must be unique.',
    );
    if (
      result.clarification.options.filter((option) => option.recommended)
        .length !== 1
    ) {
      fail('A clarification must recommend exactly one option.');
    }
  }
  return result;
}

function validateRequest(
  actual: WhatsNextRequestIdentity,
  expected: WhatsNextRequestIdentity,
) {
  if (
    actual.sessionId !== expected.sessionId ||
    actual.requestId !== expected.requestId ||
    actual.inputFingerprint !== expected.inputFingerprint
  ) {
    fail("The What's next response does not match the current request.");
  }
}

function validateCandidates(
  candidates: WhatsNextCandidate[],
  context: WhatsNextValidationContext,
  knownNodeIds: Set<string>,
) {
  requireUnique(
    candidates.map((candidate) => candidate.candidateId),
    'Candidate identifiers must be unique in one proposal.',
  );
  const proposalCandidateIds = new Set(
    candidates.map((candidate) => candidate.candidateId),
  );
  const knownCandidates = new Map(
    [...(context.knownCandidates ?? [])].map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const acceptedCandidateIds = new Set(context.acceptedCandidateIds ?? []);
  const knownResourcePaths = new Set(context.knownResourcePaths);
  const reservedCandidateIds = new Set(context.reservedCandidateIds ?? []);
  for (const candidate of candidates) {
    const previousRevision =
      context.previousCandidateRevisions?.[candidate.candidateId];
    const expectedRevision =
      previousRevision === undefined ? 1 : previousRevision + 1;
    if (
      previousRevision === undefined &&
      reservedCandidateIds.has(candidate.candidateId)
    ) {
      fail(`Candidate ${candidate.candidateId} already exists.`);
    }
    if (candidate.revision !== expectedRevision) {
      fail(
        `Candidate ${candidate.candidateId} must use revision ${expectedRevision}.`,
      );
    }
    requireKnownNodes(candidate.derivedFrom, knownNodeIds);
    for (const dependencyId of candidate.dependsOn) {
      if (dependencyId === candidate.candidateId) {
        fail(`Candidate ${candidate.candidateId} cannot depend on itself.`);
      }
      if (
        !knownNodeIds.has(dependencyId) &&
        !proposalCandidateIds.has(dependencyId) &&
        !knownCandidates.has(dependencyId) &&
        !acceptedCandidateIds.has(dependencyId)
      ) {
        fail('A Candidate depends on an unknown Node or Candidate.');
      }
    }
    if (
      candidate.typeTemplateRef !== null &&
      !knownNodeIds.has(candidate.typeTemplateRef)
    ) {
      fail('A Candidate type template references an unknown Node.');
    }
    for (const resource of candidate.resources) {
      if (!knownResourcePaths.has(resource.path)) {
        fail('A Candidate references an unknown Resource.');
      }
    }
  }
  assertCandidateDependenciesAreAcyclic([
    ...knownCandidates.values(),
    ...candidates,
  ]);
}

function assertCandidateDependenciesAreAcyclic(
  candidates: Iterable<Pick<WhatsNextCandidate, 'candidateId' | 'dependsOn'>>,
) {
  const dependencies = new Map(
    [...candidates].map((candidate) => [
      candidate.candidateId,
      candidate.dependsOn.filter((dependencyId) =>
        dependencyId.startsWith('CANDIDATE-'),
      ),
    ]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(candidateId: string) {
    if (visiting.has(candidateId)) {
      fail('Candidate dependencies must not contain a cycle.');
    }
    if (visited.has(candidateId)) return;
    visiting.add(candidateId);
    for (const dependencyId of dependencies.get(candidateId) ?? []) {
      if (dependencies.has(dependencyId)) visit(dependencyId);
    }
    visiting.delete(candidateId);
    visited.add(candidateId);
  }

  for (const candidateId of dependencies.keys()) visit(candidateId);
}

function requireKnownNodes(values: string[], knownNodeIds: Set<string>) {
  if (values.some((value) => !knownNodeIds.has(value))) {
    fail("The What's next result references an unknown Node.");
  }
}

function requireUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) fail(message);
}

function fail(message: string): never {
  throw new WhatsNextResultValidationError(message);
}
