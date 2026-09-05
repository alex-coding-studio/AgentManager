import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../scripts/audit-runtime-dependencies.ts';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const MATERIALIZER_PREFIXES = ['lib/materialization/', 'lib/graph/proposal/'];

const MATERIALIZER_FILES = [
  'lib/materialization/contract.ts',
  'lib/materialization/hash.ts',
  'lib/materialization/basis.ts',
  'lib/materialization/receipt.ts',
  'lib/materialization/producer.ts',
  'lib/materialization/log.ts',
  'lib/graph/proposal/reference.ts',
  'lib/graph/proposal/contract.ts',
  'lib/graph/proposal/basis.ts',
  'lib/graph/proposal/validate.ts',
  'lib/graph/proposal/classify.ts',
  'lib/graph/proposal/dependencies.ts',
  'lib/modules/domain-modeling/materializer.ts',
];

const ADAPTER_FILES = [
  'lib/modules/product-discovery/producer-adapter.ts',
  'lib/modules/scope-decomposition/producer-adapter.ts',
  'lib/modules/domain-modeling/producer-adapter.ts',
  'lib/modules/delivery-planning/producer-adapter.ts',
];

const MODULE_CONTRACT_FILES = [
  'lib/modules/product-discovery/contract.ts',
  'lib/modules/scope-decomposition/contract.ts',
  'lib/modules/domain-modeling/contract.ts',
  'lib/modules/delivery-planning/contract.ts',
];

const AGENT_PREFIX = /^lib\/agents\//;
const RUN_SERVICE = /^lib\/modules\/[^/]+\/runs\.tsx?$/;

const MATERIALIZER_FORBIDDEN = [
  AGENT_PREFIX,
  RUN_SERVICE,
  /^lib\/modules\/[^/]+\/harness\.tsx?$/,
  /^lib\/modules\/[^/]+\/prompt\.tsx?$/,
  /^lib\/modules\/[^/]+\/context\.tsx?$/,
  /^lib\/graph\/agent\/run\.ts$/,
  /^lib\/graph\/agent\/input\.ts$/,
  /^lib\/graph\/agent\/context-workspace\.ts$/,
];

const ADAPTER_FORBIDDEN = [AGENT_PREFIX, RUN_SERVICE];

const graph = runAudit(PROJECT_ROOT);

const adjacency = new Map<string, string[]>();
for (const edge of [...graph.runtimeEdges, ...graph.typeOnlyEdges]) {
  const targets = adjacency.get(edge.from) ?? [];
  targets.push(edge.to);
  adjacency.set(edge.from, targets);
}

function isMaterializer(file: string) {
  return (
    MATERIALIZER_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
    MATERIALIZER_FILES.includes(file) ||
    MODULE_CONTRACT_FILES.includes(file)
  );
}

function isAdapter(file: string) {
  return ADAPTER_FILES.includes(file);
}

function reachableMatches(start: string, forbidden: RegExp[]) {
  const parents = new Map<string, string>([[start, '']]);
  const queue = [start];
  const violations: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (parents.has(next)) continue;
      parents.set(next, current);
      if (forbidden.some((pattern) => pattern.test(next))) {
        const chain = [next];
        let cursor = current;
        while (cursor) {
          chain.unshift(cursor);
          cursor = parents.get(cursor) ?? '';
        }
        violations.push(chain.join(' -> '));
        continue;
      }
      queue.push(next);
    }
  }
  return violations;
}

void test('every guarded Materializer, Contract and adapter file exists and is analyzed', () => {
  const expected = [
    ...MATERIALIZER_FILES,
    ...MODULE_CONTRACT_FILES,
    ...ADAPTER_FILES,
  ];
  assert.ok(expected.length > 0);
  for (const file of expected) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, file)), `${file} missing`);
    assert.ok(graph.modules.includes(file), `${file} not analyzed`);
  }
  assert.ok(
    graph.modules.filter(isMaterializer).length >=
      expected.length - ADAPTER_FILES.length,
  );
  assert.equal(graph.modules.filter(isAdapter).length, ADAPTER_FILES.length);
});

void test('Materializer and Contract modules never reach Agent transport, Harness, prompt, Context or Run code', () => {
  const violations = graph.modules
    .filter(isMaterializer)
    .flatMap((file) => reachableMatches(file, MATERIALIZER_FORBIDDEN));
  assert.deepEqual(violations, []);
});

void test('producer adapters read the Harness but never reach Agent transport or a Run service', () => {
  const violations = ADAPTER_FILES.flatMap((file) =>
    reachableMatches(file, ADAPTER_FORBIDDEN),
  );
  assert.deepEqual(violations, []);
});

void test('the guard detects a forbidden edge rather than passing vacuously', () => {
  const anyHarness = graph.modules.find((file) =>
    /^lib\/modules\/[^/]+\/harness\.ts$/.test(file),
  );
  assert.ok(anyHarness, 'no Harness module was analyzed');
  const detected = ADAPTER_FILES.flatMap((file) =>
    reachableMatches(file, [/^lib\/modules\/[^/]+\/harness\.tsx?$/]),
  );
  assert.ok(
    detected.length > 0,
    'adapters are expected to reach their Harness, so the walker must report it',
  );
});

void test('guarded modules contain no non-literal dynamic imports', () => {
  const unresolved = graph.unresolvedImports.filter(
    (entry) =>
      (isMaterializer(entry.from) || isAdapter(entry.from)) &&
      entry.reason === 'non-literal',
  );
  assert.deepEqual(unresolved, []);
});
