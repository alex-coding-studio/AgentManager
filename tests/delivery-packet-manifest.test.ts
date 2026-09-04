import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildPacketManifest,
  verifyPacket,
  PACKET_SPEC,
  PACKET_FILES,
  packetAmendments,
  renderTemplate,
} from '../lib/modules/implementation/delivery-packet-manifest.ts';

const input = {
  cardId: 'card-1',
  actionId: 'action-1',
  contextRevision: 12,
};

async function packetDirectory(files: readonly string[]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'packet-'));
  for (const file of files) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), 'x', 'utf8');
  }
  return dir;
}

const responsibilityFile = 'Responsibilities/Responsibility-1.json';
const completeFiles = [...PACKET_FILES, responsibilityFile];

const block = (manifest: string, heading: string) => {
  const start = manifest.indexOf(`## ${heading}`);
  const next = manifest.indexOf('\n## ', start + 1);
  return manifest.slice(start, next === -1 ? undefined : next);
};

void test('the manifest lists Origin files in spec order', () => {
  const origin = block(buildPacketManifest(input), 'Origin');
  assert.deepEqual(
    [...origin.matchAll(/^- `(.+)`$/gm)].map((match) => match[1]),
    PACKET_SPEC.origin.map((entry) =>
      'file' in entry ? entry.file : `${entry.directory}/`,
    ),
  );
});

void test('references stay out of the Origin block', () => {
  const manifest = buildPacketManifest(input);
  const origin = block(manifest, 'Origin');
  for (const entry of PACKET_SPEC.references) {
    if (!('file' in entry)) continue;
    assert.ok(!origin.includes(entry.file));
    assert.ok(block(manifest, 'References').includes(entry.file));
  }
});

void test('a slot the builder does not supply fails instead of rendering empty', () => {
  assert.throws(
    () => renderTemplate('Card: {{cardId}}\nOwner: {{owner}}', { cardId: 'c' }),
    /Unknown manifest slot: owner/,
  );
});

void test('a slot whose value is empty still renders', () => {
  assert.equal(renderTemplate('[{{references}}]', { references: '' }), '[]');
});

void test('amendment numbering is contiguous for each source file', () => {
  assert.throws(
    () => packetAmendments(['Amendment-2-UserInput.md']),
    /sequence is invalid/,
  );
  assert.deepEqual(
    packetAmendments([
      'Amendment-1-UserInput.md',
      'Amendment-1-Resources.md',
    ]).map((amendment) => amendment.file),
    ['Amendment-1-Resources.md', 'Amendment-1-UserInput.md'],
  );
});

void test('every template slot resolves', () => {
  const manifest = buildPacketManifest(input);
  assert.ok(!/{{\w+}}/.test(manifest));
  assert.match(manifest, /Card: card-1/);
  assert.match(manifest, /Context revision: 12/);
});

void test('a coordinator file that was never written is reported as its own', async () => {
  const written = completeFiles.filter((file) => file !== 'Assignment.md');
  const dir = await packetDirectory([...written, PACKET_SPEC.manifestFile]);
  const { missing } = await verifyPacket(dir);
  assert.deepEqual(missing, [
    { id: 'assignment', file: 'Assignment.md', producer: 'coordinator' },
  ]);
  await rm(dir, { recursive: true, force: true });
});

void test('a host file that was never produced is reported as its own', async () => {
  const written = completeFiles.filter((file) => file !== 'Acceptance.md');
  const dir = await packetDirectory([...written, PACKET_SPEC.manifestFile]);
  const { missing } = await verifyPacket(dir);
  assert.deepEqual(missing, [
    { id: 'acceptance', file: 'Acceptance.md', producer: 'host' },
  ]);
  await rm(dir, { recursive: true, force: true });
});

void test('a complete packet reports nothing missing or unexpected', async () => {
  const dir = await packetDirectory([
    ...completeFiles,
    PACKET_SPEC.manifestFile,
  ]);
  assert.deepEqual(await verifyPacket(dir), {
    missing: [],
    unexpectedFiles: [],
  });
  await rm(dir, { recursive: true, force: true });
});

void test('a file the spec never declared is reported', async () => {
  const dir = await packetDirectory([
    ...completeFiles,
    PACKET_SPEC.manifestFile,
    'stray.md',
  ]);
  assert.deepEqual((await verifyPacket(dir)).unexpectedFiles, ['stray.md']);
  await rm(dir, { recursive: true, force: true });
});

void test('a missing manifest is reported first', async () => {
  const dir = await packetDirectory(completeFiles);
  const { missing } = await verifyPacket(dir);
  assert.deepEqual(missing, [
    { id: 'manifest', file: PACKET_SPEC.manifestFile, producer: 'host' },
  ]);
  await rm(dir, { recursive: true, force: true });
});

void test('a packet without an assigned responsibility reports the directory', async () => {
  const dir = await packetDirectory([
    ...PACKET_FILES,
    PACKET_SPEC.manifestFile,
  ]);
  assert.deepEqual((await verifyPacket(dir)).missing, [
    {
      id: 'responsibilities',
      file: 'Responsibilities/',
      producer: 'coordinator',
    },
  ]);
  await rm(dir, { recursive: true, force: true });
});
