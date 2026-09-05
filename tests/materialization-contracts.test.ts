import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  contractIdentity,
  defineResultContract,
} from '../lib/materialization/contract.ts';
import {
  canonicalJson,
  semanticResultHash,
} from '../lib/materialization/hash.ts';
import {
  MATERIALIZATION_FAILURE_BOUNDARIES,
  MaterializationError,
  type MaterializationFailureBoundary,
} from '../lib/materialization/receipt.ts';
import {
  MATERIALIZATION_LOG_EVENTS,
  materializationLogEntry,
  type MaterializationLogEvent,
} from '../lib/materialization/log.ts';
import { LOG_EVENT_PATTERN } from '../lib/execution-observability/run-log-format.ts';
import { GRAPH_REFERENCE_SCHEMA } from '../lib/graph/proposal/reference.ts';
import {
  GRAPH_PROPOSAL_CANDIDATE_PROPERTIES,
  RESOURCE_REFERENCE_SCHEMA,
} from '../lib/graph/proposal/contract.ts';

const SYNTHETIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string' },
  },
};

const SYNTHETIC_SCHEMA_REORDERED = {
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
  type: 'object',
  additionalProperties: false,
};

const SYNTHETIC_SCHEMA_CHANGED = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'number' },
  },
};

void test('defineResultContract hash is independent of {id,version,schema} key order', () => {
  const fromOrderedInput = defineResultContract({
    id: 'test.synthetic.result',
    version: 1,
    schema: SYNTHETIC_SCHEMA,
  });
  const fromReorderedInput = defineResultContract({
    schema: SYNTHETIC_SCHEMA_REORDERED,
    version: 1,
    id: 'test.synthetic.result',
  });
  assert.equal(fromOrderedInput.hash, fromReorderedInput.hash);
  assert.deepEqual(contractIdentity(fromOrderedInput), {
    id: 'test.synthetic.result',
    version: 1,
    hash: fromOrderedInput.hash,
  });
});

void test('defineResultContract hash changes when a schema property changes', () => {
  const original = defineResultContract({
    id: 'test.synthetic.result',
    version: 1,
    schema: SYNTHETIC_SCHEMA,
  });
  const changed = defineResultContract({
    id: 'test.synthetic.result',
    version: 1,
    schema: SYNTHETIC_SCHEMA_CHANGED,
  });
  assert.notEqual(original.hash, changed.hash);
});

void test('defineResultContract validateStructure throws MaterializationError with boundary validation', () => {
  const contract = defineResultContract<{ name: string }>({
    id: 'test.synthetic.result',
    version: 1,
    schema: SYNTHETIC_SCHEMA,
  });
  assert.throws(
    () => contract.validateStructure({ name: 42 }),
    (error: unknown) => {
      assert.ok(error instanceof MaterializationError);
      assert.equal(error.boundary, 'validation');
      assert.match(error.message, /name/);
      return true;
    },
  );
  assert.doesNotThrow(() => contract.validateStructure({ name: 'ok' }));
});

void test('semanticResultHash is independent of object key order', () => {
  const value = { a: 1, b: [1, 2, 3], c: { x: 1, y: 2 } };
  const reordered = { c: { y: 2, x: 1 }, b: [1, 2, 3], a: 1 };
  assert.equal(semanticResultHash(value), semanticResultHash(reordered));
});

void test('semanticResultHash is sensitive to array order', () => {
  const value = { a: 1, b: [1, 2, 3] };
  const reorderedArray = { a: 1, b: [3, 2, 1] };
  assert.notEqual(
    semanticResultHash(value),
    semanticResultHash(reorderedArray),
  );
});

void test('semanticResultHash is sensitive to value changes', () => {
  const value = { a: 1, b: [1, 2, 3] };
  const changed = { a: 2, b: [1, 2, 3] };
  assert.notEqual(semanticResultHash(value), semanticResultHash(changed));
});

void test('canonicalJson omits undefined properties', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
});

const EXPECTED_FAILURE_BOUNDARY_STATUSES: readonly [
  MaterializationFailureBoundary,
  400 | 409,
][] = [
  ['validation', 400],
  ['identity', 400],
  ['staging', 400],
  ['stale-basis', 409],
  ['publication', 400],
];

void test('MaterializationError status is 409 for stale-basis and 400 otherwise', () => {
  assert.deepEqual(
    [...MATERIALIZATION_FAILURE_BOUNDARIES].sort(),
    EXPECTED_FAILURE_BOUNDARY_STATUSES.map(([boundary]) => boundary).sort(),
  );
  for (const [boundary, status] of EXPECTED_FAILURE_BOUNDARY_STATUSES) {
    const error = new MaterializationError(boundary, 'synthetic failure');
    assert.equal(error.boundary, boundary);
    assert.equal(error.status, status);
  }
});

void test('GRAPH_REFERENCE_SCHEMA accepts every reference kind', () => {
  const ajv = new Ajv2020({ strict: true });
  const validateReference = ajv.compile(GRAPH_REFERENCE_SCHEMA);
  assert.equal(validateReference({ kind: 'node', id: 'NODE-00000000' }), true);
  assert.equal(
    validateReference({ kind: 'candidate', id: 'CANDIDATE-0001' }),
    true,
  );
  assert.equal(
    validateReference({ kind: 'proposal', localKey: 'CANDIDATE-0001' }),
    true,
  );
});

void test('GRAPH_REFERENCE_SCHEMA rejects an unknown kind', () => {
  const ajv = new Ajv2020({ strict: true });
  const validateReference = ajv.compile(GRAPH_REFERENCE_SCHEMA);
  assert.equal(
    validateReference({ kind: 'mystery', id: 'NODE-00000000' }),
    false,
  );
});

void test('GRAPH_REFERENCE_SCHEMA rejects a node reference with a non-NODE id', () => {
  const ajv = new Ajv2020({ strict: true });
  const validateReference = ajv.compile(GRAPH_REFERENCE_SCHEMA);
  assert.equal(
    validateReference({ kind: 'node', id: 'CANDIDATE-0001' }),
    false,
  );
});

void test('GRAPH_REFERENCE_SCHEMA rejects a proposal reference with an empty localKey', () => {
  const ajv = new Ajv2020({ strict: true });
  const validateReference = ajv.compile(GRAPH_REFERENCE_SCHEMA);
  assert.equal(validateReference({ kind: 'proposal', localKey: '' }), false);
});

void test('GRAPH_REFERENCE_SCHEMA and GRAPH_PROPOSAL_CANDIDATE_PROPERTIES compile under Ajv2020 strict mode', () => {
  const ajv = new Ajv2020({ strict: true });
  assert.doesNotThrow(() => ajv.compile(GRAPH_REFERENCE_SCHEMA));
  assert.doesNotThrow(() =>
    ajv.compile({
      type: 'object',
      additionalProperties: false,
      required: Object.keys(GRAPH_PROPOSAL_CANDIDATE_PROPERTIES),
      properties: GRAPH_PROPOSAL_CANDIDATE_PROPERTIES,
    }),
  );
});

const EXPECTED_LOG_EVENT_PHASES: readonly [MaterializationLogEvent, string][] =
  [
    ['materialization.basis.prepared', 'PREPARE'],
    ['materialization.validated', 'VERIFY'],
    ['materialization.rejected', 'VERIFY'],
    ['materialization.identities.allocated', 'PUBLISH'],
    ['materialization.staged', 'PUBLISH'],
    ['materialization.stale', 'PUBLISH'],
    ['materialization.published', 'PUBLISH'],
    ['materialization.publication.failed', 'PUBLISH'],
  ];

void test('RESOURCE_REFERENCE_SCHEMA accepts a valid resource and rejects malformed entries', () => {
  const ajv = new Ajv2020({ strict: true });
  const validateResources = ajv.compile({
    type: 'array',
    items: RESOURCE_REFERENCE_SCHEMA,
  });
  assert.equal(validateResources([{ kind: 'doc', path: 'docs/a.md' }]), true);
  assert.equal(validateResources(['docs/a.md']), false);
  assert.equal(
    validateResources([{ kind: 'doc', path: 'docs/a.md', extra: true }]),
    false,
  );
});

void test('materializationLogEntry returns HOST actor entries matching LOG_EVENT_PATTERN', () => {
  assert.deepEqual(
    Object.keys(MATERIALIZATION_LOG_EVENTS).sort(),
    EXPECTED_LOG_EVENT_PHASES.map(([event]) => event).sort(),
  );
  for (const [event, phase] of EXPECTED_LOG_EVENT_PHASES) {
    const entry = materializationLogEntry(event, 'synthetic message');
    assert.equal(entry.actor, 'HOST');
    assert.equal(entry.level, 'INFO');
    assert.equal(entry.phase, phase);
    assert.match(entry.event, LOG_EVENT_PATTERN);
  }
});

void test('materializationLogEntry accepts an explicit level', () => {
  const entry = materializationLogEntry(
    'materialization.rejected',
    'synthetic rejection',
    'WARN',
  );
  assert.equal(entry.level, 'WARN');
});
