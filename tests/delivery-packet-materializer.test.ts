import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  materializeDeliveryPacket,
  type DeliveryPacketMaterializeInput,
} from '../lib/modules/implementation/delivery-packet.ts';
import { verifyPacket } from '../lib/modules/implementation/delivery-packet-manifest.ts';

function request(packetDir: string): DeliveryPacketMaterializeInput {
  return {
    packetDir,
    manifest: { cardId: 'card-1', actionId: 'action-1', contextRevision: 1 },
    responsibilities: ['mechanical'],
    host: {
      environment: '# Environment\n\nLocal.',
      'user-input': '# User Input\n\nCreate it.',
      resources: '# Resources\n\nNone.',
      acceptance: '# Acceptance\n\nOne criterion.',
      'product-context': '# Product Context\n\nNone.',
    },
    coordinator: {
      assignment: '# Assignment\n\nCreate it.',
      skills: '# Skills\n\nNone.',
      'verification-plan': '# Verification Plan\n\nCheck it.',
    },
  };
}

void test('materialization creates a complete ordered packet', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'delivery-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  const result = await materializeDeliveryPacket(request(packetDir));
  assert.equal(result.amendmentFiles.length, 0);
  assert.deepEqual(await verifyPacket(packetDir), {
    missing: [],
    unexpectedFiles: [],
  });
  const manifest = await readFile(result.manifestPath, 'utf8');
  assert.match(
    manifest,
    /Skip a file only when you can point to having read that exact filename earlier in this session/,
  );
  assert.ok(
    manifest.indexOf('UserInput.md') < manifest.indexOf('Resources.md'),
  );
  assert.ok(
    manifest.indexOf('Environment.md') < manifest.indexOf('Responsibilities/'),
  );
  assert.ok(
    manifest.indexOf('Responsibilities/') < manifest.indexOf('UserInput.md'),
  );
  const pointer = JSON.parse(
    await readFile(
      path.join(packetDir, 'Responsibilities/Responsibility-1.json'),
      'utf8',
    ),
  ) as { id: string; source: string };
  assert.equal(pointer.id, 'mechanical');
  assert.match(pointer.source, /\/lib\/responsibilities\/mechanical\.json$/);
});

void test('a coordinator responsibility gap appends only a new pointer', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'delivery-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  await materializeDeliveryPacket(request(packetDir));
  const first = await readFile(
    path.join(packetDir, 'Responsibilities/Responsibility-1.json'),
    'utf8',
  );
  const repair = request(packetDir);
  repair.responsibilities = ['ios-development'];
  const result = await materializeDeliveryPacket(repair);
  assert.deepEqual(result.createdFiles, [
    'Responsibilities/Responsibility-2.json',
  ]);
  assert.equal(
    await readFile(
      path.join(packetDir, 'Responsibilities/Responsibility-1.json'),
      'utf8',
    ),
    first,
  );
  const second = JSON.parse(
    await readFile(
      path.join(packetDir, 'Responsibilities/Responsibility-2.json'),
      'utf8',
    ),
  ) as { id: string; source: string };
  assert.equal(second.id, 'ios-development');
  assert.match(
    second.source,
    /\/lib\/responsibilities\/ios-development\.json$/,
  );
});

void test('changed content becomes a new ordered amendment and identical content is idempotent', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'delivery-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  await materializeDeliveryPacket(request(packetDir));
  const changed = request(packetDir);
  changed.host['user-input'] = '# User Input\n\nAdd another condition.';
  const second = await materializeDeliveryPacket(changed);
  assert.deepEqual(second.amendmentFiles, ['Amendment-1-UserInput.md']);
  const manifest = await readFile(second.manifestPath, 'utf8');
  assert.ok(
    manifest.indexOf('UserInput.md') <
      manifest.indexOf('Amendment-1-UserInput.md'),
  );
  assert.ok(
    manifest.indexOf('Amendment-1-UserInput.md') <
      manifest.indexOf('Resources.md'),
  );
  const repeated = await materializeDeliveryPacket(changed);
  assert.deepEqual(repeated.amendmentFiles, []);
  assert.equal(
    (await readdir(packetDir)).filter((file) => file.startsWith('Amendment-'))
      .length,
    1,
  );
});

void test('a later amendment receives the next name without changing earlier files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'delivery-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  const initial = request(packetDir);
  await materializeDeliveryPacket(initial);
  const second = request(packetDir);
  second.host['user-input'] = '# User Input\n\nSecond.';
  await materializeDeliveryPacket(second);
  const third = request(packetDir);
  third.host['user-input'] = '# User Input\n\nThird.';
  const result = await materializeDeliveryPacket(third);
  assert.deepEqual(result.amendmentFiles, ['Amendment-2-UserInput.md']);
  assert.equal(
    await readFile(path.join(packetDir, 'UserInput.md'), 'utf8'),
    initial.host['user-input'],
  );
  assert.equal(
    (
      await readFile(path.join(packetDir, 'Amendment-1-UserInput.md'), 'utf8')
    ).includes(second.host['user-input']!),
    true,
  );
});

void test('an acceptance protocol change becomes an amendment without changing the frozen source file', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'delivery-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  const initial = request(packetDir);
  await materializeDeliveryPacket(initial);
  const changed = request(packetDir);
  changed.host.acceptance = '# Acceptance\n\nDifferent.';
  const result = await materializeDeliveryPacket(changed);
  assert.deepEqual(result.amendmentFiles, ['Amendment-1-Acceptance.md']);
  assert.equal(
    await readFile(path.join(packetDir, 'Acceptance.md'), 'utf8'),
    initial.host.acceptance,
  );
});
