import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scanFilesystemStores,
  type StoreScan,
} from '../lib/filesystem-store-scan.ts';

export const STORE_AUDIT_SOURCE_ROOTS = ['app', 'bin', 'lib', 'scripts'];

export const STORE_AUDIT_EXCLUSIONS = [
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tests',
];

export function storeAuditProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function runStoreAudit(
  projectRoot = storeAuditProjectRoot(),
): StoreScan {
  return scanFilesystemStores({
    projectRoot,
    sourceRoots: STORE_AUDIT_SOURCE_ROOTS,
    exclusions: STORE_AUDIT_EXCLUSIONS,
  });
}

export const MUTATION_KINDS = ['write', 'append', 'rename', 'remove', 'trash'];

export function storeAuditWriterModules(scan: StoreScan) {
  return scan.modules
    .filter((entry) =>
      scan.operations.some(
        (operation) =>
          operation.file === entry.file &&
          MUTATION_KINDS.includes(operation.kind),
      ),
    )
    .map((entry) => entry.file);
}

export function storeAuditMetrics(scan: StoreScan): Array<[string, number]> {
  const byKind = new Map<string, number>();
  for (const operation of scan.operations)
    byKind.set(operation.kind, (byKind.get(operation.kind) ?? 0) + 1);

  return [
    ['analyzed files', scan.analyzedFiles.length],
    ['filesystem operations', scan.operations.length],
    ['modules performing writes', storeAuditWriterModules(scan).length],
    ['unresolved filesystem usages', scan.unresolved.length],
    ['omitted filesystem files', scan.omittedFilesystemFiles.length],
    ...[...byKind.keys()]
      .sort()
      .map(
        (kind) => [`${kind} operations`, byKind.get(kind)!] as [string, number],
      ),
  ];
}

export function formatStoreAudit(scan: StoreScan) {
  const lines: string[] = [];

  lines.push('# Filesystem store inventory');
  lines.push('');
  lines.push(`input fingerprint: ${scan.inputFingerprint}`);
  lines.push(`analyzed source roots: ${scan.sourceRoots.join(', ')}`);
  lines.push(`exclusions: ${scan.exclusions.join(', ')}`);
  lines.push('');

  lines.push('## Metrics');
  for (const [label, value] of storeAuditMetrics(scan))
    lines.push(`| ${label} | ${value} |`);
  lines.push('');

  lines.push('## Modules importing the shared atomic store');
  const shared = scan.modules.filter((entry) => entry.importsAtomicStore);
  if (shared.length)
    for (const entry of shared)
      lines.push(`- ${entry.file} [${entry.atomicStoreCalls.join(', ')}]`);
  else lines.push('- none');
  lines.push('');

  lines.push('## Modules performing mutations');
  for (const file of storeAuditWriterModules(scan)) lines.push(`- ${file}`);
  lines.push('');

  lines.push('## Modules with their own temporary-write and rename');
  const ownTemp = scan.modules.filter(
    (entry) => !entry.importsAtomicStore && entry.renameCount > 0,
  );
  if (ownTemp.length)
    for (const entry of ownTemp)
      lines.push(
        `- ${entry.file} renames=${entry.renameCount} exclusiveCreate=${entry.exclusiveCreateCount} tempNames=${entry.temporaryNameConstructions}`,
      );
  else lines.push('- none');
  lines.push('');

  lines.push('## Modules with in-process serialization');
  const serialized = scan.modules.filter(
    (entry) => entry.serializationKeys.length > 0,
  );
  if (serialized.length)
    for (const entry of serialized)
      lines.push(`- ${entry.file} [${entry.serializationKeys.join(', ')}]`);
  else lines.push('- none');
  lines.push('');

  lines.push(
    '## Static mutation call sites per function (call sites in source, not files written at runtime)',
  );
  const mutations = scan.modules.flatMap((owner) =>
    owner.staticMutationCallSites
      .filter((entry) => entry.total > 1)
      .map(
        (entry) =>
          `- ${owner.file} ${entry.name} create=${entry.create} write=${entry.write} append=${entry.append} rename=${entry.rename} remove=${entry.remove} trash=${entry.trash}`,
      ),
  );
  if (mutations.length) lines.push(...mutations);
  else lines.push('- none');
  lines.push('');

  lines.push('## Git-backed write paths');
  const git = scan.modules.filter((entry) => entry.gitInvocations > 0);
  if (git.length)
    for (const entry of git)
      lines.push(`- ${entry.file} gitInvocations=${entry.gitInvocations}`);
  else lines.push('- none');
  lines.push('');

  lines.push('## Unresolved filesystem usages requiring manual review');
  if (scan.unresolved.length)
    for (const item of scan.unresolved)
      lines.push(
        `- ${item.file}:${item.line}:${item.column} ${item.expression} [${item.reason}]`,
      );
  else lines.push('- none');
  lines.push('');

  lines.push(
    '## Production files with filesystem imports omitted from analysis',
  );
  if (scan.omittedFilesystemFiles.length)
    for (const file of scan.omittedFilesystemFiles) lines.push(`- ${file}`);
  else lines.push('- none');
  lines.push('');

  return lines.join('\n');
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const scan = runStoreAudit();
    process.stdout.write(`${formatStoreAudit(scan)}\n`);
    if (scan.omittedFilesystemFiles.length) {
      process.stderr.write(
        'Inventory incomplete: production files performing filesystem work were not analyzed.\n',
      );
      process.exit(3);
    }
    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `Inventory failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
