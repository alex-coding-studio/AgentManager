import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskGraphNode } from '../lib/graph/task/model.ts';
import { buildTaskGraphLayout } from '../lib/graph/task/layout.ts';

function node(id: string, derivedFrom: string[] = []): TaskGraphNode {
  return {
    schemaVersion: 1,
    id,
    role: derivedFrom.length === 0 ? 'start' : 'node',
    type: derivedFrom.length === 0 ? 'source' : 'module',
    title: id,
    status: 'captured',
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
    resources: [],
    derivedFrom,
    dependsOn: [],
    typeTemplateRef: id,
    metadata: {},
  };
}

void test('builds formal lineage edges from derivedFrom', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-00000001'), node('NODE-00000002', ['NODE-00000001'])],
    [],
  );

  assert.deepEqual(graph.edges, [
    {
      id: 'derived:NODE-00000001:NODE-00000002',
      source: 'NODE-00000001',
      target: 'NODE-00000002',
      relation: 'lineage',
    },
  ]);
  assert.ok(
    position(graph, 'NODE-00000002').x > position(graph, 'NODE-00000001').x,
  );
});

void test('places each lineage generation in its own column', () => {
  const graph = buildTaskGraphLayout(
    [
      node('NODE-00000001'),
      node('NODE-00000002', ['NODE-00000001']),
      node('NODE-00000003', ['NODE-00000001']),
      node('NODE-00000004', ['NODE-00000002']),
    ],
    [],
  );

  const root = position(graph, 'NODE-00000001');
  const firstChild = position(graph, 'NODE-00000002');
  const secondChild = position(graph, 'NODE-00000003');
  const grandchild = position(graph, 'NODE-00000004');
  assert.ok(root.x < firstChild.x);
  assert.ok(root.x < secondChild.x);
  assert.ok(firstChild.x < grandchild.x);
  assert.ok(secondChild.x < grandchild.x);
  assert.notEqual(firstChild.x, secondChild.x);
  assert.notEqual(firstChild.y, secondChild.y);
  assert.ok(root.y > Math.min(firstChild.y, secondChild.y));
  assert.ok(root.y < Math.max(firstChild.y, secondChild.y));
});

void test('places a preview beside its source with a temporary edge', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-00000001')],
    [
      {
        id: 'REQUEST-PREVIEW-NODE-00000001',
        sourceNodeId: 'NODE-00000001',
        instruction: 'Split into modules',
        inheritedResourceCount: 1,
        additionalResourceCount: 2,
      },
    ],
  );

  const source = position(graph, 'NODE-00000001');
  const preview = position(graph, 'REQUEST-PREVIEW-NODE-00000001');
  assert.equal(preview.kind, 'preview');
  assert.deepEqual(preview.derivedFrom, ['NODE-00000001']);
  assert.ok(preview.x > source.x);
  assert.equal(graph.edges[0]?.relation, 'request');
});

void test('projects hidden cross-Layer Candidate lineage onto the visible Source', () => {
  const source = node('NODE-00000001');
  source.uid = 'source-uid';
  const graph = buildTaskGraphLayout(
    [source],
    [
      {
        id: 'CANDIDATE-0001',
        sourceNodeId: 'NODE-hidden',
        instruction: 'Synthesize one Feature',
        inheritedResourceCount: 3,
        additionalResourceCount: 0,
        kind: 'candidate',
        candidate: {
          candidateId: 'CANDIDATE-0001',
          uid: 'candidate-uid',
          relations: { derivedFrom: ['hidden-discovery-uid'], dependsOn: [] },
          revision: 1,
          type: 'feature',
          title: 'Unified Search',
          summary: 'One Product Design Feature.',
          derivedFrom: ['NODE-hidden'],
          dependsOn: [],
          resources: [],
          typeTemplateRef: null,
          metadata: {},
          presentation: {},
          assumptions: [],
          outputMarkdown:
            '# Unified Search\n\nOne Product Design Feature.\n\n## Why this direction\n\n- One.\n- Two.\n\n## Assumptions\n\n- None',
          layer: 'product-design',
          artifactKind: 'feature',
        },
      },
    ],
    source.id,
  );

  assert.deepEqual(graph.edges, [
    {
      id: 'derived:NODE-00000001:CANDIDATE-0001',
      source: 'NODE-00000001',
      target: 'CANDIDATE-0001',
      relation: 'request',
    },
  ]);
});

void test('keeps every sibling lineage edge while one Candidate is refining', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-00000001')],
    [
      {
        id: 'CANDIDATE-0001',
        sourceNodeId: 'NODE-00000001',
        instruction: 'Refine this direction',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'run',
        status: 'running',
        revisionOf: 'CANDIDATE-0001',
        derivedFrom: ['NODE-00000001'],
      },
      {
        id: 'CANDIDATE-0002',
        sourceNodeId: 'NODE-00000001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        derivedFrom: ['NODE-00000001'],
      },
    ],
  );

  assert.deepEqual(graph.edges.map((edge) => edge.id).sort(), [
    'derived:NODE-00000001:CANDIDATE-0001',
    'derived:NODE-00000001:CANDIDATE-0002',
  ]);
});

void test('drops lineage edges whose source is not present', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-00000002', ['NODE-00009999'])],
    [],
  );

  assert.deepEqual(graph.edges, []);
});

void test('renders execution dependencies separately from lineage', () => {
  const prerequisite = node('NODE-00000002', ['NODE-00000001']);
  const dependent = node('NODE-00000003', ['NODE-00000001']);
  dependent.dependsOn = ['NODE-00000002'];

  const graph = buildTaskGraphLayout(
    [node('NODE-00000001'), prerequisite, dependent],
    [],
  );

  assert.deepEqual(graph.edges.at(-1), {
    id: 'depends:NODE-00000003:NODE-00000002',
    source: 'NODE-00000003',
    target: 'NODE-00000002',
    relation: 'dependency',
  });
});

void test('lays out a dependency DAG from prerequisites on the left to dependents on the right', () => {
  const foundation = node('NODE-00000001');
  const search = node('NODE-00000002');
  search.dependsOn = [foundation.id];
  const photo = node('NODE-00000003');
  photo.dependsOn = [foundation.id, search.id];
  const activity = node('NODE-00000004');
  activity.dependsOn = [foundation.id, photo.id];

  const graph = buildTaskGraphLayout(
    [foundation, search, photo, activity],
    [],
    undefined,
    true,
  );

  assert.ok(position(graph, foundation.id).x < position(graph, search.id).x);
  assert.ok(position(graph, search.id).x < position(graph, photo.id).x);
  assert.ok(position(graph, photo.id).x < position(graph, activity.id).x);
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.relation === 'dependency' &&
        edge.source === foundation.id &&
        edge.target === search.id,
    ),
  );
});

void test('renders a dependency between Candidates in one proposal', () => {
  const graph = buildTaskGraphLayout(
    [node('NODE-00000001')],
    [
      {
        id: 'CANDIDATE-0001',
        sourceNodeId: 'NODE-00000001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        dependsOn: [],
      },
      {
        id: 'CANDIDATE-0002',
        sourceNodeId: 'NODE-00000001',
        instruction: '',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
        kind: 'candidate',
        dependsOn: ['CANDIDATE-0001'],
      },
    ],
  );

  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.id === 'depends:CANDIDATE-0002:CANDIDATE-0001' &&
        edge.relation === 'dependency',
    ),
  );
});

void test('places a request preview without colliding in the target rank', () => {
  const graph = buildTaskGraphLayout(
    [
      node('NODE-00000001'),
      node('NODE-00000002', ['NODE-00000001']),
      node('NODE-00000003', ['NODE-00000001']),
    ],
    [
      {
        id: 'REQUEST-PREVIEW-NODE-00000001',
        sourceNodeId: 'NODE-00000001',
        instruction: 'Split into modules',
        inheritedResourceCount: 1,
        additionalResourceCount: 0,
      },
    ],
  );

  const preview = position(graph, 'REQUEST-PREVIEW-NODE-00000001');
  const firstChild = position(graph, 'NODE-00000002');
  const secondChild = position(graph, 'NODE-00000003');
  assert.ok(Math.abs(preview.x - firstChild.x) < 60);
  assert.ok(Math.abs(preview.x - secondChild.x) < 60);
  assert.notEqual(preview.y, firstChild.y);
  assert.notEqual(preview.y, secondChild.y);
});

for (const feature of ['whats-next', 'task-decomposition'] as const) {
  void test(`${feature} acceptance preserves all coordinates across promotion and reload`, () => {
    const root = node('NODE-00000001');
    let previews = Array.from({ length: 5 }, (_, index) => ({
      id: `CANDIDATE-000${index + 1}`,
      sourceNodeId: root.id,
      instruction: '',
      inheritedResourceCount: 0,
      additionalResourceCount: 0,
      kind: 'candidate' as const,
      derivedFrom: [root.id],
    }));
    const originals = [...previews];
    const formal = [root];
    const baseline = buildTaskGraphLayout(formal, previews);

    for (const index of [1, 4, 0, 3, 2]) {
      const candidate = originals[index]!;
      const promoted = node(`NODE-000${formal.length + 1}`, [root.id]);
      promoted.provenance = {
        feature,
        candidateId: candidate.id,
        revision: 4,
        runId: 'RUN-0001',
      };
      formal.push(promoted);
      previews = previews.filter((entry) => entry.id !== candidate.id);
      const after = buildTaskGraphLayout(formal, previews);
      const reloaded = buildTaskGraphLayout(
        [...formal].reverse(),
        [...previews].reverse(),
      );
      for (const entry of after.nodes) {
        const originalId =
          formal.find((item) => item.id === entry.id)?.provenance
            ?.candidateId ?? entry.id;
        const previous = position(baseline, originalId);
        assert.deepEqual([entry.x, entry.y], [previous.x, previous.y]);
        const restored = position(reloaded, entry.id);
        assert.deepEqual([restored.x, restored.y], [entry.x, entry.y]);
      }
      assert.equal(after.edges.length, 5);
      assert.ok(
        after.edges.some(
          (edge) =>
            edge.source === root.id &&
            edge.target === promoted.id &&
            edge.relation === 'lineage',
        ),
      );
      assert.ok(!after.nodes.some((entry) => entry.id === candidate.id));
    }
  });
}

function position(graph: ReturnType<typeof buildTaskGraphLayout>, id: string) {
  const result = graph.nodes.find((candidate) => candidate.id === id);
  assert.ok(result);
  return result;
}
