import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  primarySourceResourcePaths,
  relatedContextNodeIds,
  writeAgentGraphContextWorkspace,
} from '../lib/agent-graph-context-workspace.ts';

void test('uses Start Resources as primary and narrows descendants to output.md', () => {
  const resources = [
    { kind: 'context', path: 'context/product/project.md' },
    { kind: 'output', path: 'task-graph/nodes/NODE-00000002/output.md' },
  ];

  assert.deepEqual(
    [...primarySourceResourcePaths('start', resources)],
    resources.map((resource) => resource.path),
  );
  assert.deepEqual(
    [...primarySourceResourcePaths('node', resources)],
    ['task-graph/nodes/NODE-00000002/output.md'],
  );
});

void test('limits related Context to the selected Node neighborhood', () => {
  const source = {
    id: 'NODE-00000002',
    derivedFrom: ['NODE-00000001'],
    dependsOn: ['NODE-00000003'],
    resources: [{ path: 'task-graph/nodes/NODE-00000002/output.md' }],
  };
  const nodes = [
    source,
    {
      id: 'NODE-00000001',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-00000001/output.md' }],
    },
    {
      id: 'NODE-00000003',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-00000003/output.md' }],
    },
    {
      id: 'NODE-00000004',
      derivedFrom: ['NODE-00000001'],
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-00000004/output.md' }],
    },
    {
      id: 'NODE-00000005',
      derivedFrom: ['NODE-00000002'],
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-00000005/output.md' }],
    },
    {
      id: 'NODE-00009999',
      dependsOn: [],
      resources: [{ path: 'task-graph/nodes/NODE-00009999/output.md' }],
    },
  ];

  assert.deepEqual([...relatedContextNodeIds(source, nodes)].sort(), [
    'NODE-00000001',
    'NODE-00000003',
    'NODE-00000004',
    'NODE-00000005',
  ]);
});

void test('writes primary and related Context without embedding content in the manifest', async () => {
  const runPath = await mkdtemp(path.join(tmpdir(), 'agent-manager-context-'));
  const workspace = await writeAgentGraphContextWorkspace(runPath, [
    {
      role: 'related',
      kind: 'context',
      logicalPath: 'context/product/project.md',
      content: 'related source',
    },
    {
      role: 'primary',
      kind: 'output',
      logicalPath: 'task-graph/nodes/NODE-00000002/output.md',
      content: 'current node boundary',
      nodeId: 'NODE-00000002',
    },
  ]);

  assert.equal(workspace.manifest.primary.length, 1);
  assert.equal(workspace.manifest.related.length, 1);
  assert.equal(workspace.manifest.primary[0]?.nodeId, 'NODE-00000002');
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
  const workspace = await writeAgentGraphContextWorkspace(runPath, [
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

void test('keeps inherited outputs from one related Node collision-free', async () => {
  const runPath = await mkdtemp(path.join(tmpdir(), 'agent-manager-context-'));
  const nodeId = 'NODE-eef14eef';
  const workspace = await writeAgentGraphContextWorkspace(runPath, [
    {
      role: 'related',
      kind: 'node-output',
      logicalPath: 'whats-next/nodes/NODE-4bd7bb2c/output.md',
      content: 'first inherited output',
      nodeId,
    },
    {
      role: 'related',
      kind: 'node-output',
      logicalPath: 'whats-next/nodes/NODE-8706750c/output.md',
      content: 'second inherited output',
      nodeId,
    },
    {
      role: 'related',
      kind: 'node-output',
      logicalPath: `whats-next/nodes/${nodeId}/output.md`,
      content: 'related node output',
      nodeId,
    },
  ]);

  assert.equal(workspace.manifest.related.length, 3);
  const workspacePaths = workspace.manifest.related.map(
    (entry) => entry.workspacePath,
  );
  assert.equal(new Set(workspacePaths).size, 3);
  assert.ok(workspacePaths.includes(`related/nodes/${nodeId}.md`));
  assert.equal(
    workspacePaths.filter((entry) => entry.includes(`${nodeId}-`)).length,
    2,
  );
});
