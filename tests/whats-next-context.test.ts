import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readWhatsNextInstructions,
  saveWhatsNextInstructions,
  readWhatsNextContext,
} from '../lib/whats-next-context.ts';
import { buildWhatsNextContinuationPrompt } from '../lib/whats-next-prompt.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'whats-next-instructions-test-'),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const project: RegisteredProject = {
    id: 'test',
    kind: 'standalone',
    name: 'Test',
    description: '',
    rootPath: root,
    codePath: null,
    planningPath: path.join(root, 'planning'),
    createdAt: new Date().toISOString(),
  };
  await mkdir(project.planningPath);
  return project;
}

void test('new project Instructions are empty without creating files or seeding product answers', async (t) => {
  const project = await fixture(t);
  assert.deepEqual(await readWhatsNextContext(project), {
    instructions: '',
    attachments: [],
  });
  await saveWhatsNextInstructions(project, '');
  assert.deepEqual(await readdir(project.planningPath), []);
});

void test('Instructions persist exactly, update, and clear without changing graph files', async (t) => {
  const project = await fixture(t);
  const graph = path.join(project.planningPath, 'whats-next', 'nodes');
  await mkdir(graph, { recursive: true });
  await writeFile(path.join(graph, 'keep.json'), '{"unchanged":true}');
  await saveWhatsNextInstructions(project, '请使用中文。\n保留我的原始约束。');
  assert.equal(
    await readWhatsNextInstructions(project),
    '请使用中文。\n保留我的原始约束。',
  );
  await saveWhatsNextInstructions(project, 'Keep responses concise.');
  assert.equal(
    (await readWhatsNextContext(project)).instructions,
    'Keep responses concise.',
  );
  await saveWhatsNextInstructions(project, '');
  assert.equal(await readWhatsNextInstructions(project), '');
  assert.equal(
    await readFile(path.join(graph, 'keep.json'), 'utf8'),
    '{"unchanged":true}',
  );
  assert.ok(
    !(await readdir(path.dirname(graph))).some((name) => name.endsWith('.tmp')),
  );
});

void test('invalid and oversized writes preserve existing Instructions', async (t) => {
  const project = await fixture(t);
  await saveWhatsNextInstructions(project, 'Keep this.');
  await assert.rejects(
    () => saveWhatsNextInstructions(project, 'x'.repeat(20_001)),
    /20000/,
  );
  await assert.rejects(() =>
    saveWhatsNextInstructions(project, null as unknown as string),
  );
  assert.equal(await readWhatsNextInstructions(project), 'Keep this.');
});

void test('linked or invalid context files fail instead of silently clearing settings', async (t) => {
  const project = await fixture(t);
  const dir = path.join(project.planningPath, 'whats-next');
  await mkdir(dir);
  const outside = path.join(project.rootPath, 'outside.md');
  await writeFile(outside, 'Do not read or replace this.');
  await symlink(outside, path.join(dir, 'instructions.md'));
  await assert.rejects(() => readWhatsNextInstructions(project), /Invalid/);
  await assert.rejects(
    () => saveWhatsNextInstructions(project, 'Replacement'),
    /Invalid/,
  );
  assert.equal(await readFile(outside, 'utf8'), 'Do not read or replace this.');
});

void test('linked module directories cannot redirect Instructions writes', async (t) => {
  const project = await fixture(t);
  const outside = path.join(project.rootPath, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(project.planningPath, 'whats-next'));
  await assert.rejects(
    () => saveWhatsNextInstructions(project, 'Replacement'),
    /directory/,
  );
  assert.deepEqual(await readdir(outside), []);
});

void test('continued prompts explicitly replace module Instructions, including clearing', () => {
  const prompt = buildWhatsNextContinuationPrompt({ projectInstructions: '' });
  assert.match(prompt, /"projectInstructions": ""/);
  assert.match(prompt, /empty string clears earlier module instructions/);
  assert.match(prompt, /does not remove the Harness or output contract/);
});
