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
} from '../scripts/audit-filesystem-stores.ts';

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

void test('a function writing more than one file is reported as multi-file', () => {
  const scan = scanFixtures();
  const signals = moduleFor(scan, 'multifile');
  assert.deepEqual(signals.multiWriteFunctions, [
    { name: 'publishRecord', writes: 2 },
  ]);
  assert.deepEqual(moduleFor(scan, 'direct').multiWriteFunctions, []);
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
  const writers = new Set(
    first.operations
      .filter((operation) =>
        ['write', 'append', 'rename', 'remove', 'trash'].includes(
          operation.kind,
        ),
      )
      .map((operation) => operation.file),
  );
  for (const [label, value] of [
    ['analyzed files', first.analyzedFiles.length],
    ['filesystem operations', first.operations.length],
    ['modules performing writes', writers.size],
  ] as Array<[string, number]>)
    assert.match(
      report,
      new RegExp(`\\|\\s*${label}\\s*\\|\\s*${value}\\s*\\|`),
      `the report must state ${label} = ${value}`,
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
  assert.ok(breakItDown.multiWriteFunctions.length > 0);
  assert.ok(
    scan.modules.filter((module) => module.importsAtomicStore).length === 1,
    'only the project registry uses the shared atomic helper',
  );
});
