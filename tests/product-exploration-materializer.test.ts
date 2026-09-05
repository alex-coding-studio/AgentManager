import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStartNode } from '../lib/graph/task/model.ts';
import { prepareProductExplorationMaterializationBasis } from '../lib/modules/product-discovery/basis.ts';
import { materializeProductExplorationResult } from '../lib/modules/product-discovery/materializer.ts';
import type { ProductExplorationResult } from '../lib/modules/product-discovery/contract.ts';
import { MaterializationError } from '../lib/materialization/receipt.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';

async function fixture(t: test.TestContext) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'pe-materialize-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'materializer-project',
    name: 'Materializer fixture',
    kind: 'standalone',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  await mkdir(project.planningPath);
  const start = await createStartNode(
    project,
    {
      title: 'Build my local website',
      idea: 'Build it',
      contextRefs: [],
      files: [],
    },
    'whats-next',
  );
  return { project, startNodeId: start.node.id };
}

function candidate(localKey: string, startNodeId: string, dependsOn = []) {
  return {
    localKey,
    type: 'direction',
    title: 'Capture the item',
    summary: 'One sentence describing the proposed direction.',
    derivedFrom: [{ kind: 'node' as const, id: startNodeId }],
    dependsOn,
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: ['The reader already has the source material.'],
    outputMarkdown:
      '# Capture the item\n\n## Why this direction\n\n- It answers the stated need directly.\n- It can be judged without more evidence.\n\n## Assumptions\n\n- The reader already has the source material.',
    layer: 'discovery' as const,
    artifactKind: 'mvp' as const,
  };
}

async function basisFor(
  project: RegisteredProject,
  startNodeId: string,
  overrides: Record<string, unknown> = {},
) {
  return prepareProductExplorationMaterializationBasis(project, {
    operation: 'explore',
    intention: 'mvp-exploration',
    motion: 'unspecified',
    sourceNodeIds: [startNodeId],
    knownNodeIds: [startNodeId],
    acceptedCandidateIds: [],
    knownResourcePaths: [],
    reservedCandidateIds: [],
    currentCandidates: [],
    ...overrides,
  });
}

async function identityIndex(project: RegisteredProject) {
  return JSON.parse(
    await readFile(
      path.join(project.planningPath, 'whats-next', 'identities.json'),
      'utf8',
    ),
  ) as { aliases: Record<string, string> };
}

void test('a semantic result with no Harness anywhere materializes into identified Candidates', async (t) => {
  const { project, startNodeId } = await fixture(t);
  const basis = await basisFor(project, startNodeId);
  const result: ProductExplorationResult = {
    outcome: 'proposal',
    candidates: [
      candidate('first-direction', startNodeId),
      {
        ...candidate('second-direction', startNodeId),
        dependsOn: [{ kind: 'proposal' as const, localKey: 'first-direction' }],
      },
    ],
  };
  const materialized = await materializeProductExplorationResult(basis, result);
  assert.ok(materialized);
  const [first, second] = materialized.candidates;
  assert.ok(first && second);
  assert.match(first.candidateId, /^CANDIDATE-[0-9a-f]{8,}$/);
  assert.equal(first.revision, 1);
  assert.deepEqual(first.derivedFrom, [startNodeId]);
  assert.deepEqual(second.dependsOn, [first.candidateId]);
  assert.deepEqual(materialized.candidateAliases, {
    'first-direction': first.candidateId,
    'second-direction': second.candidateId,
  });
  const index = await identityIndex(project);
  assert.equal(index.aliases[first.candidateId], first.uid);
  assert.deepEqual(second.relations.dependsOn, [first.uid]);
  assert.equal('first-direction' in index.aliases, false);
});

void test('materialization preserves the order the producer proposed', async (t) => {
  const { project, startNodeId } = await fixture(t);
  const basis = await basisFor(project, startNodeId);
  const keys = ['charlie', 'alpha', 'bravo'];
  const materialized = await materializeProductExplorationResult(basis, {
    outcome: 'proposal',
    candidates: keys.map((key) => candidate(key, startNodeId)),
  });
  assert.ok(materialized);
  assert.deepEqual(
    keys.map((key) => materialized.candidateAliases![key]),
    materialized.candidates.map((record) => record.candidateId),
  );
});

void test('a result that fails validation consumes no identity', async (t) => {
  const { project, startNodeId } = await fixture(t);
  const basis = await basisFor(project, startNodeId);
  const before = await identityIndex(project);
  await assert.rejects(
    () =>
      materializeProductExplorationResult(basis, {
        outcome: 'proposal',
        candidates: [
          {
            ...candidate('first-direction', startNodeId),
            derivedFrom: [{ kind: 'node', id: 'NODE-00000099' }],
          },
        ],
      }),
    MaterializationError,
  );
  assert.deepEqual(await identityIndex(project), before);
});

void test('a non-proposal outcome materializes nothing', async (t) => {
  const { project, startNodeId } = await fixture(t);
  const basis = await basisFor(project, startNodeId);
  const before = await identityIndex(project);
  assert.equal(
    await materializeProductExplorationResult(basis, {
      outcome: 'no-change',
      reason: 'The current direction already answers the question.',
    }),
    null,
  );
  assert.deepEqual(await identityIndex(project), before);
});

void test('materializing against a basis another allocation overtook is refused with 409', async (t) => {
  const { project, startNodeId } = await fixture(t);
  const stale = await basisFor(project, startNodeId);
  const fresh = await basisFor(project, startNodeId);
  await materializeProductExplorationResult(fresh, {
    outcome: 'proposal',
    candidates: [candidate('first-direction', startNodeId)],
  });
  await assert.rejects(
    () =>
      materializeProductExplorationResult(stale, {
        outcome: 'proposal',
        candidates: [candidate('second-direction', startNodeId)],
      }),
    (error: unknown) =>
      error instanceof MaterializationError &&
      error.boundary === 'stale-basis' &&
      error.status === 409,
  );
});
