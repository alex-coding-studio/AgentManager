import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareProductExplorationMaterializationBasis } from '../lib/modules/product-discovery/basis.ts';
import { PRODUCT_EXPLORATION_RESULT_CONTRACT } from '../lib/modules/product-discovery/contract.ts';
import { allocateCandidateAliases } from '../lib/graph/identity-store.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';

async function fixture(t: test.TestContext) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'pe-basis-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'basis-project',
    name: 'Basis fixture',
    kind: 'standalone',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await mkdir(path.join(project.planningPath, 'whats-next'), {
    recursive: true,
  });
  return project;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    operation: 'explore' as const,
    intention: 'mvp-exploration' as const,
    motion: 'unspecified' as const,
    sourceNodeIds: ['NODE-00000001'],
    knownNodeIds: ['NODE-00000001'],
    acceptedCandidateIds: [],
    knownResourcePaths: ['context/product/project.md'],
    reservedCandidateIds: [],
    currentCandidates: [],
    ...overrides,
  };
}

void test('the basis carries Contract identity, a fingerprint and a prepared time', async (t) => {
  const project = await fixture(t);
  const basis = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
    () => '2026-09-05T00:00:00.000Z',
  );
  assert.deepEqual(basis.contract, {
    id: PRODUCT_EXPLORATION_RESULT_CONTRACT.id,
    version: PRODUCT_EXPLORATION_RESULT_CONTRACT.version,
    hash: PRODUCT_EXPLORATION_RESULT_CONTRACT.hash,
  });
  assert.match(basis.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(basis.preparedAt, '2026-09-05T00:00:00.000Z');
  assert.equal(basis.module, 'whats-next');
  assert.equal(basis.scope, 'whats-next');
  assert.deepEqual(basis.project, {
    id: project.id,
    planningPath: project.planningPath,
  });
});

void test('the basis carries no Agent request identity', async (t) => {
  const project = await fixture(t);
  const basis = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
  );
  const keys = Object.keys(basis);
  for (const forbidden of [
    'request',
    'sessionId',
    'requestId',
    'inputFingerprint',
    'revisionCandidateId',
    'knownCandidates',
  ]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} leaked`);
  }
});

void test('the basis is a frozen snapshot that later caller mutation cannot change', async (t) => {
  const project = await fixture(t);
  const nodes = ['NODE-00000001'];
  const candidates = [
    {
      candidateId: 'CANDIDATE-0001',
      revision: 1,
      dependsOn: ['NODE-00000001'],
    },
  ];
  const basis = await prepareProductExplorationMaterializationBasis(
    project,
    input({ knownNodeIds: nodes, currentCandidates: candidates }),
  );
  nodes.push('NODE-00000002');
  candidates[0]!.dependsOn.push('NODE-00000002');
  candidates.push({
    candidateId: 'CANDIDATE-0002',
    revision: 1,
    dependsOn: [],
  });
  assert.deepEqual(basis.knownNodeIds, ['NODE-00000001']);
  assert.equal(basis.currentCandidates.length, 1);
  assert.deepEqual(basis.currentCandidates[0]!.dependsOn, ['NODE-00000001']);
  assert.throws(() => {
    (basis.knownNodeIds as string[]).push('NODE-00000003');
  });
  assert.throws(() => {
    (basis as { preparedAt: string }).preparedAt = 'changed';
  });
});

void test('the fingerprint tracks the frozen graph state and ignores preparation time', async (t) => {
  const project = await fixture(t);
  const first = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
    () => '2026-09-05T00:00:00.000Z',
  );
  const later = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
    () => '2026-09-06T00:00:00.000Z',
  );
  assert.equal(first.fingerprint, later.fingerprint);
  const changed = await prepareProductExplorationMaterializationBasis(
    project,
    input({ knownNodeIds: ['NODE-00000001', 'NODE-00000002'] }),
  );
  assert.notEqual(first.fingerprint, changed.fingerprint);
});

void test('the identity fingerprint reflects the identity index on disk', async (t) => {
  const project = await fixture(t);
  const before = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
  );
  assert.match(before.identityFingerprint, /^[0-9a-f]{64}$/);
  await allocateCandidateAliases(
    project.planningPath,
    'whats-next',
    { localKeys: ['CANDIDATE-0001'] },
    before.identityFingerprint,
  );
  const after = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
  );
  assert.notEqual(after.identityFingerprint, before.identityFingerprint);
  assert.notEqual(after.fingerprint, before.fingerprint);
});

void test('Product Design completion records its source Node, other intentions do not', async (t) => {
  const project = await fixture(t);
  const design = await prepareProductExplorationMaterializationBasis(
    project,
    input({ intention: 'product-design-completion' }),
  );
  assert.equal(design.productSourceNodeId, 'NODE-00000001');
  const exploration = await prepareProductExplorationMaterializationBasis(
    project,
    input(),
  );
  assert.equal(exploration.productSourceNodeId, null);
});
