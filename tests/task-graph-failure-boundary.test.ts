import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import type { RegisteredProject } from '../lib/project-registry.ts';

const realFs = await import('node:fs/promises');
const { mkdtemp, readFile, readdir, rm, stat } = realFs;

type FsOp =
  | 'writeFile'
  | 'rename'
  | 'rm'
  | 'mkdir'
  | 'unlink'
  | 'readFile'
  | 'readdir';

type Injection = {
  op: FsOp;
  match: (target: string) => boolean;
  error: NodeJS.ErrnoException;
  remaining: number;
  skip: number;
};

let injections: Injection[] = [];
let calls: Array<{ op: FsOp; target: string; source?: string }> = [];

function fsError(code: string, target: string): NodeJS.ErrnoException {
  const error = new Error(
    `${code}: injected failure, '${target}'`,
  ) as NodeJS.ErrnoException;
  error.code = code;
  error.path = target;
  return error;
}

function injectOnce(
  op: FsOp,
  match: (target: string) => boolean,
  code = 'EIO',
  skip = 0,
) {
  const injection: Injection = {
    op,
    match,
    error: fsError(code, 'injected'),
    remaining: 1,
    skip,
  };
  injections.push(injection);
  return injection;
}

function resetInjections() {
  injections = [];
  calls = [];
}

function callsOf(op: FsOp) {
  return calls.filter((entry) => entry.op === op).map((entry) => entry.target);
}

function guard<T extends unknown[]>(
  op: FsOp,
  real: (...args: T) => Promise<unknown>,
) {
  return async (...args: T) => {
    const target = op === 'rename' ? String(args[1]) : String(args[0]);
    const source = op === 'rename' ? String(args[0]) : undefined;
    calls.push({ op, target, source });
    const hit = injections.find(
      (injection) =>
        injection.op === op &&
        injection.remaining > 0 &&
        injection.match(target),
    );
    if (hit) {
      if (hit.skip > 0) {
        hit.skip -= 1;
        return real(...args);
      }
      hit.remaining -= 1;
      hit.error.path = target;
      throw hit.error;
    }
    return real(...args);
  };
}

mock.module('node:fs/promises', {
  namedExports: {
    ...realFs,
    writeFile: guard('writeFile', realFs.writeFile as never),
    rename: guard('rename', realFs.rename as never),
    rm: guard('rm', realFs.rm as never),
    mkdir: guard('mkdir', realFs.mkdir as never),
    unlink: guard('unlink', realFs.unlink as never),
    readFile: guard('readFile', realFs.readFile as never),
    readdir: guard('readdir', realFs.readdir as never),
  },
});

const { createStartNode, updateStartNode, listTaskGraphNodes } =
  await import('../lib/task-graph.ts');
const { PublicApiError } = await import('../lib/api-errors.ts');

const managerHome = await mkdtemp(path.join(os.tmpdir(), 'am-tg-home-'));
process.env.AGENT_MANAGER_HOME = managerHome;

async function registerProject(project: RegisteredProject) {
  await realFs.writeFile(
    path.join(managerHome, 'config.json'),
    `${JSON.stringify({ schemaVersion: 1, projects: [project] }, null, 2)}\n`,
  );
  return import('../app/api/projects/[projectId]/nodes/route.ts');
}

async function makeProject() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'am-tg-fail-'));
  const project: RegisteredProject = {
    id: 'PROJECT-0001',
    kind: 'standalone',
    name: 'Failure Boundary Fixture',
    description: 'Deterministic failure injection fixture.',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, 'planning'),
    createdAt: new Date(0).toISOString(),
  };
  return {
    project,
    cleanup: () => rm(rootPath, { recursive: true, force: true }),
  };
}

function markdown(name: string, body: string) {
  return new File([body], name, { type: 'text/markdown' });
}

function nodesPath(project: RegisteredProject) {
  return path.join(project.planningPath, 'task-graph', 'nodes');
}

async function nodeDirectories(project: RegisteredProject) {
  const entries = await readdir(nodesPath(project)).catch(() => [] as string[]);
  return {
    published: entries.filter((entry) => entry.startsWith('NODE-')).sort(),
    temporary: entries.filter((entry) => entry.startsWith('.')).sort(),
  };
}

async function exists(target: string) {
  return stat(target).then(
    () => true,
    () => false,
  );
}

void test('the fixture drives the real create path', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const created = await createStartNode(project, {
      title: 'Source',
      contextRefs: [],
      files: [markdown('note.md', '# note\n')],
      idea: 'The first idea.',
    });
    assert.match(created.node.id, /^NODE-[0-9a-f]{8,32}$/);
    const state = await nodeDirectories(project);
    assert.deepEqual(state.published, [created.node.id]);
    assert.deepEqual(state.temporary, []);
    const idea = created.node.resources.find((r) => r.kind === 'idea');
    assert.ok(idea);
    const bytes = await readFile(
      path.join(project.planningPath, idea.path),
      'utf8',
    );
    assert.match(bytes, /The first idea\./);
  } finally {
    resetInjections();
    await cleanup();
  }
});

async function createSecond(project: RegisteredProject) {
  return createStartNode(project, {
    title: 'Second',
    contextRefs: [],
    files: [markdown('a.md', '# a\n'), markdown('b.md', '# b\n')],
    idea: 'second idea',
  });
}

async function expectNoPublication(project: RegisteredProject) {
  const state = await nodeDirectories(project);
  assert.deepEqual(state.published, [], 'no formal node may be published');
  assert.deepEqual(
    await listTaskGraphNodes(project),
    [],
    'a fresh reader must see no node',
  );
  return state;
}

for (const [label, arm] of [
  [
    'the idea resource',
    () =>
      injectOnce(
        'writeFile',
        (t) => t.includes('.tmp') && t.endsWith('idea.md'),
      ),
  ],
  [
    'an uploaded attachment',
    () =>
      injectOnce('writeFile', (t) => t.includes('.tmp') && t.endsWith('b.md')),
  ],
  [
    'the node record',
    () => injectOnce('writeFile', (t) => t.endsWith('node.json')),
  ],
  [
    'the publication rename',
    () => injectOnce('rename', (t) => /nodes\/NODE-[0-9a-f]+$/.test(t)),
  ],
] as Array<[string, () => void]>) {
  void test(`createStartNode publishes nothing when writing ${label} fails`, async () => {
    const { project, cleanup } = await makeProject();
    try {
      resetInjections();
      arm();
      await assert.rejects(
        () => createSecond(project),
        (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, 'EIO', 'the injected error stays primary');
          assert.ok(!(error instanceof PublicApiError));
          return true;
        },
      );
      const state = await expectNoPublication(project);
      assert.deepEqual(
        state.temporary,
        [],
        'cleanup removes the temporary directory',
      );
    } finally {
      resetInjections();
      await cleanup();
    }
  });
}

void test('createStartNode keeps the primary error when cleanup itself fails', async () => {
  const { project, cleanup } = await makeProject();
  try {
    resetInjections();
    injectOnce('writeFile', (t) => t.endsWith('node.json'), 'EIO');
    injectOnce('rm', () => true, 'EACCES');
    await assert.rejects(
      () => createSecond(project),
      (error: NodeJS.ErrnoException) => {
        assert.equal(
          error.code,
          'EIO',
          'a failing cleanup must not replace the reason the operation failed',
        );
        assert.equal(
          (error.cause as NodeJS.ErrnoException | undefined)?.code,
          'EACCES',
          'the cleanup failure is retained for Host diagnostics, not discarded',
        );
        return true;
      },
    );
    const state = await expectNoPublication(project);
    assert.equal(
      state.temporary.length,
      1,
      'the temporary directory remains when cleanup fails, and that is observable',
    );
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('createStartNode commits without any fallible work after publication', async () => {
  const { project, cleanup } = await makeProject();
  try {
    resetInjections();
    injectOnce('readFile', (t) => t.endsWith('node.json'));
    const created = await createSecond(project);

    assert.equal(
      callsOf('rm').length,
      0,
      'a committed node is never subjected to rollback cleanup',
    );
    assert.equal(
      created.nodes.at(-1)?.id,
      created.node.id,
      'the returned graph includes the node just committed',
    );

    const state = await nodeDirectories(project);
    assert.deepEqual(state.published, [created.node.id]);
    assert.deepEqual(state.temporary, []);
    assert.equal(
      injections[0]?.remaining,
      1,
      'publication never depended on the injected read',
    );

    resetInjections();
    const nodes = await listTaskGraphNodes(project);
    assert.equal(nodes.length, 1, 'a fresh reader sees the committed node');
    assert.equal(nodes[0]?.title, 'Second');
    const resources = await readdir(
      path.join(nodesPath(project), created.node.id, 'resources'),
    );
    assert.deepEqual(resources.sort(), ['a.md', 'b.md', 'idea.md']);

    await assert.rejects(
      () => createSecond(project),
      /This Canvas already has a Start node\./,
      'a retry follows the duplicate-Start rule rather than creating a second node',
    );
    assert.equal((await nodeDirectories(project)).published.length, 1);
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('an interrupted temporary directory is ignored by a fresh reader', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const created = await createStartNode(project, {
      title: 'Source',
      contextRefs: [],
      files: [],
      idea: 'an idea',
    });
    const orphan = path.join(
      nodesPath(project),
      '.NODE-deadbeef-abandoned.tmp',
    );
    await realFs.mkdir(path.join(orphan, 'resources'), { recursive: true });
    await realFs.writeFile(path.join(orphan, 'node.json'), '{"broken":true}\n');

    const nodes = await listTaskGraphNodes(project);
    assert.deepEqual(
      nodes.map((node) => node.id),
      [created.node.id],
      'a dot-prefixed leftover is not a node',
    );
    assert.ok(await exists(orphan), 'nothing reclaims it automatically');
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('creations in separate projects use distinct identities and temporary directories', async () => {
  const one = await makeProject();
  const two = await makeProject();
  try {
    resetInjections();
    const [first, second] = await Promise.all([
      createStartNode(one.project, {
        title: 'One',
        contextRefs: [],
        files: [],
        idea: 'a',
      }),
      createStartNode(two.project, {
        title: 'Two',
        contextRefs: [],
        files: [],
        idea: 'b',
      }),
    ]);
    assert.notEqual(first.node.id, second.node.id);
    assert.notEqual(first.node.uid, second.node.uid);
    const renames = calls
      .filter(
        (entry) => entry.op === 'rename' && /nodes\/NODE-/.test(entry.target),
      )
      .map((entry) => entry.source);
    assert.equal(
      new Set(renames).size,
      renames.length,
      'temporary paths are distinct',
    );
    assert.deepEqual((await nodeDirectories(one.project)).temporary, []);
    assert.deepEqual((await nodeDirectories(two.project)).temporary, []);
  } finally {
    resetInjections();
    await one.cleanup();
    await two.cleanup();
  }
});

async function seedNode(project: RegisteredProject) {
  return createStartNode(project, {
    title: 'Original title',
    contextRefs: [],
    files: [
      markdown('kept.md', '# kept\n'),
      markdown('dropped.md', '# dropped\n'),
    ],
    idea: 'original idea',
  });
}

async function inspect(project: RegisteredProject, nodeId: string) {
  const nodeDir = path.join(nodesPath(project), nodeId);
  const record = JSON.parse(
    await readFile(path.join(nodeDir, 'node.json'), 'utf8'),
  ) as { title: string; resources: Array<{ kind: string; path: string }> };
  const ideaRef = record.resources.find((resource) => resource.kind === 'idea');
  const ideaBytes = ideaRef
    ? await readFile(
        path.join(project.planningPath, ideaRef.path),
        'utf8',
      ).catch(() => '<missing>')
    : '<none>';
  const onDisk = (
    await readdir(path.join(nodeDir, 'resources')).catch(() => [] as string[])
  ).sort();
  const nodeDirEntries = (
    await readdir(nodeDir).catch(() => [] as string[])
  ).sort();
  const referenced = new Set(
    record.resources.map((resource) => path.basename(resource.path)),
  );
  const listed = await listTaskGraphNodes(project);
  return {
    title: record.title,
    referenced: [...referenced].sort(),
    ideaPath: ideaRef?.path ?? null,
    ideaBytes,
    onDisk,
    unreferenced: onDisk.filter((name) => !referenced.has(name)),
    nodeDirEntries,
    strayTemporaries: [...onDisk, ...nodeDirEntries]
      .filter((name) => name.endsWith('.tmp'))
      .sort(),
    listedTitle: listed.find((node) => node.id === nodeId)?.title ?? null,
  };
}

function updateInput(
  nodeId: string,
  retained: string[],
  files: File[],
  idea?: string,
) {
  return {
    id: nodeId,
    title: 'Updated title',
    contextRefs: [],
    retainedAttachmentRefs: retained,
    files,
    ...(idea === undefined ? {} : { idea }),
  };
}

for (const [label, arm, files] of [
  [
    'the first new attachment',
    () => injectOnce('writeFile', (t) => t.endsWith('first.md')),
    [markdown('first.md', '# 1\n'), markdown('second.md', '# 2\n')],
  ],
  [
    'a later new attachment',
    () => injectOnce('writeFile', (t) => t.endsWith('second.md')),
    [markdown('first.md', '# 1\n'), markdown('second.md', '# 2\n')],
  ],
  [
    'the staged idea',
    () => injectOnce('writeFile', (t) => /idea-\d+\.md$/.test(t)),
    [markdown('first.md', '# 1\n')],
  ],
  [
    'the temporary node record',
    () =>
      injectOnce(
        'writeFile',
        (t) => t.includes('.node-') && t.endsWith('.json.tmp'),
      ),
    [markdown('first.md', '# 1\n')],
  ],
  [
    'the node record rename',
    () => injectOnce('rename', (t) => t.endsWith('node.json')),
    [markdown('first.md', '# 1\n')],
  ],
] as Array<[string, () => void, File[]]>) {
  void test(`updateStartNode leaves one coherent state when ${label} fails`, async () => {
    const { project, cleanup } = await makeProject();
    try {
      const seed = await seedNode(project);
      const retained = seed.node.resources
        .filter((resource) => resource.kind !== 'idea')
        .map((resource) => resource.path);
      const before = await inspect(project, seed.node.id);

      resetInjections();
      arm();
      await assert.rejects(
        () =>
          updateStartNode(
            project,
            updateInput(seed.node.id, retained, files, 'updated idea'),
          ),
        (error: NodeJS.ErrnoException) => {
          assert.equal(error.code, 'EIO');
          assert.ok(!(error instanceof PublicApiError));
          return true;
        },
      );

      const after = await inspect(project, seed.node.id);
      assert.equal(
        after.title,
        'Original title',
        'the canonical record is unchanged',
      );
      assert.equal(
        after.ideaPath,
        before.ideaPath,
        'the referenced idea path is unchanged',
      );
      assert.equal(
        after.ideaBytes,
        before.ideaBytes,
        'referenced idea bytes cannot change while the record stays at its previous state',
      );
      assert.deepEqual(after.referenced, before.referenced);
      assert.deepEqual(
        after.strayTemporaries,
        [],
        'no stale temporary record remains',
      );
      assert.equal(
        after.listedTitle,
        'Original title',
        'a fresh reader sees one coherent state',
      );
      for (const name of after.unreferenced)
        assert.ok(
          !before.referenced.includes(name),
          'cleanup never removes a resource the record still references',
        );
    } finally {
      resetInjections();
      await cleanup();
    }
  });
}

void test('a failed pre-commit update removes its staged resources', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);
    const before = await inspect(project, seed.node.id);

    resetInjections();
    injectOnce('rename', (t) => t.endsWith('node.json'));
    await assert.rejects(() =>
      updateStartNode(
        project,
        updateInput(
          seed.node.id,
          retained,
          [markdown('staged.md', '# staged\n')],
          'updated idea',
        ),
      ),
    );

    const after = await inspect(project, seed.node.id);
    assert.deepEqual(after.onDisk, before.onDisk, 'staged resources are gone');
    assert.deepEqual(
      after.unreferenced,
      [],
      'nothing unreferenced is left behind',
    );
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a failed staged cleanup leaves an orphan but keeps references coherent', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);

    resetInjections();
    injectOnce('rename', (t) => t.endsWith('node.json'), 'EIO');
    injections.push({
      op: 'unlink',
      match: () => true,
      error: fsError('EACCES', 'cleanup'),
      remaining: 99,
      skip: 0,
    });
    await assert.rejects(
      () =>
        updateStartNode(
          project,
          updateInput(
            seed.node.id,
            retained,
            [markdown('staged.md', '# staged\n')],
            'updated idea',
          ),
        ),
      { code: 'EIO' },
    );

    const after = await inspect(project, seed.node.id);
    assert.equal(after.title, 'Original title');
    assert.equal(after.ideaBytes.split('\n')[0], '# Original title');
    assert.ok(
      after.unreferenced.length > 0,
      'the staged resources remain as orphans when cleanup cannot remove them',
    );
    for (const name of after.referenced)
      assert.ok(
        after.onDisk.includes(name),
        'every referenced resource still exists',
      );
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a post-commit removal failure leaves an orphan without contradicting the record', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const kept = seed.node.resources.find((r) => r.path.endsWith('kept.md'))!;

    resetInjections();
    injectOnce('unlink', (t) => t.endsWith('dropped.md'), 'EACCES');
    const updated = await updateStartNode(
      project,
      updateInput(seed.node.id, [kept.path], [], 'updated idea'),
    );

    const after = await inspect(project, seed.node.id);
    assert.equal(updated.node.title, 'Updated title');
    assert.equal(after.title, 'Updated title');
    assert.ok(after.unreferenced.includes('dropped.md'), 'the orphan remains');
    assert.ok(
      !after.referenced.includes('dropped.md'),
      'and is not referenced',
    );
    for (const name of after.referenced)
      assert.ok(
        after.onDisk.includes(name),
        'every referenced resource exists',
      );
    assert.equal(after.ideaBytes.split('\n')[0], '# Updated title');
  } finally {
    resetInjections();
    await cleanup();
  }
});

for (const [label, files, idea, expectIdeaMoved] of [
  ['a title-only update', [], undefined, false],
  ['an idea update with no new attachments', [], 'updated idea', true],
  [
    'an attachment update with no idea change',
    [markdown('added.md', '# added\n')],
    undefined,
    false,
  ],
] as Array<[string, File[], string | undefined, boolean]>) {
  void test(`${label} publishes one coherent state`, async () => {
    const { project, cleanup } = await makeProject();
    try {
      const seed = await seedNode(project);
      const retained = seed.node.resources
        .filter((resource) => resource.kind !== 'idea')
        .map((resource) => resource.path);
      const before = await inspect(project, seed.node.id);

      resetInjections();
      await updateStartNode(
        project,
        updateInput(seed.node.id, retained, files, idea),
      );

      const after = await inspect(project, seed.node.id);
      assert.equal(after.title, 'Updated title');
      assert.equal(after.listedTitle, 'Updated title');
      assert.deepEqual(after.strayTemporaries, []);
      assert.deepEqual(
        after.unreferenced,
        [],
        'no orphan is left by a successful update',
      );
      for (const name of after.referenced)
        assert.ok(
          after.onDisk.includes(name),
          'every referenced resource exists',
        );

      if (expectIdeaMoved) {
        assert.notEqual(
          after.ideaPath,
          before.ideaPath,
          'a changed idea is published at a new path',
        );
        assert.equal(after.ideaBytes.split('\n')[0], '# Updated title');
        assert.ok(
          !after.onDisk.includes(path.basename(before.ideaPath!)),
          'the superseded idea resource is cleaned up after commit',
        );
      } else {
        assert.equal(
          after.ideaPath,
          before.ideaPath,
          'an unchanged idea keeps its path',
        );
        assert.equal(after.ideaBytes, before.ideaBytes);
      }
      if (files.length > 0)
        assert.ok(
          after.referenced.includes('added.md'),
          'the new attachment is referenced',
        );
    } finally {
      resetInjections();
      await cleanup();
    }
  });
}

void test('a retry after a failed pre-commit update succeeds cleanly', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);

    resetInjections();
    injectOnce('rename', (t) => t.endsWith('node.json'));
    await assert.rejects(() =>
      updateStartNode(
        project,
        updateInput(
          seed.node.id,
          retained,
          [markdown('retry.md', '# retry\n')],
          'updated idea',
        ),
      ),
    );
    const failed = await inspect(project, seed.node.id);
    assert.equal(failed.title, 'Original title');

    resetInjections();
    const retried = await updateStartNode(
      project,
      updateInput(
        seed.node.id,
        retained,
        [markdown('retry.md', '# retry\n')],
        'updated idea',
      ),
    );

    const after = await inspect(project, seed.node.id);
    assert.equal(retried.node.title, 'Updated title');
    assert.equal(after.title, 'Updated title');
    assert.equal(after.ideaBytes.split('\n')[0], '# Updated title');
    assert.ok(after.referenced.includes('retry.md'));
    assert.deepEqual(
      after.unreferenced,
      [],
      'the retry leaves no orphan from the failed attempt',
    );
    assert.deepEqual(after.strayTemporaries, []);
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a retry after a failed staged cleanup chooses fresh names', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);

    resetInjections();
    injectOnce('rename', (t) => t.endsWith('node.json'), 'EIO');
    injections.push({
      op: 'unlink',
      match: () => true,
      error: fsError('EACCES', 'cleanup'),
      remaining: 99,
      skip: 0,
    });
    await assert.rejects(
      () =>
        updateStartNode(
          project,
          updateInput(
            seed.node.id,
            retained,
            [markdown('staged.md', '# staged\n')],
            'first retry idea',
          ),
        ),
      { code: 'EIO' },
    );
    const stranded = await inspect(project, seed.node.id);
    assert.ok(stranded.unreferenced.length > 0, 'orphans are left behind');

    resetInjections();
    const retried = await updateStartNode(
      project,
      updateInput(
        seed.node.id,
        retained,
        [markdown('staged.md', '# staged\n')],
        'second retry idea',
      ),
    );

    const after = await inspect(project, seed.node.id);
    assert.equal(retried.node.title, 'Updated title');
    assert.equal(after.title, 'Updated title');
    assert.equal(after.ideaBytes.split('\n')[0], '# Updated title');
    assert.notEqual(
      after.ideaPath,
      stranded.ideaPath,
      'the retry publishes the idea at a fresh path',
    );
    for (const name of after.referenced)
      assert.ok(
        after.onDisk.includes(name),
        'every referenced resource exists',
      );
    for (const name of stranded.unreferenced)
      assert.ok(
        !after.referenced.includes(name),
        'a prior orphan is never adopted as canonical',
      );
    assert.deepEqual(
      after.strayTemporaries.filter(
        (name) => !stranded.strayTemporaries.includes(name),
      ),
      [],
      'the retry adds no temporary record of its own',
    );
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a retry after a failed post-commit cleanup does not collide with the orphan', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);
    const originalIdea = path.basename(
      seed.node.resources.find((r) => r.kind === 'idea')!.path,
    );

    resetInjections();
    injectOnce('unlink', (t) => t.endsWith(originalIdea), 'EACCES');
    const first = await updateStartNode(
      project,
      updateInput(seed.node.id, retained, [], 'first idea'),
    );
    const orphaned = await inspect(project, seed.node.id);
    assert.ok(
      orphaned.unreferenced.includes(originalIdea),
      'the superseded idea survives its failed removal',
    );
    assert.equal(first.node.title, 'Updated title');

    resetInjections();
    const retried = await updateStartNode(
      project,
      updateInput(seed.node.id, retained, [], 'second idea'),
    );

    const after = await inspect(project, seed.node.id);
    assert.notEqual(after.ideaPath, orphaned.ideaPath);
    assert.ok(
      !after.referenced.includes(originalIdea),
      'the orphan is not reused as the published idea',
    );
    assert.equal(after.ideaBytes.split('\n')[0], '# Updated title');
    assert.match(
      await readFile(path.join(project.planningPath, after.ideaPath!), 'utf8'),
      /second idea/,
    );
    assert.equal(retried.node.title, 'Updated title');
    for (const name of after.referenced)
      assert.ok(
        after.onDisk.includes(name),
        'every referenced resource exists',
      );
    assert.deepEqual(after.strayTemporaries, []);
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('the create Route reports a committed node as success, not a retryable failure', async () => {
  const { project, cleanup } = await makeProject();
  try {
    await realFs.writeFile(
      path.join(managerHome, 'config.json'),
      `${JSON.stringify({ schemaVersion: 1, projects: [project] }, null, 2)}\n`,
    );
    const { POST } =
      await import('../app/api/projects/[projectId]/nodes/route.ts');

    resetInjections();
    injectOnce('readFile', (t) => t.endsWith('node.json'));

    const body = new FormData();
    body.set('title', 'Routed start');
    body.set('idea', 'a routed idea');
    body.append('files', markdown('routed.md', '# routed\n'));
    const response = await POST(
      new Request('http://localhost:3000/api/projects/PROJECT-0001/nodes', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
        body,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    assert.equal(
      response.status,
      201,
      'a committed node must not be reported as a failure the caller should retry',
    );
    const payload = (await response.json()) as {
      node: { id: string; title: string };
      nodes: Array<{ id: string }>;
    };
    assert.equal(payload.node.title, 'Routed start');
    assert.ok(
      payload.nodes.some((node) => node.id === payload.node.id),
      'the response carries the committed node rather than hiding it',
    );

    resetInjections();
    const state = await nodeDirectories(project);
    assert.deepEqual(state.published, [payload.node.id]);
    assert.deepEqual(state.temporary, []);

    const retry = await POST(
      new Request('http://localhost:3000/api/projects/PROJECT-0001/nodes', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
        body: (() => {
          const again = new FormData();
          again.set('title', 'Routed start');
          again.set('idea', 'a second routed idea');
          return again;
        })(),
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    assert.equal(
      retry.status,
      409,
      'the duplicate-Start rule answers 409, not the 400 of an earlier input check',
    );
    assert.equal(
      ((await retry.json()) as { error: string }).error,
      'This Canvas already has a Start node.',
    );
    assert.equal((await nodeDirectories(project)).published.length, 1);
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a failed create keeps both causes in Host diagnostics and neither in the response', async () => {
  const { project, cleanup } = await makeProject();
  const captured: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    captured.push(args.map((entry) => String(entry)).join(' '));
  };
  try {
    const { POST } = await registerProject(project);

    resetInjections();
    const primary = fsError('EIO', 'record');
    primary.message =
      'EIO: record write failed with token=ghp_abcdefghijklmnop01';
    const cleanupFailure = fsError('EACCES', 'cleanup');
    cleanupFailure.message =
      'EACCES: cleanup denied for ghp_zyxwvutsrqponml9876';
    injections.push({
      op: 'writeFile',
      match: (t) => t.endsWith('node.json'),
      error: primary,
      remaining: 1,
      skip: 0,
    });
    injections.push({
      op: 'rm',
      match: () => true,
      error: cleanupFailure,
      remaining: 1,
      skip: 0,
    });

    const body = new FormData();
    body.set('title', 'Diagnosed start');
    body.set('idea', 'a diagnosed idea');
    const response = await POST(
      new Request('http://localhost:3000/api/projects/PROJECT-0001/nodes', {
        method: 'POST',
        headers: { host: 'localhost:3000' },
        body,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    assert.equal(response.status, 500);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ['correlationId', 'error']);
    assert.equal(payload.error, 'Could not create the start node.');
    assert.match(String(payload.correlationId), /^[0-9a-f]{12}$/);
    const serialized = JSON.stringify(payload);
    assert.ok(
      !serialized.includes('EIO'),
      'no internal code reaches the client',
    );
    assert.ok(!serialized.includes('EACCES'));
    assert.ok(
      !serialized.includes(project.planningPath),
      'no path reaches the client',
    );

    const diagnostic = captured.find((line) =>
      line.includes(String(payload.correlationId)),
    );
    assert.ok(diagnostic, 'the failure is captured for Host diagnostics');
    assert.match(
      diagnostic,
      /EIO: record write failed/,
      'the primary cause is kept',
    );
    assert.match(
      diagnostic,
      /EACCES: cleanup denied/,
      'the cleanup cause is kept',
    );
    assert.match(diagnostic, /caused by/);
    assert.ok(
      !diagnostic.includes('ghp_abcdefghijklmnop01'),
      'a secret in the primary cause is redacted',
    );
    assert.ok(
      !diagnostic.includes('ghp_zyxwvutsrqponml9876'),
      'a secret in the attached cause is redacted too',
    );
    assert.equal(
      (diagnostic.match(/gh_\[redacted\]/g) ?? []).length,
      2,
      'both secrets pass through the same redaction',
    );
  } finally {
    console.error = realError;
    resetInjections();
    await cleanup();
  }
});

void test('a failed update keeps its cleanup failures in Host diagnostics, redacted', async () => {
  const { project, cleanup } = await makeProject();
  const captured: string[] = [];
  const realError = console.error;
  try {
    const seed = await seedNode(project);
    const retained = seed.node.resources
      .filter((resource) => resource.kind !== 'idea')
      .map((resource) => resource.path);
    const { PATCH } = await registerProject(project);

    resetInjections();
    const primary = fsError('EIO', 'record');
    primary.message = 'EIO: record rename failed with ghp_cccccccccccccccc33';
    const firstCleanup = fsError('EACCES', 'cleanup-a');
    firstCleanup.message = 'EACCES: cleanup denied for ghp_dddddddddddddddd44';
    const secondCleanup = fsError('EPERM', 'cleanup-b');
    secondCleanup.message = 'EPERM: second cleanup denied';
    injections.push({
      op: 'rename',
      match: (t) => t.endsWith('node.json'),
      error: primary,
      remaining: 1,
      skip: 0,
    });
    injections.push({
      op: 'unlink',
      match: () => true,
      error: firstCleanup,
      remaining: 1,
      skip: 0,
    });
    injections.push({
      op: 'unlink',
      match: () => true,
      error: secondCleanup,
      remaining: 1,
      skip: 0,
    });

    console.error = (...args: unknown[]) => {
      captured.push(args.map((entry) => String(entry)).join(' '));
    };
    const body = new FormData();
    body.set('id', seed.node.id);
    body.set('title', 'Diagnosed update');
    body.set('idea', 'a diagnosed update idea');
    for (const ref of retained) body.append('retainedAttachmentRefs', ref);
    body.append('files', markdown('staged.md', '# staged\n'));
    const response = await PATCH(
      new Request('http://localhost:3000/api/projects/PROJECT-0001/nodes', {
        method: 'PATCH',
        headers: { host: 'localhost:3000' },
        body,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    console.error = realError;

    assert.equal(response.status, 500);
    const payload = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ['correlationId', 'error']);
    assert.equal(payload.error, 'Could not update the start node.');
    const serialized = JSON.stringify(payload);
    for (const leak of ['EIO', 'EACCES', 'EPERM', project.planningPath])
      assert.ok(!serialized.includes(leak), `the client never sees ${leak}`);

    const diagnostic = captured.find((line) =>
      line.includes(String(payload.correlationId)),
    );
    assert.ok(diagnostic, 'the failure reaches Host diagnostics');
    assert.match(
      diagnostic,
      /EIO: record rename failed/,
      'the primary cause is kept',
    );
    assert.match(
      diagnostic,
      /EACCES: cleanup denied/,
      'the first cleanup failure is kept',
    );
    assert.match(
      diagnostic,
      /EPERM: second cleanup denied/,
      'so is the second',
    );
    assert.ok(!diagnostic.includes('ghp_cccccccccccccccc33'));
    assert.ok(!diagnostic.includes('ghp_dddddddddddddddd44'));
    assert.ok(
      (diagnostic.match(/gh_\[redacted\]/g) ?? []).length >= 2,
      'every cause passes through the same redaction',
    );

    const after = await inspect(project, seed.node.id);
    assert.equal(after.title, 'Original title', 'the record is untouched');
    assert.ok(
      after.unreferenced.length > 0,
      'the orphans the cleanup could not remove remain',
    );
  } finally {
    console.error = realError;
    resetInjections();
    await cleanup();
  }
});
