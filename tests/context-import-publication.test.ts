import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import type { RegisteredProject } from '../lib/project-registry.ts';

const realFs = await import('node:fs/promises');

type FsOp =
  | 'writeFile'
  | 'rename'
  | 'unlink'
  | 'readFile'
  | 'readdir'
  | 'stat'
  | 'mkdir';

type Injection = {
  op: FsOp;
  match: (target: string) => boolean;
  error: NodeJS.ErrnoException;
  remaining: number;
  skip: number;
};

let injections: Injection[] = [];
let calls: Array<{ op: FsOp; target: string }> = [];

function fsError(code: string, message = `${code}: injected failure`) {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function inject(
  op: FsOp,
  match: (target: string) => boolean,
  error: NodeJS.ErrnoException = fsError('EIO'),
  options: { remaining?: number; skip?: number } = {},
) {
  const injection: Injection = {
    op,
    match,
    error,
    remaining: options.remaining ?? 1,
    skip: options.skip ?? 0,
  };
  injections.push(injection);
  return injection;
}

function resetInjections() {
  injections = [];
  calls = [];
}

function guard<T extends unknown[]>(
  op: FsOp,
  real: (...args: T) => Promise<unknown>,
) {
  return async (...args: T) => {
    const target = op === 'rename' ? String(args[1]) : String(args[0]);
    calls.push({ op, target });
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
    unlink: guard('unlink', realFs.unlink as never),
    readFile: guard('readFile', realFs.readFile as never),
    readdir: guard('readdir', realFs.readdir as never),
    stat: guard('stat', realFs.stat as never),
    mkdir: guard('mkdir', realFs.mkdir as never),
  },
});

const { importTaskDecompositionAttachments, readTaskDecompositionContext } =
  await import('../lib/modules/scope-decomposition/context.ts');
const { PublicApiError } = await import('../lib/api-errors.ts');

const managerHome = await realFs.mkdtemp(
  path.join(os.tmpdir(), 'am-ctx-home-'),
);
process.env.PRAXIS_HOME = managerHome;

const HOST = 'localhost:3000';
const EXISTING_ATTACHMENT = '# Existing\n\nexisting attachment bytes\n';

async function makeProject() {
  const rootPath = await realFs.mkdtemp(path.join(os.tmpdir(), 'am-ctx-fail-'));
  const project: RegisteredProject = {
    id: 'PROJECT-0001',
    kind: 'standalone',
    name: 'Context Publication Fixture',
    description: 'Deterministic import failure fixture.',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, 'planning'),
    createdAt: new Date(0).toISOString(),
  };
  await realFs.writeFile(
    path.join(managerHome, 'config.json'),
    `${JSON.stringify({ schemaVersion: 1, projects: [project] }, null, 2)}\n`,
  );
  return {
    project,
    attachmentsPath: path.join(
      project.planningPath,
      'task-decomposition',
      'attachments',
    ),
    cleanup: () => realFs.rm(rootPath, { recursive: true, force: true }),
  };
}

async function seedAttachment(project: RegisteredProject) {
  await importTaskDecompositionAttachments(project, [
    markdown('existing.md', EXISTING_ATTACHMENT),
  ]);
}

function markdown(name: string, body: string) {
  return new File([body], name, { type: 'text/markdown' });
}

function twoDocuments() {
  return [
    markdown('first.md', '# First\n\nfirst replacement\n'),
    markdown('second.md', '# Second\n\nsecond replacement\n'),
  ];
}

async function snapshot(directory: string) {
  const names = (await realFs.readdir(directory)).sort();
  const entries = await Promise.all(
    names.map(async (name) => [
      name,
      (await realFs.readFile(path.join(directory, name))).toString('hex'),
    ]),
  );
  return Object.fromEntries(entries) as Record<string, string>;
}

function hex(value: string | Buffer) {
  return Buffer.from(value).toString('hex');
}

async function attachmentNames(project: RegisteredProject) {
  return (await readTaskDecompositionContext(project)).attachments.map(
    (attachment) => attachment.fileName,
  );
}

function readsAfterLastPublication() {
  const publications = calls
    .map((entry, index) => ({ ...entry, index }))
    .filter(
      (entry) =>
        (entry.op === 'writeFile' || entry.op === 'rename') &&
        /\.(md|markdown|json)$/i.test(entry.target) &&
        !entry.target.endsWith('.tmp') &&
        !entry.target.endsWith('settings.json') &&
        !entry.target.endsWith('config.json'),
    );
  const last = publications.at(-1)?.index ?? -1;
  return calls
    .slice(last + 1)
    .filter((entry) => ['readFile', 'readdir', 'stat'].includes(entry.op))
    .map((entry) => `${entry.op} ${path.basename(entry.target)}`);
}

async function captureDiagnostics<T>(run: () => Promise<T>) {
  const captured: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) =>
    captured.push(parts.map((part) => String(part)).join(' '));
  try {
    return { result: await run(), captured };
  } finally {
    console.error = original;
  }
}

async function attachmentsRoute() {
  return import('../app/api/projects/[projectId]/decomposition-context/route.ts');
}

function attachmentImportRequest(files: File[]) {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return new Request(
    'http://localhost:3000/api/projects/PROJECT-0001/decomposition-context',
    { method: 'POST', headers: { host: HOST }, body },
  );
}

const routeParams = { params: Promise.resolve({ projectId: 'PROJECT-0001' }) };

function isInternalFailure(error: unknown, code = 'EIO') {
  assert.equal((error as NodeJS.ErrnoException).code, code);
  assert.ok(!(error instanceof PublicApiError));
  return true;
}

void test('a Break It Down batch that fails on its second attachment removes the first and retries cleanly', async () => {
  const { project, attachmentsPath, cleanup } = await makeProject();
  try {
    await seedAttachment(project);
    const before = await snapshot(attachmentsPath);
    assert.deepEqual(Object.keys(before), ['existing.md']);

    resetInjections();
    inject('writeFile', (target) => target.endsWith('second.md'));
    await assert.rejects(
      () => importTaskDecompositionAttachments(project, twoDocuments()),
      (error) => isInternalFailure(error),
    );
    assert.deepEqual(
      await snapshot(attachmentsPath),
      before,
      'the first attachment is removed and the pre-existing one is byte-identical',
    );
    assert.deepEqual(await attachmentNames(project), ['existing.md']);

    resetInjections();
    const retried = await importTaskDecompositionAttachments(
      project,
      twoDocuments(),
    );
    assert.deepEqual(
      retried.attachments.map((attachment) => attachment.fileName),
      ['existing.md', 'first.md', 'second.md'],
    );
    assert.deepEqual(await snapshot(attachmentsPath), {
      ...before,
      'first.md': hex('# First\n\nfirst replacement\n'),
      'second.md': hex('# Second\n\nsecond replacement\n'),
    });
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('a failed batch whose cleanup also fails keeps both causes in Host diagnostics and neither in the response', async (t) => {
  for (const [label, run, fallback, directoryOf] of [
    [
      'Break It Down attachments',
      async () => {
        const { POST } = await attachmentsRoute();
        return (files: File[]) =>
          POST(attachmentImportRequest(files), routeParams);
      },
      'Could not add the context attachments.',
      (fixture: Awaited<ReturnType<typeof makeProject>>) =>
        fixture.attachmentsPath,
    ],
  ] as Array<
    [
      string,
      () => Promise<(files: File[]) => Promise<Response>>,
      string,
      (fixture: Awaited<ReturnType<typeof makeProject>>) => string,
    ]
  >) {
    await t.test(label, async () => {
      const fixture = await makeProject();
      const { project, cleanup } = fixture;
      try {
        if (label.startsWith('Break')) await seedAttachment(project);
        const post = await run();
        const directory = directoryOf(fixture);
        const before = await snapshot(directory);

        resetInjections();
        inject(
          'writeFile',
          (target) => target.endsWith('second.md'),
          fsError(
            'EIO',
            'EIO: second write failed with ghp_abcdefghijklmnop01',
          ),
        );
        inject(
          'unlink',
          (target) => target.endsWith('first.md'),
          fsError(
            'EACCES',
            'EACCES: cleanup denied for ghp_zyxwvutsrqponml9876',
          ),
        );
        const { result: response, captured } = await captureDiagnostics(() =>
          post(twoDocuments()),
        );

        assert.equal(response.status, 500);
        const payload = (await response.json()) as Record<string, unknown>;
        assert.deepEqual(Object.keys(payload).sort(), [
          'correlationId',
          'error',
        ]);
        assert.equal(payload.error, fallback);
        assert.match(String(payload.correlationId), /^[0-9a-f]{12}$/);
        const serialized = JSON.stringify(payload);
        for (const leak of [
          'EIO',
          'EACCES',
          'first.md',
          'second.md',
          project.planningPath,
          'ghp_',
        ])
          assert.ok(
            !serialized.includes(leak),
            `the client never sees ${leak}`,
          );

        const diagnostic = captured.find((line) =>
          line.includes(String(payload.correlationId)),
        );
        assert.ok(diagnostic, 'the failure reaches Host diagnostics');
        assert.match(diagnostic, /EIO: second write failed/, 'primary cause');
        assert.match(diagnostic, /EACCES: cleanup denied/, 'cleanup cause');
        assert.match(diagnostic, /caused by/);
        assert.ok(!diagnostic.includes('ghp_abcdefghijklmnop01'));
        assert.ok(!diagnostic.includes('ghp_zyxwvutsrqponml9876'));
        assert.ok((diagnostic.match(/gh_\[redacted\]/g) ?? []).length >= 2);

        const after = await snapshot(directory);
        assert.equal(
          after['first.md'],
          hex('# First\n\nfirst replacement\n'),
          'the orphan the cleanup could not remove is left in place',
        );
        assert.equal(after['second.md'], undefined);
        for (const name of Object.keys(before))
          assert.equal(after[name], before[name], `${name} is byte-identical`);

        resetInjections();
        const retry = await post(twoDocuments());
        assert.equal(
          retry.status,
          409,
          'a retry meets the orphan as a public conflict rather than an internal failure',
        );
        assert.deepEqual(
          ((await retry.json()) as { conflicts: string[] }).conflicts,
          ['first.md'],
        );
      } finally {
        resetInjections();
        await cleanup();
      }
    });
  }
});

void test('the Break It Down import Route answers with the committed attachments without a second read', async () => {
  const { project, attachmentsPath, cleanup } = await makeProject();
  try {
    await seedAttachment(project);
    const { POST } = await attachmentsRoute();
    resetInjections();
    const refresh = inject(
      'stat',
      (target) => target.endsWith('existing.md'),
      fsError('EIO'),
      { skip: 1 },
    );
    const { result: response, captured } = await captureDiagnostics(() =>
      POST(attachmentImportRequest(twoDocuments()), routeParams),
    );
    assert.equal(
      response.status,
      201,
      `committed attachments must not be reported as a failure: ${captured.join('\n')}`,
    );
    assert.equal(
      refresh.remaining,
      1,
      'publication never depended on a second listing',
    );
    assert.deepEqual(
      readsAfterLastPublication(),
      [],
      'nothing fallible is read after publication',
    );
    const payload = (await response.json()) as {
      initialized: boolean;
      attachments: Array<{ fileName: string; size: number; format: string }>;
    };
    assert.equal(payload.initialized, true);
    assert.deepEqual(
      payload.attachments.map((attachment) => attachment.fileName),
      ['existing.md', 'first.md', 'second.md'],
    );

    resetInjections();
    const fresh = await readTaskDecompositionContext(project);
    assert.deepEqual(
      fresh,
      payload,
      'a fresh reader, including sizes, sees exactly what the response reported',
    );
    assert.deepEqual(Object.keys(await snapshot(attachmentsPath)).sort(), [
      'existing.md',
      'first.md',
      'second.md',
    ]);
  } finally {
    resetInjections();
    await cleanup();
  }
});

void test('public validation and conflict responses stay distinct from internal filesystem failures', async () => {
  const { project, attachmentsPath, cleanup } = await makeProject();
  try {
    await seedAttachment(project);
    const attachments = await attachmentsRoute();
    const attachmentsBefore = await snapshot(attachmentsPath);

    const attachmentConflict = await captureDiagnostics(() =>
      attachments.POST(
        attachmentImportRequest([markdown('existing.md', 'again')]),
        routeParams,
      ),
    );
    assert.equal(attachmentConflict.result.status, 409);
    assert.deepEqual(await attachmentConflict.result.json(), {
      error: 'One or more context attachments already exist.',
      conflicts: ['existing.md'],
    });
    assert.deepEqual(attachmentConflict.captured, []);

    for (const [post, fallback] of [
      [
        () =>
          attachments.POST(
            attachmentImportRequest(twoDocuments()),
            routeParams,
          ),
        'Could not add the context attachments.',
      ],
    ] as Array<[() => Promise<Response>, string]>) {
      resetInjections();
      inject('writeFile', (target) => target.includes('first.md'));
      const internal = await captureDiagnostics(post);
      assert.equal(internal.result.status, 500);
      const payload = (await internal.result.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(payload).sort(), ['correlationId', 'error']);
      assert.equal(payload.error, fallback);
      const serialized = JSON.stringify(payload);
      for (const leak of ['EIO', 'first.md', project.planningPath, 'injected'])
        assert.ok(!serialized.includes(leak), `the client never sees ${leak}`);
      assert.equal(internal.captured.length, 1);
      assert.match(internal.captured[0]!, /EIO: injected failure/);
    }

    assert.deepEqual(await snapshot(attachmentsPath), attachmentsBefore);
  } finally {
    resetInjections();
    await cleanup();
  }
});
