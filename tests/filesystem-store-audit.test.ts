import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanFilesystemStores,
  type StoreScan,
} from '../lib/filesystem-store-scan.ts';
import {
  STORE_AUDIT_EXCLUSIONS,
  STORE_AUDIT_SOURCE_ROOTS,
  formatStoreAudit,
  runStoreAudit,
  storeAuditMetrics,
  storeAuditWriterModules,
} from '../scripts/audit-filesystem-stores.ts';

const CANONICAL_STORES = [
  'lib/app-settings.ts',
  'lib/card-host-operations.ts',
  'lib/graph-identity-store.ts',
  'lib/host-job-broker.ts',
  'lib/just-do-it-planning-service.ts',
  'lib/just-do-it-worklog.ts',
  'lib/just-do-it-worktree.ts',
  'lib/product-context.ts',
  'lib/project-registry.ts',
  'lib/system-validation-runner.ts',
  'lib/task-decomposition-context-workspace.ts',
  'lib/task-decomposition-context.ts',
  'lib/task-decomposition-runs.ts',
  'lib/task-graph.ts',
  'lib/whats-next-context.ts',
  'lib/whats-next-runs.ts',
];

const SHARED_HELPERS = ['lib/atomic-json-store.ts'];

const NON_STORE_SCRIPTS = [
  'scripts/migrate-uuid-aliases.mjs',
  'scripts/preview-just-do-it-harness.ts',
  'scripts/smoke-app-server-code.ts',
  'scripts/smoke-card-worktree.ts',
  'scripts/smoke-codex-simulator.ts',
  'scripts/smoke-coordination.ts',
];

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const FIXTURES = 'tests/fixtures/fs-audit';

function scanFixtures(): StoreScan {
  return scanFilesystemStores({
    projectRoot: PROJECT_ROOT,
    sourceRoots: [FIXTURES],
  });
}

function operationsIn(scan: StoreScan, fixture: string) {
  return scan.operations.filter((operation) =>
    operation.file.endsWith(`${fixture}.ts`),
  );
}

function moduleFor(scan: StoreScan, fixture: string) {
  return scan.modules.find((module) => module.file.endsWith(`${fixture}.ts`))!;
}

void test('direct write and append calls are detected with their kind', () => {
  const scan = scanFixtures();
  const operations = operationsIn(scan, 'direct');
  assert.equal(operations.filter((item) => item.kind === 'write').length, 1);
  assert.equal(operations.filter((item) => item.kind === 'append').length, 1);
  const write = operations.find((item) => item.kind === 'write')!;
  assert.equal(write.enclosingFunction, 'overwrite');
  assert.equal(write.exclusiveCreate, false);
  assert.ok(write.line > 0 && write.column > 0);
});

void test('a temporary write, exclusive create, rename and finally cleanup are recognized together', () => {
  const scan = scanFixtures();
  const signals = moduleFor(scan, 'atomic');
  assert.equal(signals.renameCount, 1);
  assert.equal(signals.exclusiveCreateCount, 1);
  assert.equal(signals.temporaryNameConstructions, 1);
  assert.equal(signals.cleanupInFinally, 1);
  const cleanup = operationsIn(scan, 'atomic').find(
    (item) => item.kind === 'remove',
  );
  assert.equal(cleanup?.insideFinally, true);
});

void test('a plain overwrite is not credited with atomic publication', () => {
  const scan = scanFixtures();
  const signals = moduleFor(scan, 'direct');
  assert.equal(signals.renameCount, 0);
  assert.equal(signals.exclusiveCreateCount, 0);
  assert.equal(signals.temporaryNameConstructions, 0);
});

void test('a process-local promise chain is reported as serialization', () => {
  const scan = scanFixtures();
  const signals = moduleFor(scan, 'serialized');
  assert.ok(signals.serializationKeys.length > 0);
  assert.equal(moduleFor(scan, 'direct').serializationKeys.length, 0);
});

void test('mutation call sites are counted per kind, not summed as files written', () => {
  const scan = scanFixtures();
  const signals = moduleFor(scan, 'multifile');
  assert.deepEqual(signals.staticMutationCallSites, [
    {
      name: 'publishRecord',
      create: 1,
      write: 1,
      append: 1,
      rename: 1,
      remove: 1,
      trash: 1,
      total: 6,
    },
    {
      name: 'writeOnce',
      create: 0,
      write: 1,
      append: 0,
      rename: 0,
      remove: 0,
      trash: 0,
      total: 1,
    },
  ]);
});

void test('a rename is a publication step, never a written file, and a wrapper is not inferred from it', () => {
  const scan = scanFixtures();
  const atomic = moduleFor(scan, 'atomic');
  const publish = atomic.staticMutationCallSites.find(
    (entry) => entry.rename === 1,
  )!;
  assert.equal(publish.rename, 1);
  assert.equal(publish.write + publish.append, 0);
  assert.equal(publish.create, 1);
  assert.ok(!atomic.localWriteWrappers.includes('(module scope)'));
});

void test('aliased and namespaced filesystem imports are not missed', () => {
  const scan = scanFixtures();
  const aliased = operationsIn(scan, 'aliased');
  assert.equal(aliased.filter((item) => item.kind === 'write').length, 1);
  assert.equal(aliased.filter((item) => item.kind === 'read').length, 1);
  assert.equal(
    aliased.find((item) => item.kind === 'write')?.callee,
    'persist',
  );

  const namespaced = operationsIn(scan, 'namespaced');
  assert.equal(namespaced.filter((item) => item.kind === 'write').length, 1);
  assert.equal(
    namespaced.find((item) => item.kind === 'write')?.callee,
    'fsp.writeFile',
  );
});

void test('a dynamically addressed filesystem method is reported for manual review', () => {
  const scan = scanFixtures();
  const flagged = scan.unresolved.find((item) =>
    item.file.endsWith('dynamic.ts'),
  );
  assert.equal(flagged?.reason, 'dynamic-member');
  assert.ok(flagged!.line > 0);
  assert.deepEqual(operationsIn(scan, 'dynamic'), []);
});

void test('a Git-backed write path and a trash call are classified separately', () => {
  const scan = scanFixtures();
  assert.equal(moduleFor(scan, 'gitbacked').gitInvocations, 1);
  assert.deepEqual(operationsIn(scan, 'gitbacked'), []);

  const discard = operationsIn(scan, 'trashing').find(
    (item) => item.kind === 'trash',
  );
  assert.equal(discard?.origin, 'trash-package');
});

void test('enumeration order does not change the output', () => {
  const first = scanFixtures();
  const second = scanFilesystemStores({
    projectRoot: PROJECT_ROOT,
    sourceRoots: [FIXTURES],
  });
  assert.deepEqual(first.operations, second.operations);
  assert.deepEqual(first.modules, second.modules);
  assert.equal(first.inputFingerprint, second.inputFingerprint);
});

void test('malformed source fails the scan instead of disappearing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'am-fs-broken-'));
  await writeFile(
    path.join(directory, 'broken.ts'),
    'import { writeFile from "node:fs/promises"\nconst = ;\n',
  );
  await assert.rejects(
    async () =>
      scanFilesystemStores({ projectRoot: directory, sourceRoots: ['.'] }),
    /Failed to parse/,
  );
  await rm(directory, { recursive: true, force: true });
});

void test('a production file doing filesystem work cannot be silently omitted', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'am-fs-omit-'));
  await writeFile(
    path.join(directory, 'lib', 'kept.ts').replace('/lib/', '/'),
    'export const kept = 1;\n',
  );
  const libDirectory = path.join(directory, 'lib');
  await mkdtemp(path.join(os.tmpdir(), 'unused-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(libDirectory, { recursive: true });
  await writeFile(
    path.join(libDirectory, 'writer.ts'),
    "import { writeFile } from 'node:fs/promises';\nexport const write = writeFile;\n",
  );
  const scan = scanFilesystemStores({
    projectRoot: directory,
    sourceRoots: ['.'],
    exclusions: ['lib'],
  });
  assert.ok(
    scan.omittedFilesystemFiles.includes(path.join('lib', 'writer.ts')),
    'an excluded production file with filesystem imports must be reported',
  );
  await rm(directory, { recursive: true, force: true });
});

void test('the fingerprint follows analyzed sources and ignores the report', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'am-fs-print-'));
  await writeFile(path.join(directory, 'a.ts'), 'export const a = 1;\n');
  const options = { projectRoot: directory, sourceRoots: ['.'] };
  const before = scanFilesystemStores(options).inputFingerprint;

  await writeFile(path.join(directory, 'notes.md'), '# not analyzed\n');
  assert.equal(scanFilesystemStores(options).inputFingerprint, before);

  await writeFile(path.join(directory, 'a.ts'), 'export const a = 2;\n');
  assert.notEqual(scanFilesystemStores(options).inputFingerprint, before);
  await rm(directory, { recursive: true, force: true });
});

void test('the real inventory is deterministic, complete and matches its report', async () => {
  const first = runStoreAudit(PROJECT_ROOT);
  const second = runStoreAudit(PROJECT_ROOT);
  assert.deepEqual(first.operations, second.operations);
  assert.equal(first.inputFingerprint, second.inputFingerprint);
  assert.match(first.inputFingerprint, /^[0-9a-f]{64}$/);

  assert.deepEqual(first.sourceRoots, [...STORE_AUDIT_SOURCE_ROOTS].sort());
  assert.deepEqual(first.exclusions, [...STORE_AUDIT_EXCLUSIONS].sort());
  assert.deepEqual(
    first.omittedFilesystemFiles,
    [],
    'no production filesystem work may be omitted',
  );
  assert.deepEqual(first.unresolved, []);
  assert.ok(first.operations.length > 0);

  const report = await readFile(
    new URL('../docs/FILESYSTEM_STORE_AUDIT.md', import.meta.url),
    'utf8',
  );
  assert.ok(
    report.includes(first.inputFingerprint),
    'the report must record the fingerprint of the source set it describes',
  );
  const metrics = storeAuditMetrics(first);
  assert.ok(
    metrics.length >= 10,
    'every generated metric, including each operation kind, must be bound',
  );
  for (const [label, value] of metrics)
    assert.match(
      report,
      new RegExp(`\\|\\s*${label}\\s*\\|\\s*${value}\\s*\\|`),
      `the report must state ${label} = ${value}`,
    );
  assert.equal(
    metrics.reduce(
      (sum, [label, value]) =>
        label.endsWith(' operations') && label !== 'filesystem operations'
          ? sum + value
          : sum,
      0,
    ),
    first.operations.length,
    'the per-kind counts must account for every operation',
  );

  assert.ok(formatStoreAudit(first).includes(first.inputFingerprint));
});

void test('the inventory finds the asymmetry the report is built on', () => {
  const scan = runStoreAudit(PROJECT_ROOT);
  const whatsNext = scan.modules.find(
    (module) => module.file === 'lib/whats-next-runs.ts',
  )!;
  const breakItDown = scan.modules.find(
    (module) => module.file === 'lib/task-decomposition-runs.ts',
  )!;

  assert.ok(
    whatsNext.serializationKeys.length > 0,
    'What’s Next Runs serialize their mutations',
  );
  assert.equal(
    breakItDown.serializationKeys.length,
    0,
    'Break It Down Runs have no write serializer',
  );
  assert.ok(
    breakItDown.staticMutationCallSites.some((entry) => entry.total > 1),
  );
  assert.ok(
    scan.modules.filter((module) => module.importsAtomicStore).length === 1,
    'only the project registry uses the shared atomic helper',
  );
});

void test('every discovered writer module is classified with no silent remainder', () => {
  const scan = runStoreAudit(PROJECT_ROOT);
  const discovered = storeAuditWriterModules(scan);
  const classified = [
    ...CANONICAL_STORES,
    ...SHARED_HELPERS,
    ...NON_STORE_SCRIPTS,
  ].sort();
  assert.deepEqual(
    [...discovered].sort(),
    classified,
    'a module that mutates the filesystem must appear in exactly one class',
  );
  assert.equal(new Set(classified).size, classified.length);
});

void test('the Context workspace is the write unit with no atomic publication', () => {
  const scan = runStoreAudit(PROJECT_ROOT);
  const workspace = scan.modules.find(
    (module) => module.file === 'lib/task-decomposition-context-workspace.ts',
  )!;
  assert.equal(workspace.renameCount, 0);
  assert.equal(workspace.temporaryNameConstructions, 0);
  assert.ok(workspace.exclusiveCreateCount > 0);
  assert.equal(workspace.cleanupInFinally, 0);
});

void test('the Card worklog publishes a complete revision directory by rename', () => {
  const scan = runStoreAudit(PROJECT_ROOT);
  const worklog = scan.modules.find(
    (module) => module.file === 'lib/just-do-it-worklog.ts',
  )!;
  const append = worklog.staticMutationCallSites.find(
    (entry) => entry.name === 'appendCardWorkRecord',
  )!;
  assert.equal(append.rename, 1);
  assert.equal(append.write + append.append, 0);
  assert.ok(append.create > 1, 'the pending revision is created exclusively');
});

void test('the worklog concurrency evidence the report cites still exists', async () => {
  const harness = await readFile(
    new URL('../tests/just-do-it-harness.test.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    harness,
    /worklog compare-and-swap prevents concurrent or stale overwrites/,
  );
  assert.match(
    harness,
    /interrupted uncommitted writes are ignored; committed corruption fails closed/,
  );
});

void test('a double-quoted filesystem import in an excluded file cannot disappear', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'am-fs-quote-'));
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.join(directory, 'lib'), { recursive: true });
  await writeFile(
    path.join(directory, 'lib', 'double.ts'),
    'import { writeFile } from "node:fs/promises";\nexport const w = writeFile;\n',
  );
  await writeFile(
    path.join(directory, 'lib', 'required.ts'),
    'const fs = require("node:fs");\nexport const r = fs;\n',
  );
  await writeFile(
    path.join(directory, 'lib', 'reexport.ts'),
    'export { writeFile } from "node:fs/promises";\n',
  );
  await writeFile(
    path.join(directory, 'lib', 'trashing.ts'),
    'import trash from "trash";\nexport const t = trash;\n',
  );
  await writeFile(
    path.join(directory, 'lib', 'plain.ts'),
    'export const p = 1;\n',
  );
  const scan = scanFilesystemStores({
    projectRoot: directory,
    sourceRoots: ['.'],
    exclusions: ['lib'],
  });
  assert.deepEqual(scan.omittedFilesystemFiles, [
    path.join('lib', 'double.ts'),
    path.join('lib', 'reexport.ts'),
    path.join('lib', 'required.ts'),
    path.join('lib', 'trashing.ts'),
  ]);
  await rm(directory, { recursive: true, force: true });
});
