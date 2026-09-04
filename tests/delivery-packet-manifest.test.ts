import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildPacketManifest,
  verifyPacket,
  placeholderFor,
  PACKET_SPEC,
  PACKET_FILES,
  type PacketManifestInput,
} from '../lib/modules/implementation/delivery-packet-manifest.ts';

const materialized = Object.fromEntries(
  PACKET_SPEC.entries
    .filter((entry) => entry.kind === 'materialized')
    .map((entry) => [entry.id, true]),
);

const input = (
  patch: Partial<PacketManifestInput> = {},
): PacketManifestInput => ({
  cardId: 'card-1',
  actionId: 'action-1',
  contextRevision: 12,
  checklistVersion: 'v3',
  materialized: { ...materialized },
  references: {
    'source-goal': [
      { ref: 'cards/card-1/source.md', description: 'Goal.', state: 'present' },
    ],
  },
  ...patch,
});

async function packetDirectory(files: readonly string[]) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'packet-'));
  await mkdir(dir, { recursive: true });
  for (const file of files) await writeFile(path.join(dir, file), 'x', 'utf8');
  return dir;
}

void test('every required packet file is produced before a manifest exists', () => {
  assert.throws(
    () =>
      buildPacketManifest(
        input({ materialized: { ...materialized, acceptance: false } }),
      ),
    /Required packet file was not produced: acceptance/,
  );
});

void test('a required reference that resolved to nothing usable fails', () => {
  assert.throws(
    () =>
      buildPacketManifest(
        input({
          references: {
            'source-goal': [
              {
                ref: 'cards/card-1/source.md',
                description: 'Goal.',
                state: 'missing',
              },
            ],
          },
        }),
      ),
    /Required reference is unavailable: source-goal/,
  );
});

void test('a single-reference entry rejects a second reference', () => {
  assert.throws(
    () =>
      buildPacketManifest(
        input({
          references: {
            ...input().references,
            plan: [
              { ref: 'a/plan.md', description: 'Plan.', state: 'present' },
              { ref: 'b/plan.md', description: 'Plan.', state: 'present' },
            ],
          },
        }),
      ),
    /Entry accepts one reference: plan/,
  );
});

void test('reading order names only material the Worker can actually open', () => {
  const manifest = buildPacketManifest(
    input({ materialized: { ...materialized, environment: false } }),
  );
  const order = manifest.slice(
    manifest.indexOf('## Reading Order'),
    manifest.indexOf('Execute only'),
  );
  assert.ok(!order.includes('Environment.json'));
  assert.ok(order.includes('UserInput.md'));
  assert.ok(order.includes('Source Goal'));
  assert.ok(!order.includes('Prerequisites'));
});

void test('an absent optional item stays recorded instead of disappearing', () => {
  const manifest = buildPacketManifest(
    input({
      materialized: { ...materialized, environment: false },
      references: {
        ...input().references,
        'product-context': [
          { ref: 'context/a.md', description: 'A.', state: 'missing' },
        ],
      },
    }),
  );
  assert.match(manifest, /`Environment\.json` \| not-applicable/);
  assert.match(manifest, /`context\/a\.md` — missing/);
  assert.match(
    manifest,
    /### Prerequisites\n\nOutput of accepted[\s\S]*?- none/,
  );
});

void test('a reference hash is rendered as this round evidence', () => {
  const manifest = buildPacketManifest(
    input({
      references: {
        'source-goal': [
          {
            ref: 'cards/card-1/source.md',
            description: 'Goal.',
            state: 'present',
            hash: 'ab12',
          },
        ],
      },
    }),
  );
  assert.match(
    manifest,
    /`cards\/card-1\/source\.md` — present — ab12 — Goal\./,
  );
});

void test('every template slot resolves', () => {
  assert.ok(!/{{\w+}}/.test(buildPacketManifest(input())));
});

void test('an unfilled agent section is reported until the Coordinator replaces it', async () => {
  const dir = await packetDirectory(PACKET_FILES);
  await writeFile(
    path.join(dir, PACKET_SPEC.manifestFile),
    buildPacketManifest(input()),
    'utf8',
  );
  const before = await verifyPacket(dir);
  assert.deepEqual(before.unfilledSections, [
    'assignment',
    'verification-plan',
  ]);
  assert.deepEqual(before.missingFiles, []);
  assert.deepEqual(before.unexpectedFiles, []);

  const filled = buildPacketManifest(input()).replace(
    placeholderFor('assignment'),
    'Ship the manifest builder.',
  );
  await writeFile(path.join(dir, PACKET_SPEC.manifestFile), filled, 'utf8');
  assert.deepEqual((await verifyPacket(dir)).unfilledSections, [
    'verification-plan',
  ]);
  await rm(dir, { recursive: true, force: true });
});

void test('verification reports a declared file that never reached the packet', async () => {
  const dir = await packetDirectory(
    PACKET_FILES.filter((file) => file !== 'Acceptance.json'),
  );
  await writeFile(
    path.join(dir, PACKET_SPEC.manifestFile),
    buildPacketManifest(input()),
    'utf8',
  );
  assert.deepEqual((await verifyPacket(dir)).missingFiles, ['Acceptance.json']);
  await rm(dir, { recursive: true, force: true });
});

void test('verification reports a file the spec never declared', async () => {
  const dir = await packetDirectory([...PACKET_FILES, 'stray.txt']);
  await writeFile(
    path.join(dir, PACKET_SPEC.manifestFile),
    buildPacketManifest(input()),
    'utf8',
  );
  assert.deepEqual((await verifyPacket(dir)).unexpectedFiles, ['stray.txt']);
  await rm(dir, { recursive: true, force: true });
});

void test('a missing manifest is itself reported', async () => {
  const dir = await packetDirectory(PACKET_FILES);
  const result = await verifyPacket(dir);
  assert.equal(result.missingFiles[0], PACKET_SPEC.manifestFile);
  await rm(dir, { recursive: true, force: true });
});
