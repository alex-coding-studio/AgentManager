import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareProductExplorationMaterializationBasis } from '../lib/modules/product-discovery/basis.ts';
import { PRODUCT_EXPLORATION_RESULT_CONTRACT } from '../lib/modules/product-discovery/contract.ts';
import { allocateCandidateAliases } from '../lib/graph/identity-store.ts';
import {
  validateProductExplorationResult,
  type ProductExplorationValidationState,
} from '../lib/modules/product-discovery/materializer.ts';
import { MaterializationError } from '../lib/materialization/receipt.ts';
import type { ProductExplorationCandidate } from '../lib/modules/product-discovery/contract.ts';
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

function priorCandidate(localKey: string): ProductExplorationCandidate {
  return {
    localKey,
    type: 'direction',
    title: 'Capture the item',
    summary: 'One sentence describing the proposed direction.',
    derivedFrom: [{ kind: 'node', id: 'NODE-00000001' }],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: ['The reader already has the source material.'],
    outputMarkdown:
      '# Capture the item\n\n## Why this direction\n\n- It answers the stated need directly.\n- It can be judged without more evidence.\n\n## Assumptions\n\n- The reader already has the source material.',
    layer: 'discovery',
    artifactKind: 'mvp',
  };
}

function refineInput(sourceKey: string, targetId: string) {
  return {
    ...input(),
    operation: 'refine-candidate' as const,
    revisionTarget: {
      candidateId: targetId,
      revision: 1,
      uid: '00000000-0000-4000-8000-000000000001',
    },
    revisionSource: priorCandidate(sourceKey),
  };
}

void test('a refine basis carries a frozen copy of the Candidate being revised', async (t) => {
  const project = await fixture(t);
  const source = priorCandidate('CANDIDATE-abcdef01');
  const basis = await prepareProductExplorationMaterializationBasis(project, {
    ...input(),
    operation: 'refine-candidate',
    revisionTarget: {
      candidateId: 'CANDIDATE-abcdef01',
      revision: 1,
      uid: '00000000-0000-4000-8000-000000000001',
    },
    revisionSource: source,
  });
  assert.ok(basis.revisionSource);
  assert.equal(basis.revisionSource.localKey, 'CANDIDATE-abcdef01');
  source.assumptions.push('A later mutation by the caller.');
  assert.deepEqual(basis.revisionSource.assumptions, [
    'The reader already has the source material.',
  ]);
  assert.throws(() => {
    (basis.revisionSource!.assumptions as string[]).push('frozen');
  });
});

void test('a refine basis naming a different prior Candidate is refused', async (t) => {
  const project = await fixture(t);
  await assert.rejects(
    () =>
      prepareProductExplorationMaterializationBasis(
        project,
        refineInput('CANDIDATE-99999999', 'CANDIDATE-abcdef01'),
      ),
    (error: unknown) =>
      error instanceof MaterializationError && error.boundary === 'validation',
  );
});

void test('a refine validated without the prior Candidate is refused, not skipped', () => {
  const revised = priorCandidate('CANDIDATE-abcdef01');
  const state = {
    knownNodeIds: ['NODE-00000001'],
    acceptedCandidateIds: [],
    knownResourcePaths: [],
    reservedCandidateIds: [],
    currentCandidates: [],
    revisionTarget: { candidateId: 'CANDIDATE-abcdef01' },
    operation: 'refine-candidate',
    intention: 'mvp-exploration',
    motion: 'unspecified',
    productSourceNodeId: null,
    revisionSource: null,
  } satisfies ProductExplorationValidationState;
  const tampered = {
    ...revised,
    type: 'something-else',
    dependsOn: [{ kind: 'node' as const, id: 'NODE-00000001' }],
  };
  assert.throws(
    () =>
      validateProductExplorationResult(state, {
        outcome: 'proposal',
        candidates: [tampered],
      }),
    (error: unknown) =>
      error instanceof MaterializationError &&
      /requires the Candidate being revised/.test(error.message),
  );
  assert.throws(
    () =>
      validateProductExplorationResult(
        { ...state, revisionSource: revised },
        { outcome: 'proposal', candidates: [tampered] },
      ),
    (error: unknown) =>
      error instanceof MaterializationError &&
      /Refine cannot change Candidate type/.test(error.message),
  );
});
