import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  prepareWhatToDoContext,
  renderDomainModelSummary,
} from '../lib/what-to-do-context.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type { TaskGraphNode } from '../lib/task-graph.ts';
import { whatToDoRunDirectory } from '../lib/what-to-do-storage.ts';

const runId = 'RUN-00000000-0000-4000-8000-000000000001';
const featureUid = '00000000-0000-4000-8000-000000000002';

async function fixture(t: test.TestContext) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'what-to-do-context-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const planningPath = path.join(rootPath, '.praxis');
  const nodeId = 'NODE-00000001';
  const nodePath = path.join(planningPath, 'whats-next/nodes', nodeId);
  await mkdir(nodePath, { recursive: true });
  await mkdir(path.join(planningPath, 'context/Product'), { recursive: true });
  await writeFile(path.join(rootPath, 'README.md'), '# Fixture repository\n');
  await writeFile(path.join(rootPath, 'AGENTS.md'), '# Project instructions\n');
  await writeFile(
    path.join(planningPath, 'context/Product/reference.md'),
    '# Product reference\n',
  );
  const node: TaskGraphNode = {
    schemaVersion: 1,
    id: nodeId,
    uid: featureUid,
    relations: { derivedFrom: [], dependsOn: [] },
    role: 'node',
    type: 'feature',
    title: 'Accepted Feature',
    summary: 'A complete accepted Product Design Feature.',
    status: 'accepted',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    resources: [
      { kind: 'output', path: `whats-next/nodes/${nodeId}/output.md` },
    ],
    derivedFrom: [],
    dependsOn: [],
    typeTemplateRef: nodeId,
    metadata: {},
    layer: 'product-design',
    artifactKind: 'feature',
  };
  await writeFile(
    path.join(nodePath, 'node.json'),
    `${JSON.stringify(node, null, 2)}\n`,
  );
  await writeFile(
    path.join(nodePath, 'output.md'),
    '# Accepted Feature\n\n## Behavior\n\nDeliver this behavior.\n',
  );
  const project: RegisteredProject = {
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'repository',
    name: 'Fixture',
    description: '',
    rootPath,
    codePath: rootPath,
    planningPath,
    createdAt: '2026-09-02T00:00:00.000Z',
  };
  return { project, planningPath, rootPath };
}

void test('What to Do prepares one frozen standard Packet', async (t) => {
  const { project, planningPath, rootPath } = await fixture(t);
  await mkdir(path.join(rootPath, 'src'));
  await writeFile(
    path.join(rootPath, 'src/index.ts'),
    'export const value = 1;\n',
  );
  const prepared = await prepareWhatToDoContext(project, runId, {
    instruction: 'Turn the accepted design into delivery boundaries.',
    sourceUids: [featureUid],
    profile: { agent: 'codex', model: 'gpt-5.6-luna', effort: 'high' },
    contextRefs: ['context/Product/reference.md'],
    repositoryEvidencePaths: ['src/index.ts'],
    files: [new File(['# External notes\n'], '../notes.md')],
  });

  assert.equal(prepared.packet.input?.kind, 'user-input');
  assert.match(prepared.userInput.content, /delivery boundaries/);
  assert.deepEqual(Object.keys(prepared.knownSources), [
    'whats-next/nodes/NODE-00000001/output.md',
  ]);
  assert.match(
    prepared.knownSources['whats-next/nodes/NODE-00000001/output.md']
      ?.content ?? '',
    /Deliver this behavior/,
  );
  assert.equal(prepared.repositoryFacts.root, await realpath(project.rootPath));
  assert.equal(prepared.domainModel.stateVersion, 0);
  assert.match(
    renderDomainModelSummary(prepared.domainModel),
    /## Entities\n\n- None/,
  );
  assert.ok(
    prepared.packet.references.some(
      (entry) => entry.kind === 'product-design-feature',
    ),
  );
  assert.ok(
    prepared.packet.references.some(
      (entry) => entry.kind === 'repository-facts',
    ),
  );
  assert.ok(
    prepared.packet.references.some(
      (entry) => entry.kind === 'domain-model-summary',
    ),
  );
  assert.ok(
    prepared.packet.references.some((entry) => entry.kind === 'domain-model'),
  );
  assert.deepEqual(
    prepared.packet.external.map((entry) => ({
      path: entry.logicalPath,
      attachment: entry.attachment,
    })),
    [
      {
        path: `what-to-do/runs/${runId}/attachments/001-..-notes.md`,
        attachment: {
          originalName: '../notes.md',
          mediaType: 'text/markdown',
          byteSize: 17,
          semanticKind: 'markdown',
        },
      },
    ],
  );
  assert.ok(prepared.knownEvidencePaths.includes('repository/README.md'));
  assert.ok(prepared.knownEvidencePaths.includes('repository/AGENTS.md'));
  assert.ok(prepared.knownEvidencePaths.includes('repository/src/index.ts'));
  assert.equal(prepared.knownEvidencePaths.includes('README.md'), false);

  const index = JSON.parse(
    await readFile(
      path.join(planningPath, 'what-to-do/runs', runId, 'context/index.json'),
      'utf8',
    ),
  );
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.primary.length, 4);
  assert.equal(index.related.length, 6);
});

void test('What to Do rejects incomplete input before publishing a Run workspace', async (t) => {
  const { project, planningPath } = await fixture(t);
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: '',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
    }),
    /User Input is required/,
  );
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: 'Prepare delivery.',
      sourceUids: [],
      profile: { agent: 'codex', model: '', effort: '' },
    }),
    /accepted Product Design Feature/,
  );
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: 'Prepare delivery.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
      files: [new File(['binary'], 'notes.pdf')],
    }),
    /Only Markdown files/,
  );
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: 'Prepare delivery.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
      repositoryEvidencePaths: ['../outside.md'],
    }),
    /Repository evidence changed or is unavailable/,
  );
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: 'Prepare delivery.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
      files: [
        new File([new Uint8Array([0xc3, 0x28])], 'notes.md', {
          type: 'text/markdown',
        }),
      ],
    }),
    /UTF-8 Markdown text/,
  );
  await assert.rejects(
    readFile(
      path.join(planningPath, 'what-to-do/runs', runId, 'context/index.json'),
    ),
  );
});

void test('Repository Summary is included only for its exact reusable Facts fingerprint', async (t) => {
  const { project, planningPath, rootPath } = await fixture(t);
  const initial = await prepareWhatToDoContext(project, runId, {
    instruction: 'Prepare delivery.',
    sourceUids: [featureUid],
    profile: { agent: 'codex', model: '', effort: '' },
  });
  const summaryPath = path.join(planningPath, 'what-to-do/repository-context');
  await mkdir(summaryPath, { recursive: true });
  await writeFile(path.join(summaryPath, 'summary.md'), '# Current summary\n');
  await writeFile(
    path.join(summaryPath, 'summary.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      repositoryFingerprint: initial.repositoryFacts.fingerprint,
      markdownSha256: createHash('sha256')
        .update('# Current summary\n')
        .digest('hex'),
    })}\n`,
  );
  const matching = await prepareWhatToDoContext(
    project,
    'RUN-00000000-0000-4000-8000-000000000004',
    {
      instruction: 'Prepare delivery again.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
    },
  );
  assert.ok(
    matching.packet.references.some(
      (entry) => entry.kind === 'repository-summary',
    ),
  );

  await writeFile(path.join(rootPath, 'README.md'), '# Changed repository\n');
  const stale = await prepareWhatToDoContext(
    project,
    'RUN-00000000-0000-4000-8000-000000000005',
    {
      instruction: 'Prepare after change.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
    },
  );
  assert.equal(
    stale.packet.references.some(
      (entry) => entry.kind === 'repository-summary',
    ),
    false,
  );
});

void test('BOM-prefixed Markdown keeps byte size and hash consistent', async (t) => {
  const { project } = await fixture(t);
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x58, 0x0a]);
  const prepared = await prepareWhatToDoContext(
    project,
    'RUN-00000000-0000-4000-8000-000000000006',
    {
      instruction: 'Prepare delivery.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
      files: [new File([bytes], 'bom.md', { type: 'text/markdown' })],
    },
  );
  const entry = prepared.packet.external[0]!;
  const stored = await readFile(
    path.join(prepared.workspace.root, entry.workspacePath),
  );
  assert.equal(entry.attachment?.byteSize, bytes.byteLength);
  assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(stored, Buffer.from(bytes));
});

void test('What to Do storage refuses a linked module directory', async (t) => {
  const { project, planningPath, rootPath } = await fixture(t);
  const outside = path.join(rootPath, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(planningPath, 'what-to-do'));
  await assert.rejects(
    whatToDoRunDirectory(project, runId, true),
    /Invalid What to Do storage directory/,
  );
});

void test('atomic staging never follows a pre-existing final Context link', async (t) => {
  const { project, planningPath, rootPath } = await fixture(t);
  const outside = path.join(rootPath, 'outside');
  const finalRun = path.join(planningPath, 'what-to-do/runs', runId);
  await mkdir(outside);
  await mkdir(finalRun, { recursive: true });
  await symlink(outside, path.join(finalRun, 'context'));
  await assert.rejects(
    prepareWhatToDoContext(project, runId, {
      instruction: 'Prepare delivery.',
      sourceUids: [featureUid],
      profile: { agent: 'codex', model: '', effort: '' },
    }),
  );
  await assert.rejects(readFile(path.join(outside, 'input/user-input.md')));
  const runs = await readFile(path.join(finalRun, 'context')).catch(() => null);
  assert.equal(runs, null);
});
