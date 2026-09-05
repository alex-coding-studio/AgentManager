import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRuntimeDependencies } from '../lib/graph/runtime-dependencies.ts';
import { runAudit } from '../scripts/audit-runtime-dependencies.ts';
import {
  MATERIALIZATION_BOUNDARY_POLICY,
  materializationBoundaryMembers,
  materializationBoundaryViolations,
  materializationBoundaryPolicy,
  nonLiteralImports,
} from '../scripts/audit-materialization-boundary.ts';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const FIXTURES = 'tests/fixtures/materialization-boundary';

const graph = runAudit(PROJECT_ROOT);

function fixturePolicy(name: string) {
  return materializationBoundaryPolicy(`${FIXTURES}/${name}/`, []);
}

function analyzeFixture(name: string) {
  return analyzeRuntimeDependencies({
    projectRoot: PROJECT_ROOT,
    sourceRoots: [`${FIXTURES}/${name}`],
  });
}

function fixtureReport(name: string) {
  const policy = fixturePolicy(name);
  const fixture = analyzeFixture(name);
  return {
    guarded: policy.tiers.flatMap((tier) =>
      materializationBoundaryMembers(fixture, tier),
    ),
    violations: materializationBoundaryViolations(fixture, policy).map(
      (violation) => ({
        tier: violation.tier,
        chain: violation.chain.map((file) =>
          file.slice(`${FIXTURES}/${name}/`.length),
        ),
      }),
    ),
    nonLiteral: nonLiteralImports(fixture, policy).map((entry) =>
      entry.from.slice(`${FIXTURES}/${name}/`.length),
    ),
  };
}

void test('every guarded Materializer, Contract and adapter file exists and is analyzed', () => {
  const required = MATERIALIZATION_BOUNDARY_POLICY.requiredFiles;
  assert.ok(required.length > 0);
  for (const file of required) {
    assert.ok(existsSync(path.join(PROJECT_ROOT, file)), `${file} missing`);
    assert.ok(graph.modules.includes(file), `${file} not analyzed`);
  }
  for (const tier of MATERIALIZATION_BOUNDARY_POLICY.tiers) {
    assert.ok(
      materializationBoundaryMembers(graph, tier).length > 0,
      `tier ${tier.name} guards no file`,
    );
  }
});

void test('no guarded module reaches Agent transport, Harness, prompt, Context or Run code', () => {
  assert.deepEqual(
    materializationBoundaryViolations(graph).map((violation) =>
      violation.chain.join(' -> '),
    ),
    [],
  );
});

void test('no guarded module imports a computed specifier', () => {
  assert.deepEqual(nonLiteralImports(graph), []);
});

void test('a compliant fixture reports no violation', () => {
  const clean = fixtureReport('clean');
  assert.deepEqual(clean.guarded.sort(), [
    `${FIXTURES}/clean/lib/materialization/contract.ts`,
    `${FIXTURES}/clean/lib/modules/example/contract.ts`,
    `${FIXTURES}/clean/lib/modules/example/materializer.ts`,
  ]);
  assert.deepEqual(clean.violations, []);
  assert.deepEqual(clean.nonLiteral, []);
});

void test('an adapter may read its Harness', () => {
  const adapter = fixtureReport('adapter-ok');
  assert.deepEqual(adapter.guarded.sort(), [
    `${FIXTURES}/adapter-ok/lib/modules/example/contract.ts`,
    `${FIXTURES}/adapter-ok/lib/modules/example/producer-adapter.ts`,
  ]);
  assert.deepEqual(adapter.violations, []);
});

void test('the gate reports a Materializer that imports its Harness directly', () => {
  assert.deepEqual(fixtureReport('direct-harness').violations, [
    {
      tier: 'materializer',
      chain: [
        'lib/modules/example/materializer.ts',
        'lib/modules/example/harness.ts',
      ],
    },
  ]);
});

void test('the gate reports Agent transport reached through a helper', () => {
  assert.deepEqual(fixtureReport('transitive-agents').violations, [
    {
      tier: 'materializer',
      chain: [
        'lib/modules/example/materializer.ts',
        'lib/modules/example/helper.ts',
        'lib/agents/transport.ts',
      ],
    },
  ]);
});

void test('the gate reports a provider Session reached through a type-only import', () => {
  assert.deepEqual(fixtureReport('type-only-session').violations, [
    {
      tier: 'materializer',
      chain: ['lib/modules/example/materializer.ts', 'lib/agents/session.ts'],
    },
  ]);
});

void test('the gate reports a computed import that hides its target', () => {
  const dynamic = fixtureReport('dynamic-nonliteral');
  assert.deepEqual(dynamic.nonLiteral, ['lib/modules/example/materializer.ts']);
  assert.deepEqual(dynamic.violations, []);
});
