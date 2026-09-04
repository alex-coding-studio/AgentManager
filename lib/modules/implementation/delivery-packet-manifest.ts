import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import rawSpec from '../../templates/delivery-packet-spec.json' with { type: 'json' };

export type PacketProducer = 'host' | 'coordinator';

export type PacketFileSpecEntry = {
  id: string;
  file: string;
  producer: PacketProducer;
};

export type PacketDirectorySpecEntry = {
  id: string;
  directory: string;
  producer: PacketProducer;
};

export type PacketSpecEntry = PacketFileSpecEntry | PacketDirectorySpecEntry;

export type PacketSpec = {
  version: 1;
  manifestFile: string;
  origin: PacketSpecEntry[];
  references: PacketSpecEntry[];
};

export type PacketManifestInput = {
  activeResponsibilityFiles?: string[];
  cardId: string;
  actionId: string;
  contextRevision: number;
};

export type PacketVerification = {
  missing: Array<{ id: string; file: string; producer: PacketProducer }>;
  unexpectedFiles: string[];
};

const isFileEntry = (entry: PacketSpecEntry): entry is PacketFileSpecEntry =>
  'file' in entry;

export type PacketAmendment = {
  sequence: number;
  targetId: string;
  targetFile: string;
  file: string;
};

const TEMPLATE_PATH = path.join(
  process.cwd(),
  'lib/templates/delivery-packet-manifest.md',
);

function assertSpec(value: unknown): asserts value is PacketSpec {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Delivery packet spec must be an object.');
  const candidate = value as Partial<PacketSpec>;
  if (
    candidate.version !== 1 ||
    typeof candidate.manifestFile !== 'string' ||
    !candidate.manifestFile.trim() ||
    !Array.isArray(candidate.origin) ||
    !candidate.origin.length ||
    !Array.isArray(candidate.references)
  )
    throw new Error('Invalid delivery packet spec.');
  const ids = new Set<string>();
  const files = new Set([candidate.manifestFile]);
  for (const entry of [...candidate.origin, ...candidate.references]) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      !['host', 'coordinator'].includes(entry.producer)
    )
      throw new Error(`Invalid delivery packet spec entry: ${entry?.id}`);
    const packetPath = isFileEntry(entry) ? entry.file : entry.directory;
    if (
      typeof packetPath !== 'string' ||
      !(isFileEntry(entry)
        ? /^[\w.-]+\.md$/.test(packetPath)
        : /^[\w.-]+$/.test(packetPath))
    )
      throw new Error(`Invalid delivery packet spec entry: ${entry.id}`);
    if (ids.has(entry.id))
      throw new Error(`Duplicate packet entry: ${entry.id}`);
    if (files.has(packetPath))
      throw new Error(`Duplicate packet path: ${packetPath}`);
    ids.add(entry.id);
    files.add(packetPath);
  }
}

assertSpec(rawSpec);
export const PACKET_SPEC: PacketSpec = rawSpec;

export const PACKET_ENTRIES = Object.freeze(
  [...PACKET_SPEC.origin, ...PACKET_SPEC.references].filter(isFileEntry),
);

export const PACKET_FILES = Object.freeze(
  PACKET_ENTRIES.map((entry) => entry.file),
);

export const PACKET_DIRECTORIES = Object.freeze(
  [...PACKET_SPEC.origin, ...PACKET_SPEC.references]
    .filter((entry): entry is PacketDirectorySpecEntry => !isFileEntry(entry))
    .map((entry) => entry.directory),
);

export function packetAmendments(
  files: Iterable<string>,
  spec: PacketSpec = PACKET_SPEC,
) {
  const entries = [...spec.origin, ...spec.references].filter(isFileEntry);
  const byFile = new Map(entries.map((entry) => [entry.file, entry]));
  const amendments: PacketAmendment[] = [];
  for (const file of files) {
    const match = /^Amendment-(\d+)-([\w.-]+)\.md$/.exec(file);
    if (!match) continue;
    const sequence = Number(match[1]);
    const targetFile = `${match[2]}.md`;
    const target = byFile.get(targetFile);
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !target) continue;
    amendments.push({
      sequence,
      targetId: target.id,
      targetFile,
      file,
    });
  }
  const ordered = amendments.sort((left, right) =>
    left.targetId === right.targetId
      ? left.sequence - right.sequence
      : left.targetId.localeCompare(right.targetId),
  );
  for (const entry of entries) {
    const targetAmendments = ordered.filter(
      (amendment) => amendment.targetId === entry.id,
    );
    for (const [index, amendment] of targetAmendments.entries()) {
      if (amendment.sequence !== index + 1)
        throw new Error('Delivery packet amendment sequence is invalid.');
    }
  }
  return ordered;
}

export function orderedPacketFiles(
  entries: PacketFileSpecEntry[],
  amendments: PacketAmendment[],
) {
  return entries.flatMap((entry) => [
    entry.file,
    ...amendments
      .filter((amendment) => amendment.targetId === entry.id)
      .map((amendment) => amendment.file),
  ]);
}

export function buildPacketManifest(
  input: PacketManifestInput,
  spec: PacketSpec = PACKET_SPEC,
  presentFiles: Iterable<string> = [],
) {
  const amendments = packetAmendments(presentFiles, spec);
  const list = (files: string[]) =>
    files.map((file) => `- \`${file}\``).join('\n');
  const orderedPaths = (entries: PacketSpecEntry[]) =>
    entries.flatMap((entry) =>
      isFileEntry(entry)
        ? orderedPacketFiles([entry], amendments)
        : entry.id === 'responsibilities' && input.activeResponsibilityFiles
          ? input.activeResponsibilityFiles
          : [`${entry.directory}/`],
    );
  const values: Record<string, string> = {
    cardId: input.cardId,
    actionId: input.actionId,
    contextRevision: String(input.contextRevision),
    origin: list(orderedPaths(spec.origin)),
    references: list(orderedPaths(spec.references)),
  };
  return renderTemplate(readFileSync(TEMPLATE_PATH, 'utf8'), values);
}

export function renderTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(/{{(\w+)}}/g, (_, slot: string) => {
    if (!Object.hasOwn(values, slot))
      throw new Error(`Unknown manifest slot: ${slot}`);
    return values[slot]!;
  });
}

export async function verifyPacket(
  packetDir: string,
  spec: PacketSpec = PACKET_SPEC,
): Promise<PacketVerification> {
  const present = new Set<string>();
  for (const item of await readdir(packetDir, { withFileTypes: true })) {
    if (item.isFile()) {
      present.add(item.name);
      continue;
    }
    if (!item.isDirectory() || !PACKET_DIRECTORIES.includes(item.name)) {
      present.add(`${item.name}${item.isDirectory() ? '/' : ''}`);
      continue;
    }
    for (const child of await readdir(path.join(packetDir, item.name), {
      withFileTypes: true,
    }))
      present.add(
        `${item.name}/${child.name}${child.isDirectory() ? '/' : ''}`,
      );
  }
  const entries = [...spec.origin, ...spec.references];
  const amendments = packetAmendments(present, spec);
  const missing = entries
    .filter((entry) =>
      isFileEntry(entry)
        ? !present.has(entry.file)
        : ![...present].some((file) =>
            file.startsWith(`${entry.directory}/Responsibility-`),
          ),
    )
    .map((entry) => ({
      id: entry.id,
      file: isFileEntry(entry) ? entry.file : `${entry.directory}/`,
      producer: entry.producer,
    }));
  if (!present.has(spec.manifestFile))
    missing.unshift({
      id: 'manifest',
      file: spec.manifestFile,
      producer: 'host',
    });
  const expected = new Set([
    spec.manifestFile,
    ...entries.filter(isFileEntry).map((entry) => entry.file),
    ...amendments.map((amendment) => amendment.file),
    ...[...present].filter((file) =>
      /^Responsibilities\/Responsibility-[1-9]\d*\.json$/.test(file),
    ),
  ]);
  return {
    missing,
    unexpectedFiles: [...present].filter((name) => !expected.has(name)).sort(),
  };
}
