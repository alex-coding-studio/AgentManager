import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  primarySourceResourcePaths,
  relatedContextNodeIds,
  writeTaskDecompositionContextWorkspace,
} from '../lib/task-decomposition-context-workspace.ts';

void test('uses Start Resources as primary and narrows descendants to output.md', () => {
  const resources = [
    { kind: 'context', path: 'context/product/project.md' },
    { kind: 'output', path: 'task-graph/nodes/NODE-0002/output.md' },
  ];

  assert.deepEqual(
    [...primarySourceResourcePaths('start', resources)],
    resources.map((resource) => resource.path),
  );
  assert.deepEqual(
    [...primarySourceResourcePaths('node', resources)],
    ['task-graph/nodes/NODE-0002/output.md'],
  );
});

void test('limits related Context to the selected Node neighborhood', () => {
  const source = {
    id: 'NODE-0002',
    derivedFrom: ['NODE-0001'],
    dependsOn: ['NODE-0003'],
    resources: [{ path: 'task-graph/nodes/NODE-0002/output.md' }],
  };
  const nodes = [
    source,
    {
      id: 'NODE-0001',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-0001/output.md' }],
    },
    {
      id: 'NODE-0003',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-0003/output.md' }],
    },
    {
      id: 'NODE-0004',
      derivedFrom: ['NODE-0001'],
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-0004/output.md' }],
    },
    {
      id: 'NODE-0005',
      derivedFrom: ['NODE-0002'],
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-0005/output.md' }],
    },
    {
      id: 'NODE-9999',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-9999/output.md' }],
    },
  ];

  assert.deepEqual([...relatedContextNodeIds(source, nodes)].sort(), [
    'NODE-0001',
    'NODE-0003',
    'NODE-0004',
    'NODE-0005',
  ]);
});

void test('writes primary and related Context without embedding content in the manifest', async () => {
  const runPath = await mkdtemp(path.join(tmpdir(), 'agent-manager-context-'));
  const workspace = await writeTaskDecompositionContextWorkspace(runPath, [
    {
      role: 'related',
      kind: 'context',
      logicalPath: 'context/product/project.md',
      content: 'related source',
    },
    {
      role: 'primary',
      kind: 'output',
      logicalPath: 'task-graph/nodes/NODE-0002/output.md',
      content: 'current node boundary',
      nodeId: 'NODE-0002',
    },
  ]);

  assert.equal(workspace.manifest.primary.length, 1);
  assert.equal(workspace.manifest.related.length, 1);
  assert.equal(workspace.manifest.primary[0]?.nodeId, 'NODE-0002');
  assert.equal(
    await readFile(
      path.join(
        workspace.root,
        workspace.manifest.primary[0]?.workspacePath ?? '',
      ),
      'utf8',
    ),
    'current node boundary',
  );
  assert.doesNotMatch(
    JSON.stringify(workspace.manifest),
    /current node boundary/,
  );
});

void test('promotes an explicitly selected duplicate Resource to primary', async () => {
  const runPath = await mkdtemp(path.join(tmpdir(), 'agent-manager-context-'));
  const workspace = await writeTaskDecompositionContextWorkspace(runPath, [
    {
      role: 'related',
      kind: 'context',
      logicalPath: 'context/product/project.md',
      content: 'project',
    },
    {
      role: 'primary',
      kind: 'run-context',
      logicalPath: 'context/product/project.md',
      content: 'project',
    },
  ]);

  assert.equal(workspace.manifest.primary.length, 1);
  assert.equal(workspace.manifest.related.length, 0);
  assert.equal(workspace.manifest.primary[0]?.kind, 'run-context');
});
