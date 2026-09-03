import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  readContextBrowser,
  readProductContext,
} from '../lib/product-context.ts';
import {
  resolveProductContextResource,
  validateProductContextReferences,
} from '../lib/product-context-resource.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import { createStartNode } from '../lib/task-graph.ts';
import { applyProposedDomainModel } from '../lib/domain-model.ts';
import { appendCardWorkRecord } from '../lib/just-do-it-worklog.ts';

void test('Product Context indexes only formal module outputs and exposes their real paths', async (t) => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'product-context-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'context-fixture',
    kind: 'standalone',
    name: 'Context fixture',
    description: '',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    createdAt: '',
  };
  await mkdir(project.planningPath);

  await writeNode(project, 'whats-next', {
    id: 'NODE-aaaaaaaa',
    uid: '11111111-1111-4111-8111-111111111111',
    title: 'Accepted Product Feature',
    summary: 'A stable product behavior.',
    status: 'accepted',
    layer: 'product-design',
  });
  await writeNode(project, 'whats-next', {
    id: 'NODE-bbbbbbbb',
    uid: '22222222-2222-4222-8222-222222222222',
    title: 'Unaccepted Feature',
    summary: 'This must stay out of Product Context.',
    status: 'candidate',
    layer: 'product-design',
  });
  await writeNode(project, 'task-graph', {
    id: 'NODE-cccccccc',
    uid: '33333333-3333-4333-8333-333333333333',
    title: 'Accepted Breakdown',
    summary: 'A stable scope boundary.',
    status: 'accepted',
  });
  await mkdir(path.join(project.planningPath, 'context', 'research'), {
    recursive: true,
  });
  await writeFile(
    path.join(project.planningPath, 'context', 'research', 'notes.md'),
    '# Research Notes\n\nA person or Agent maintains this file directly.\n',
  );

  const sections = await readProductContext(project);
  assert.deepEqual(
    sections.map((section) => section.slug),
    ['product-design', 'task-breakdown', 'research'],
  );
  assert.deepEqual(
    sections[0]?.documents.map((document) => ({
      title: document.title,
      path: document.path,
    })),
    [
      {
        title: 'Accepted Product Feature',
        path: 'whats-next/nodes/NODE-aaaaaaaa/output.md',
      },
    ],
  );
  assert.ok(
    sections.every((section) =>
      section.documents.every(
        (document) => document.title !== 'Unaccepted Feature',
      ),
    ),
  );

  const browser = await readContextBrowser(project, ['task-breakdown']);
  assert.deepEqual(
    browser.map((folder) => ({
      name: folder.name,
      title: folder.title,
      entries: folder.entries.map((entry) => entry.path),
    })),
    [
      {
        name: 'product-design',
        title: 'Product Design',
        entries: ['whats-next/nodes/NODE-aaaaaaaa/output.md'],
      },
      {
        name: 'research',
        title: 'Research',
        entries: ['context/research/notes.md'],
      },
    ],
  );

  assert.equal(
    (await resolveProductContextResource(project, 'context/research/notes.md'))
      ?.section,
    'research',
  );
  assert.equal(
    await resolveProductContextResource(
      project,
      'whats-next/nodes/NODE-bbbbbbbb/output.md',
    ),
    null,
  );
  await assert.rejects(
    () =>
      validateProductContextReferences(
        project,
        ['whats-next/nodes/NODE-aaaaaaaa/output.md'],
        ['product-design'],
      ),
    /no longer available/,
  );
});

void test('a current formal Domain summary can seed another module Start node', async (t) => {
  const rootPath = await mkdtemp(
    path.join(os.tmpdir(), 'product-context-domain-'),
  );
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'context-domain-fixture',
    kind: 'standalone',
    name: 'Context domain fixture',
    description: '',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    createdAt: '',
  };
  await mkdir(project.planningPath);
  const runId = 'RUN-11111111-2222-4333-8444-555555555555';
  await applyProposedDomainModel(project, {
    baseVersion: 0,
    runId,
    summary: 'Added Item.',
    proposed: {
      entities: [
        {
          id: 'NEW_ENTITY_ITEM',
          name: 'Item',
          meaning: 'A stored thing.',
          fields: [],
          provenance: 'explicit',
        },
      ],
      relationships: [],
      constraints: [],
    },
  });
  const summaryPath = `domain-model/runs/${runId}/summary.md`;
  await mkdir(path.join(project.planningPath, 'domain-model', 'runs', runId), {
    recursive: true,
  });
  await writeFile(
    path.join(project.planningPath, summaryPath),
    '# Domain Model\n\nItem is the root Entity.\n',
  );
  const staleSummaryPath =
    'domain-model/runs/RUN-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/summary.md';
  await mkdir(path.dirname(path.join(project.planningPath, staleSummaryPath)), {
    recursive: true,
  });
  await writeFile(
    path.join(project.planningPath, staleSummaryPath),
    '# Stale Domain Model\n',
  );
  assert.equal(
    await resolveProductContextResource(project, staleSummaryPath),
    null,
  );

  const created = await createStartNode(
    project,
    {
      title: 'Use the current model',
      idea: '',
      contextRefs: [summaryPath],
      files: [],
    },
    'whats-next',
  );
  assert.ok(
    created.node.resources.some(
      (resource) =>
        resource.kind === 'context' && resource.path === summaryPath,
    ),
  );
});

void test('only the final successful output of an accepted Action remains current Context', async (t) => {
  const rootPath = await mkdtemp(
    path.join(os.tmpdir(), 'product-context-action-'),
  );
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'context-action-fixture',
    kind: 'standalone',
    name: 'Context Action fixture',
    description: '',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    createdAt: '',
  };
  await mkdir(project.planningPath);
  const cardId = '11111111-2222-4333-8444-555555555555';
  const actionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const root = path.join(project.planningPath, 'implementation', 'cards');
  const oldOutput = `implementation/cards/${cardId}/00000002/output.md`;
  const currentOutput = `implementation/cards/${cardId}/00000003/output.md`;
  await appendCardWorkRecord(root, cardId, 0, {
    kind: 'user-input',
    stage: 'planning',
    actionId: null,
    text: 'Create the Card.',
  });
  await appendCardWorkRecord(
    root,
    cardId,
    1,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId,
      event: 'output-recorded',
      text: 'Recorded the first output.',
      refs: [oldOutput],
    },
    { 'output.md': '# Earlier output\n' },
  );
  await appendCardWorkRecord(
    root,
    cardId,
    2,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId,
      event: 'output-recorded',
      text: 'Recorded the corrected output.',
      refs: [currentOutput],
    },
    { 'output.md': '# Current output\n' },
  );
  await appendCardWorkRecord(
    root,
    cardId,
    3,
    {
      kind: 'system-event',
      stage: 'execution',
      actionId,
      event: 'user-accepted',
      text: 'Accepted the corrected output.',
      refs: [currentOutput],
    },
    {
      'planning-state.json': JSON.stringify({
        schemaVersion: 1,
        id: cardId,
        revision: 4,
        source: { title: 'Search delivery' },
        resources: [],
        plan: null,
        actions: [{ id: actionId, title: 'Build search' }],
        run: null,
        createdAt: '',
        updatedAt: '',
        finalizedAt: '',
        execution: {
          acceptedActionIds: [actionId],
          runs: [
            { actionId, status: 'succeeded', outputRef: oldOutput },
            { actionId, status: 'succeeded', outputRef: currentOutput },
          ],
        },
      }),
    },
  );

  assert.equal(await resolveProductContextResource(project, oldOutput), null);
  assert.equal(
    (await resolveProductContextResource(project, currentOutput))?.section,
    'task-execution',
  );
});

async function writeNode(
  project: RegisteredProject,
  graphRoot: 'whats-next' | 'task-graph',
  input: {
    id: string;
    uid: string;
    title: string;
    summary: string;
    status: string;
    layer?: 'product-design';
  },
) {
  const directory = path.join(
    project.planningPath,
    graphRoot,
    'nodes',
    input.id,
  );
  await mkdir(directory, { recursive: true });
  const outputPath = `${graphRoot}/nodes/${input.id}/output.md`;
  await writeFile(
    path.join(directory, 'output.md'),
    `# ${input.title}\n\n${input.summary}\n`,
  );
  await writeFile(
    path.join(directory, 'node.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: input.id,
        uid: input.uid,
        relations: { derivedFrom: [], dependsOn: [] },
        role: 'node',
        type: input.layer ? 'Product-Design-Feature' : 'Task',
        title: input.title,
        summary: input.summary,
        status: input.status,
        createdAt: '2026-09-02T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
        resources: [{ kind: 'output', path: outputPath }],
        dependsOn: [],
        typeTemplateRef: input.id,
        metadata: {},
        layer: input.layer,
        artifactKind: input.layer ? 'feature' : undefined,
      },
      null,
      2,
    )}\n`,
  );
}
