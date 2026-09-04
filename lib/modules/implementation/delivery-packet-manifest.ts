import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import rawSpec from '../../templates/delivery-packet-spec.json' with { type: 'json' };

export type PacketEntryKind = 'materialized' | 'referenced' | 'agent-filled';
export type PacketReferenceState =
  | 'present'
  | 'missing'
  | 'unavailable'
  | 'not-applicable';

export type PacketSpecEntry = {
  id: string;
  kind: PacketEntryKind;
  required: boolean;
  title: string;
  description: string;
  file?: string;
  multiple?: boolean;
  source?: string;
  pathBase?: 'project';
  owner?: string;
};

export type PacketSpec = {
  version: 1;
  manifestFile: string;
  entries: PacketSpecEntry[];
};

export type PacketReference = {
  ref: string;
  description: string;
  state: PacketReferenceState;
  hash?: string;
};

export type PacketManifestInput = {
  cardId: string;
  actionId: string;
  contextRevision: number;
  checklistVersion: string;
  materialized: Record<string, boolean>;
  references: Record<string, PacketReference[]>;
};

export type PacketVerification = {
  missingFiles: string[];
  unexpectedFiles: string[];
  unfilledSections: string[];
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
    !Array.isArray(candidate.entries) ||
    !candidate.entries.length
  )
    throw new Error('Invalid delivery packet spec.');
  const ids = new Set<string>();
  const files = new Set<string>();
  for (const entry of candidate.entries) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      ids.has(entry.id) ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      typeof entry.description !== 'string' ||
      !entry.description.trim() ||
      typeof entry.required !== 'boolean' ||
      !['materialized', 'referenced', 'agent-filled'].includes(entry.kind)
    )
      throw new Error(`Invalid delivery packet spec entry: ${entry?.id}`);
    ids.add(entry.id);
    if (entry.kind === 'materialized') {
      if (typeof entry.file !== 'string' || !entry.file.trim())
        throw new Error(`Materialized entry needs a file: ${entry.id}`);
      if (files.has(entry.file))
        throw new Error(`Duplicate packet file: ${entry.file}`);
      files.add(entry.file);
    } else if (entry.file)
      throw new Error(`Only a materialized entry has a file: ${entry.id}`);
  }
  if (files.has(candidate.manifestFile))
    throw new Error('The manifest cannot be a spec entry.');
}

assertSpec(rawSpec);
export const PACKET_SPEC: PacketSpec = rawSpec;

export const PACKET_FILES = Object.freeze(
  PACKET_SPEC.entries
    .filter((entry) => entry.kind === 'materialized')
    .map((entry) => entry.file!),
);

export function placeholderFor(id: string) {
  return `<!-- AGENT-MUST-UPDATE:${id} -->`;
}

function readingOrder(spec: PacketSpec, input: PacketManifestInput) {
  const steps = [
    ...spec.entries
      .filter((entry) => entry.kind === 'agent-filled')
      .map((entry) => `\`${spec.manifestFile}\` section "${entry.title}"`),
    ...spec.entries
      .filter(
        (entry) =>
          entry.kind === 'materialized' &&
          input.materialized[entry.id] === true,
      )
      .map((entry) => `\`${entry.file}\``),
    ...spec.entries
      .filter(
        (entry) =>
          entry.kind === 'referenced' &&
          (input.references[entry.id] ?? []).some(
            (item) => item.state === 'present',
          ),
      )
      .map((entry) => `${entry.title} references under "References"`),
  ];
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}

function materializedSection(spec: PacketSpec, input: PacketManifestInput) {
  const rows = spec.entries
    .filter((entry) => entry.kind === 'materialized')
    .map((entry) => {
      const present = input.materialized[entry.id] === true;
      if (!present && entry.required)
        throw new Error(`Required packet file was not produced: ${entry.id}`);
      return `| \`${entry.file}\` | ${present ? 'present' : 'not-applicable'} | ${entry.description} |`;
    });
  return `| File | State | Purpose |\n| --- | --- | --- |\n${rows.join('\n')}`;
}

function referenceSection(spec: PacketSpec, input: PacketManifestInput) {
  return spec.entries
    .filter((entry) => entry.kind === 'referenced')
    .map((entry) => {
      const items = input.references[entry.id] ?? [];
      if (!entry.multiple && items.length > 1)
        throw new Error(`Entry accepts one reference: ${entry.id}`);
      const usable = items.filter((item) => item.state === 'present');
      if (entry.required && !usable.length)
        throw new Error(`Required reference is unavailable: ${entry.id}`);
      const body = items.length
        ? items
            .map(
              (item) =>
                `- \`${item.ref}\` — ${item.state}${item.hash ? ` — ${item.hash}` : ''} — ${item.description}`,
            )
            .join('\n')
        : '- none';
      return `### ${entry.title}\n\n${entry.description}\n\n${body}`;
    })
    .join('\n\n');
}

function agentSection(spec: PacketSpec) {
  return spec.entries
    .filter((entry) => entry.kind === 'agent-filled')
    .map(
      (entry) =>
        `### ${entry.title}\n\nOwner: ${entry.owner ?? 'Coordinator'}\n\n${entry.description}\n\n${placeholderFor(entry.id)}`,
    )
    .join('\n\n');
}

export function buildPacketManifest(
  input: PacketManifestInput,
  spec: PacketSpec = PACKET_SPEC,
) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const values: Record<string, string> = {
    cardId: input.cardId,
    actionId: input.actionId,
    contextRevision: String(input.contextRevision),
    checklistVersion: input.checklistVersion,
    readingOrder: readingOrder(spec, input),
    materialized: materializedSection(spec, input),
    references: referenceSection(spec, input),
    agentSections: agentSection(spec),
  };
  const rendered = template.replace(
    /{{(\w+)}}/g,
    (_, slot: string) => values[slot] ?? '',
  );
  const unresolved = rendered.match(/{{\w+}}/g);
  if (unresolved)
    throw new Error(`Unresolved manifest slots: ${unresolved.join(', ')}`);
  return rendered;
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
  const expected = new Set([spec.manifestFile, ...PACKET_FILES]);
  const missingFiles = spec.entries
    .filter(
      (entry) =>
        entry.kind === 'materialized' &&
        entry.required &&
        !present.has(entry.file!),
    )
    .map((entry) => entry.file!);
  if (!present.has(spec.manifestFile)) missingFiles.unshift(spec.manifestFile);
  const unexpectedFiles = [...present]
    .filter((name) => !expected.has(name))
    .sort();
  const manifest = present.has(spec.manifestFile)
    ? await readFile(path.join(packetDir, spec.manifestFile), 'utf8')
    : '';
  const unfilledSections = spec.entries
    .filter(
      (entry) =>
        entry.kind === 'agent-filled' &&
        manifest.includes(placeholderFor(entry.id)),
    )
    .map((entry) => entry.id);
  return { missingFiles, unexpectedFiles, unfilledSections };
}
