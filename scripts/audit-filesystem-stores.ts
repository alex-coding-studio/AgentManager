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

export function formatStoreAudit(scan: StoreScan) {
  const lines: string[] = [];
  const byKind = new Map<string, number>();
  for (const operation of scan.operations)
    byKind.set(operation.kind, (byKind.get(operation.kind) ?? 0) + 1);

  const writers = scan.modules.filter((entry) =>
    scan.operations.some(
      (operation) =>
        operation.file === entry.file &&
        ['write', 'append', 'rename', 'remove', 'trash'].includes(
          operation.kind,
        ),
    ),
  );

  lines.push('# Filesystem store inventory');
  lines.push('');
  lines.push(`input fingerprint: ${scan.inputFingerprint}`);
  lines.push(`analyzed source roots: ${scan.sourceRoots.join(', ')}`);
  lines.push(`exclusions: ${scan.exclusions.join(', ')}`);
  lines.push(`analyzed files: ${scan.analyzedFiles.length}`);
  lines.push(`filesystem operations: ${scan.operations.length}`);
  lines.push(`modules performing writes: ${writers.length}`);
  lines.push(`unresolved filesystem usages: ${scan.unresolved.length}`);
  lines.push(
    `production files with filesystem imports omitted from analysis: ${scan.omittedFilesystemFiles.length}`,
  );
  lines.push('');

  lines.push('## Operations by kind');
  for (const kind of [...byKind.keys()].sort())
    lines.push(`- ${kind}: ${byKind.get(kind)}`);
  lines.push('');

  lines.push('## Modules importing the shared atomic store');
  const shared = scan.modules.filter((entry) => entry.importsAtomicStore);
  if (shared.length)
    for (const entry of shared)
      lines.push(`- ${entry.file} [${entry.atomicStoreCalls.join(', ')}]`);
  else lines.push('- none');
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

  lines.push('## Functions writing more than one file');
  const multi = scan.modules.flatMap((owner) =>
    owner.multiWriteFunctions.map(
      (fn) => `- ${owner.file} ${fn.name} writes=${fn.writes}`,
    ),
  );
  if (multi.length) lines.push(...multi);
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
