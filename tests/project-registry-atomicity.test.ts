import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  StoreConsistencyError,
  createJsonStore,
} from '../lib/atomic-json-store.ts';

const REGISTRY_HOME = mkdtempSync(path.join(os.tmpdir(), 'am-registry-home-'));
process.env.PRAXIS_HOME = REGISTRY_HOME;

const registryFile = path.join(REGISTRY_HOME, 'config.json');

async function registryProjects() {
  try {
    const value = JSON.parse(await readFile(registryFile, 'utf8')) as {
      schemaVersion: number;
      projects: Array<{ id: string; name: string; rootPath: string }>;
    };
    return value;
  } catch {
    return { schemaVersion: 1, projects: [] };
  }
}

async function temporaryRoot(label: string) {
  return mkdtemp(path.join(os.tmpdir(), `am-registry-${label}-`));
}

async function exists(file: string) {
  return access(file).then(
    () => true,
    () => false,
  );
}

void test('eight concurrent registrations all survive in the registry', async () => {
  const { createProject, listProjects } =
    await import('../lib/project-registry.ts');
  const before = (await listProjects()).length;
  const roots = await Promise.all(
    Array.from({ length: 8 }, (_unused, index) =>
      temporaryRoot(`concurrent${index}`),
    ),
  );

  const created = await Promise.all(
    roots.map((rootPath, index) =>
      createProject({
        kind: 'standalone',
        name: `concurrent-${index}`,
        description: '',
        rootPath,
      }),
    ),
  );

  const saved = await listProjects();
  assert.equal(saved.length, before + 8);

  const savedIds = new Set(saved.map((project) => project.id));
  assert.equal(savedIds.size, saved.length);
  for (const project of created) assert.ok(savedIds.has(project.id));

  const savedNames = saved
    .map((project) => project.name)
    .filter((name) => name.startsWith('concurrent-'));
  assert.deepEqual(
    savedNames.sort(),
    created.map((project) => project.name).sort(),
  );
});

void test('every concurrently registered project also has its local file', async () => {
  const { listProjects } = await import('../lib/project-registry.ts');
  for (const project of await listProjects()) {
    const local = JSON.parse(
      await readFile(path.join(project.planningPath, 'project.json'), 'utf8'),
    ) as { id: string; rootPath: string };
    assert.equal(local.id, project.id);
    assert.equal(local.rootPath, project.rootPath);
  }
});

void test('an update never overwrites an unrelated saved project', async () => {
  const { createProject, listProjects, getProject } =
    await import('../lib/project-registry.ts');
  const existing = await listProjects();
  assert.ok(existing.length > 0);
  const witness = existing[existing.length - 1]!;

  await createProject({
    kind: 'standalone',
    name: 'later-arrival',
    description: '',
    rootPath: await temporaryRoot('later'),
  });

  assert.deepEqual(await getProject(witness.id), witness);
});

void test('the registry keeps its schema version and project identity shape', async () => {
  const saved = await registryProjects();
  assert.equal(saved.schemaVersion, 1);
  const project = saved.projects[0]!;
  assert.deepEqual(
    Object.keys(project).sort(),
    [
      'codePath',
      'createdAt',
      'description',
      'id',
      'kind',
      'name',
      'planningPath',
      'rootPath',
    ].sort(),
  );
  assert.match(
    project.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
});

void test('registering the same directory twice is still refused', async () => {
  const { createProject } = await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('duplicate');
  await createProject({
    kind: 'standalone',
    name: 'first',
    description: '',
    rootPath,
  });
  await assert.rejects(
    () =>
      createProject({
        kind: 'standalone',
        name: 'second',
        description: '',
        rootPath,
      }),
    /already registered/,
  );
});

void test('concurrent registrations of one directory admit exactly one', async () => {
  const { createProject, listProjects } =
    await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('race');
  const before = (await listProjects()).length;

  const outcomes = await Promise.allSettled(
    Array.from({ length: 4 }, (_unused, index) =>
      createProject({
        kind: 'standalone',
        name: `racing-${index}`,
        description: '',
        rootPath,
      }),
    ),
  );

  assert.equal(
    outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
    1,
  );
  assert.equal((await listProjects()).length, before + 1);
});

void test('a failed registry write rolls back the project-local file', async () => {
  const { createProject, listProjects } =
    await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('rollback');
  const before = await listProjects();

  await chmod(REGISTRY_HOME, 0o500);
  try {
    await assert.rejects(() =>
      createProject({
        kind: 'standalone',
        name: 'rolled-back',
        description: '',
        rootPath,
      }),
    );
  } finally {
    await chmod(REGISTRY_HOME, 0o700);
  }

  assert.equal(
    await exists(path.join(rootPath, '.praxis', 'project.json')),
    false,
  );
  assert.deepEqual(await listProjects(), before);
});

void test('a failed registry write restores a pre-existing project file byte for byte', async () => {
  const { createProject, listProjects } =
    await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('preexisting');
  const projectFile = path.join(rootPath, '.praxis', 'project.json');
  const sentinel =
    '{\n  "schemaVersion": 1,\n  "id": "sentinel-from-the-lost-update-bug"\n}\n';
  await mkdir(path.dirname(projectFile), { recursive: true });
  await writeFile(projectFile, sentinel);
  const before = await listProjects();

  await chmod(REGISTRY_HOME, 0o500);
  try {
    await assert.rejects(() =>
      createProject({
        kind: 'standalone',
        name: 'must-not-destroy-evidence',
        description: '',
        rootPath,
      }),
    );
  } finally {
    await chmod(REGISTRY_HOME, 0o700);
  }

  assert.equal(await readFile(projectFile, 'utf8'), sentinel);
  assert.deepEqual(await listProjects(), before);
});

void test('rollback removes the project file only when the registration created it', async () => {
  const { createProject } = await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('created');
  const projectFile = path.join(rootPath, '.praxis', 'project.json');

  await chmod(REGISTRY_HOME, 0o500);
  try {
    await assert.rejects(() =>
      createProject({
        kind: 'standalone',
        name: 'created-then-removed',
        description: '',
        rootPath,
      }),
    );
  } finally {
    await chmod(REGISTRY_HOME, 0o700);
  }

  assert.equal(await exists(projectFile), false);
});

void test('a failed rollback is reported instead of being swallowed', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'am-registry-both-'));
  const file = path.join(home, 'config.json');
  const store = createJsonStore<{ count: number }>(file, () => ({ count: 0 }));
  await store.update(async () => ({ next: { count: 1 }, result: null }));

  await chmod(home, 0o500);
  let raised: unknown;
  try {
    await store.update(async (current) => ({
      next: { count: current.count + 1 },
      result: null,
      rollback: () => Promise.reject(new Error('restore failed too')),
    }));
  } catch (error) {
    raised = error;
  } finally {
    await chmod(home, 0o700);
  }

  assert.ok(raised instanceof StoreConsistencyError);
  const failure = raised as StoreConsistencyError;
  assert.match((failure.writeError as Error).message, /EACCES/);
  assert.match((failure.rollbackError as Error).message, /restore failed too/);
  assert.match(failure.message, /EACCES/);
  assert.match(failure.message, /restore failed too/);
});

void test('a failed project metadata write leaves no partial file', async () => {
  const { createProject } = await import('../lib/project-registry.ts');
  const rootPath = await temporaryRoot('partial');
  const planningPath = path.join(rootPath, '.praxis');
  const projectFile = path.join(planningPath, 'project.json');
  const sentinel = '{"id":"kept"}\n';
  await mkdir(planningPath, { recursive: true });
  await writeFile(projectFile, sentinel);

  await chmod(planningPath, 0o500);
  try {
    await assert.rejects(() =>
      createProject({
        kind: 'standalone',
        name: 'partial-write',
        description: '',
        rootPath,
      }),
    );
  } finally {
    await chmod(planningPath, 0o700);
  }

  assert.equal(await readFile(projectFile, 'utf8'), sentinel);
  assert.deepEqual(
    (await readdir(planningPath)).filter((entry) => entry.endsWith('.tmp')),
    [],
  );
});

void test('a rejected registration leaves registry and local state agreeing', async () => {
  const { createProject, listProjects } =
    await import('../lib/project-registry.ts');
  const missing = path.join(os.tmpdir(), `am-registry-absent-${Date.now()}`);
  const before = await listProjects();

  await assert.rejects(
    () =>
      createProject({
        kind: 'standalone',
        name: 'never',
        description: '',
        rootPath: missing,
      }),
    /must be an existing directory/,
  );

  assert.deepEqual(await listProjects(), before);
  assert.equal(await exists(path.join(missing, '.praxis')), false);
});

void test('temporary files are collision safe and never replace an existing one', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'am-registry-tmp-'));
  const file = path.join(home, 'config.json');
  const store = createJsonStore<{ count: number }>(file, () => ({ count: 0 }));

  await Promise.all(
    Array.from({ length: 12 }, () =>
      store.update(async (current) => ({
        next: { count: current.count + 1 },
        result: current.count,
      })),
    ),
  );

  assert.equal((await store.read()).count, 12);
  assert.deepEqual(
    (await readdir(home)).filter((entry) => entry.endsWith('.tmp')),
    [],
  );
});

void test('a pre-existing target file is replaced without being truncated first', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'am-registry-replace-'));
  const file = path.join(home, 'config.json');
  const store = createJsonStore<{ count: number }>(file, () => ({ count: 0 }));

  await store.update(async () => ({ next: { count: 1 }, result: null }));
  const firstWrite = await readFile(file, 'utf8');
  await store.update(async (current) => ({
    next: { count: current.count + 1 },
    result: null,
  }));

  assert.equal(JSON.parse(firstWrite).count, 1);
  assert.equal((await store.read()).count, 2);
  assert.deepEqual(
    (await readdir(home)).filter((entry) => entry.endsWith('.tmp')),
    [],
  );
});

void test('the serialized update boundary is process local and documented', async () => {
  const doc = await readFile(
    new URL('../docs/PROJECT_REGISTRY.md', import.meta.url),
    'utf8',
  );
  assert.match(doc, /\*\*The boundary is process-local\.\*\*/);
  assert.match(doc, /would need a real file lock, which is not implemented/);
});
