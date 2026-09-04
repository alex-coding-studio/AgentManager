import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import rawSpec from '../../templates/delivery-packet-spec.json' with { type: 'json' };

export type PacketProducer = 'host' | 'coordinator';

export type PacketSpecEntry = {
  id: string;
  file: string;
  producer: PacketProducer;
};

export type PacketSpec = {
  version: 1;
  manifestFile: string;
  origin: PacketSpecEntry[];
  references: PacketSpecEntry[];
};

export type PacketManifestInput = {
  cardId: string;
  actionId: string;
  contextRevision: number;
};

export type PacketVerification = {
  missing: Array<{ id: string; file: string; producer: PacketProducer }>;
  unexpectedFiles: string[];
};

const TEMPLATE_PATH = path.join(
  import.meta.dirname,
  '../../templates/delivery-packet-manifest.md',
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
      typeof entry.file !== 'string' ||
      !/^[\w.-]+\.md$/.test(entry.file) ||
      !['host', 'coordinator'].includes(entry.producer)
    )
      throw new Error(`Invalid delivery packet spec entry: ${entry?.id}`);
    if (ids.has(entry.id))
      throw new Error(`Duplicate packet entry: ${entry.id}`);
    if (files.has(entry.file))
      throw new Error(`Duplicate packet file: ${entry.file}`);
    ids.add(entry.id);
    files.add(entry.file);
  }
}

assertSpec(rawSpec);
export const PACKET_SPEC: PacketSpec = rawSpec;

export const PACKET_ENTRIES = Object.freeze([
  ...PACKET_SPEC.origin,
  ...PACKET_SPEC.references,
]);

export const PACKET_FILES = Object.freeze(
  PACKET_ENTRIES.map((entry) => entry.file),
);

export function buildPacketManifest(
  input: PacketManifestInput,
  spec: PacketSpec = PACKET_SPEC,
) {
  const list = (entries: PacketSpecEntry[]) =>
    entries.map((entry) => `- \`${entry.file}\``).join('\n');
  const values: Record<string, string> = {
    cardId: input.cardId,
    actionId: input.actionId,
    contextRevision: String(input.contextRevision),
    origin: list(spec.origin),
    references: list(spec.references),
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
  const present = new Set(
    (await readdir(packetDir, { withFileTypes: true }))
      .filter((item) => item.isFile())
      .map((item) => item.name),
  );
  const entries = [...spec.origin, ...spec.references];
  const missing = entries
    .filter((entry) => !present.has(entry.file))
    .map((entry) => ({ ...entry }));
  if (!present.has(spec.manifestFile))
    missing.unshift({
      id: 'manifest',
      file: spec.manifestFile,
      producer: 'host',
    });
  const expected = new Set([
    spec.manifestFile,
    ...entries.map((entry) => entry.file),
  ]);
  return {
    missing,
    unexpectedFiles: [...present].filter((name) => !expected.has(name)).sort(),
  };
}
