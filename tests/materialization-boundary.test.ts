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

const GUARDED_PREFIXES = ['lib/materialization/', 'lib/graph/proposal/'];

const GUARDED_FILES = [
  'lib/materialization/contract.ts',
  'lib/materialization/hash.ts',
  'lib/materialization/basis.ts',
  'lib/materialization/receipt.ts',
  'lib/materialization/producer.ts',
  'lib/materialization/log.ts',
  'lib/graph/proposal/reference.ts',
  'lib/graph/proposal/contract.ts',
];

const FORBIDDEN_PATTERNS = [
  /^lib\/agents\//,
  /^lib\/modules\/[^/]+\/harness\.tsx?$/,
  /^lib\/modules\/[^/]+\/prompt\.tsx?$/,
  /^lib\/modules\/[^/]+\/context\.tsx?$/,
  /^lib\/modules\/[^/]+\/runs\.tsx?$/,
  /^lib\/graph\/agent\/run\.ts$/,
  /^lib\/graph\/agent\/input\.ts$/,
  /^lib\/graph\/agent\/context-workspace\.ts$/,
];

function isGuarded(file: string) {
  return GUARDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isForbidden(file: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(file));
}

const graph = runAudit(PROJECT_ROOT);

const adjacency = new Map<string, Array<{ to: string; form: string }>>();
for (const edge of [...graph.runtimeEdges, ...graph.typeOnlyEdges]) {
  const targets = adjacency.get(edge.from) ?? [];
  targets.push({ to: edge.to, form: edge.form });
  adjacency.set(edge.from, targets);
}

function reachableForbidden(start: string) {
  const parents = new Map<string, string>([[start, '']]);
  const queue = [start];
  const violations: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    for (const { to } of adjacency.get(current) ?? []) {
      if (parents.has(to)) continue;
      parents.set(to, current);
      if (isForbidden(to)) {
        const chain = [to];
        let cursor = current;
        while (cursor) {
          chain.unshift(cursor);
          cursor = parents.get(cursor) ?? '';
        }
        violations.push(chain.join(' -> '));
        continue;
      }
      queue.push(to);
    }
  }
  return violations;
}

void test('every expected Materializer and Contract module exists and is analyzed', () => {
  const guarded = graph.modules.filter(isGuarded);
  assert.ok(guarded.length > 0);
  for (const file of GUARDED_FILES) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, file)), `${file} missing`);
    assert.ok(guarded.includes(file), `${file} not analyzed`);
  }
});

void test('Materializer and Contract modules never reach Agent transport, Harness, prompt, Context or Run code', () => {
  const violations = graph.modules
    .filter(isGuarded)
    .flatMap((file) => reachableForbidden(file));
  assert.deepEqual(violations, []);
});

void test('Materializer and Contract modules contain no non-literal dynamic imports', () => {
  const unresolved = graph.unresolvedImports.filter(
    (entry) => isGuarded(entry.from) && entry.reason === 'non-literal',
  );
  assert.deepEqual(unresolved, []);
});
