import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  bindIdentity,
  identifyEntity,
  candidatePromptView,
  type GraphIdentityIndex,
} from '../lib/graph-identity.ts';
import {
  ensureGraphIdentities,
  identifyCandidates,
  readIdentifiedEntities,
  reserveNodeIdentity,
  reservedCandidateAliases,
} from '../lib/graph-identity-store.ts';
import { buildTaskGraphLayout } from '../lib/task-graph-layout.ts';
import type { TaskGraphNode } from '../lib/task-graph.ts';

async function save(root: string, file: string, value: unknown) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

async function json(root: string, file: string) {
  return JSON.parse(await readFile(path.join(root, file), 'utf8'));
}

for (const scope of ['whats-next', 'task-graph'] as const) {
  void test(`${scope}: legacy migration retains identities across history, acceptance, expansion and reload`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'graph-identity-test-'));
    try {
      const runs = scope === 'task-graph' ? 'task-decomposition' : scope;
      const source = { id: 'NODE-0001', dependsOn: [] };
      const candidate = {
        candidateId: 'CANDIDATE-0001',
        revision: 1,
        derivedFrom: [source.id],
        dependsOn: [],
      };
      const sibling = {
        candidateId: 'CANDIDATE-0002',
        revision: 1,
        derivedFrom: [source.id],
        dependsOn: [candidate.candidateId],
      };
      const accepted = {
        id: 'NODE-0002',
        derivedFrom: [source.id],
        dependsOn: [],
        provenance: {
          candidateId: candidate.candidateId,
          revision: 2,
          runId: 'RUN-second',
        },
      };
      const firstRun = {
        result: { outcome: 'proposal', candidates: [candidate, sibling] },
      };
      await save(root, `${scope}/nodes/NODE-0001/node.json`, source);
      await save(root, `${scope}/nodes/NODE-0002/node.json`, accepted);
      await save(root, `${runs}/runs/RUN-first/run.json`, firstRun);
      await save(root, `${runs}/runs/RUN-second/run.json`, {
        result: {
          outcome: 'proposal',
          candidates: [{ ...candidate, revision: 2 }],
        },
      });
      await writeFile(
        path.join(root, scope, 'nodes/NODE-0002/output.md'),
        '# Preserve this Markdown\n',
      );

      await ensureGraphIdentities(root, scope);
      const start = await json(root, `${scope}/nodes/NODE-0001/node.json`);
      const promoted = await json(root, `${scope}/nodes/NODE-0002/node.json`);
      const first = await json(root, `${runs}/runs/RUN-first/run.json`);
      const second = await json(root, `${runs}/runs/RUN-second/run.json`);
      assert.equal(promoted.uid, first.result.candidates[0].uid);
      assert.equal(promoted.uid, second.result.candidates[0].uid);
      assert.deepEqual(promoted.relations.derivedFrom, [start.uid]);
      assert.deepEqual(first.result.candidates[1].relations.dependsOn, [
        promoted.uid,
      ]);
      const [displaySibling] = await readIdentifiedEntities(root, scope, [
        first.result.candidates[1],
      ]);
      assert.deepEqual(displaySibling!.dependsOn, ['NODE-0002']);
      assert.deepEqual(displaySibling!.relations.dependsOn, [promoted.uid]);
      assert.deepEqual(
        await json(
          root,
          `${scope}/identity-migration-backup/${runs}/runs/RUN-first/run.json`,
        ),
        firstRun,
      );
      assert.equal(
        await readFile(
          path.join(root, scope, 'nodes/NODE-0002/output.md'),
          'utf8',
        ),
        '# Preserve this Markdown\n',
      );

      const [child] = await identifyCandidates(root, scope, [
        {
          candidateId: 'CANDIDATE-0003',
          derivedFrom: ['NODE-0002'],
          dependsOn: ['CANDIDATE-0002'],
        },
      ]);
      assert.notEqual(child!.uid, promoted.uid);
      assert.deepEqual(child!.relations.derivedFrom, [promoted.uid]);
      assert.deepEqual(child!.relations.dependsOn, [
        first.result.candidates[1].uid,
      ]);
      const [refined] = await identifyCandidates(
        root,
        scope,
        [{ ...candidate, revision: 3 }],
        second.result.candidates[0],
      );
      assert.equal(refined!.uid, promoted.uid);
      assert.deepEqual(await reserveNodeIdentity(root, scope, promoted.uid), {
        id: 'NODE-0002',
        uid: promoted.uid,
      });

      await ensureGraphIdentities(root, scope, true);
      assert.equal(
        (await json(root, `${scope}/nodes/NODE-0002/node.json`)).uid,
        promoted.uid,
      );
      assert.deepEqual(
        await json(
          root,
          `${scope}/identity-migration-backup/${runs}/runs/RUN-first/run.json`,
        ),
        firstRun,
      );
      await rm(path.join(root, scope, 'nodes/NODE-0002'), { recursive: true });
      const replacement = await reserveNodeIdentity(root, scope);
      assert.equal(replacement.id, 'NODE-0003');
      assert.notEqual(replacement.uid, promoted.uid);
      assert.deepEqual(child!.relations.derivedFrom, [promoted.uid]);
      assert.ok(
        (await reservedCandidateAliases(root, scope)).includes(
          'CANDIDATE-0003',
        ),
      );
      await assert.rejects(
        () => identifyCandidates(root, scope, [candidate]),
        /already been allocated/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

void test('conflicting legacy identity claims fail before rewriting records', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'graph-identity-test-'));
  try {
    const first = {
      result: {
        outcome: 'proposal',
        candidates: [{ candidateId: 'CANDIDATE-0001', uid: randomUUID() }],
      },
    };
    const second = {
      result: {
        outcome: 'proposal',
        candidates: [{ candidateId: 'CANDIDATE-0001', uid: randomUUID() }],
      },
    };
    await save(root, 'whats-next/runs/RUN-first/run.json', first);
    await save(root, 'whats-next/runs/RUN-second/run.json', second);
    await assert.rejects(
      () => ensureGraphIdentities(root, 'whats-next'),
      /cannot change/,
    );
    assert.deepEqual(
      await json(root, 'whats-next/runs/RUN-first/run.json'),
      first,
    );
    assert.deepEqual(
      await json(root, 'whats-next/runs/RUN-second/run.json'),
      second,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('missing legacy targets remain unresolved rather than binding to a new object', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'graph-identity-test-'));
  try {
    await save(root, 'whats-next/runs/RUN-first/run.json', {
      result: {
        outcome: 'proposal',
        candidates: [
          { candidateId: 'CANDIDATE-0001', derivedFrom: ['NODE-0005'] },
        ],
      },
    });
    await ensureGraphIdentities(root, 'whats-next');
    const run = await json(root, 'whats-next/runs/RUN-first/run.json');
    const candidate = run.result.candidates[0];
    const fresh = await reserveNodeIdentity(root, 'whats-next');
    assert.equal(fresh.id, 'NODE-0006');
    assert.notEqual(candidate.relations.derivedFrom[0], fresh.uid);
    const [display] = await readIdentifiedEntities(root, 'whats-next', [
      candidate,
    ]);
    assert.deepEqual(display!.derivedFrom, ['NODE-0005']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('allocations are serialized and graph aliases are scoped', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'graph-identity-test-'));
  try {
    const allocations = await Promise.all(
      Array.from({ length: 12 }, () => reserveNodeIdentity(root, 'whats-next')),
    );
    assert.equal(new Set(allocations.map((entry) => entry.id)).size, 12);
    assert.equal(new Set(allocations.map((entry) => entry.uid)).size, 12);
    const otherGraph = await reserveNodeIdentity(root, 'task-graph');
    assert.equal(otherGraph.id, 'NODE-0001');
    assert.notEqual(otherGraph.uid, allocations[0]!.uid);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('identity reassignment is rejected and prompt aliases remain lightweight', () => {
  const index: GraphIdentityIndex = {
    schemaVersion: 1,
    aliases: {},
    nextNodeNumber: 1,
    formalAliases: [],
  };
  const uid = randomUUID();
  bindIdentity(index, 'CANDIDATE-0001', uid);
  assert.throws(
    () => bindIdentity(index, 'CANDIDATE-0001', randomUUID()),
    /cannot change/,
  );
  const candidate = identifyEntity({ candidateId: 'CANDIDATE-0001' }, index);
  assert.equal(candidatePromptView(candidate).uid, undefined);
  assert.equal(candidatePromptView(candidate).relations, undefined);
  assert.equal(candidatePromptView(candidate).candidateId, 'CANDIDATE-0001');
});

void test('stable relation endpoints and layout survive promotion even with stale display aliases', () => {
  const rootUid = randomUUID();
  const firstUid = randomUUID();
  const secondUid = randomUUID();
  const root = {
    id: 'NODE-0001',
    uid: rootUid,
    dependsOn: [],
  } as unknown as TaskGraphNode;
  const first = {
    id: 'CANDIDATE-0001',
    uid: firstUid,
    sourceNodeId: root.id,
    instruction: '',
    inheritedResourceCount: 0,
    additionalResourceCount: 0,
    relations: { derivedFrom: [rootUid], dependsOn: [] },
  };
  const second = {
    ...first,
    id: 'CANDIDATE-0002',
    uid: secondUid,
    relations: { derivedFrom: [rootUid], dependsOn: [firstUid] },
  };
  const before = buildTaskGraphLayout([root], [first, second]);
  const formal = {
    id: 'NODE-9999',
    uid: firstUid,
    relations: first.relations,
    derivedFrom: ['OUTDATED-ALIAS'],
    dependsOn: [],
  } as unknown as TaskGraphNode;
  const after = buildTaskGraphLayout([formal, root], [second]);
  for (const original of before.nodes) {
    const updated = after.nodes.find((node) => node.uid === original.uid)!;
    assert.deepEqual([updated.x, updated.y], [original.x, original.y]);
  }
  assert.ok(
    after.edges.some(
      (edge) =>
        edge.source === second.id &&
        edge.target === formal.id &&
        edge.relation === 'dependency',
    ),
  );
  assert.ok(
    after.edges.some(
      (edge) => edge.source === root.id && edge.target === formal.id,
    ),
  );
});
