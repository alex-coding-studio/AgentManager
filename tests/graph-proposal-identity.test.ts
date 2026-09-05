import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  allocateCandidateAliases,
  identitiesFingerprint,
} from '../lib/graph/identity-store.ts';
import { MaterializationError } from '../lib/materialization/receipt.ts';

async function planningPath(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proposal-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return path.join(root, '.praxis');
}

function indexFile(planning: string) {
  return path.join(planning, 'whats-next', 'identities.json');
}

async function indexDigest(planning: string) {
  const text = await readFile(indexFile(planning), 'utf8').catch(() => null);
  return text === null
    ? 'absent'
    : createHash('sha256').update(text).digest('hex');
}

async function rejects(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    assert.ok(error instanceof MaterializationError);
    return error;
  }
  assert.fail('expected a MaterializationError');
}

void test('allocation mints a fresh alias per local key and records it', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  const { aliases, index } = await allocateCandidateAliases(
    planning,
    'whats-next',
    { localKeys: ['first-direction', 'CANDIDATE-0002'] },
    fingerprint,
  );
  const first = aliases.get('first-direction');
  const second = aliases.get('CANDIDATE-0002');
  assert.ok(first && second);
  assert.notEqual(first, second);
  assert.notEqual(first, 'first-direction');
  assert.match(first, /^CANDIDATE-[0-9a-f]{8,}$/);
  assert.ok(index.aliases[first]);
  assert.notEqual(index.aliases[first], index.aliases[second]);
  const persisted = JSON.parse(await readFile(indexFile(planning), 'utf8')) as {
    aliases: Record<string, string>;
  };
  assert.equal(persisted.aliases[first], index.aliases[first]);
  assert.equal(persisted.aliases[second], index.aliases[second]);
  assert.equal('first-direction' in persisted.aliases, false);
});

void test('an allocation against a stale fingerprint is refused with 409', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  await allocateCandidateAliases(
    planning,
    'whats-next',
    { localKeys: ['CANDIDATE-0001'] },
    fingerprint,
  );
  const afterFirst = await indexDigest(planning);
  const error = await rejects(() =>
    allocateCandidateAliases(
      planning,
      'whats-next',
      { localKeys: ['CANDIDATE-0002'] },
      fingerprint,
    ),
  );
  assert.equal(error.boundary, 'stale-basis');
  assert.equal(error.status, 409);
  assert.equal(await indexDigest(planning), afterFirst);
});

void test('a rejected local key consumes no alias', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  const before = await indexDigest(planning);
  for (const localKeys of [
    ['CANDIDATE-0001', '-leading-punctuation'],
    ['CANDIDATE-0001', 'has a space'],
    ['CANDIDATE-0001', 'CANDIDATE-0001'],
  ]) {
    const error = await rejects(() =>
      allocateCandidateAliases(
        planning,
        'whats-next',
        { localKeys },
        fingerprint,
      ),
    );
    assert.equal(error.boundary, 'identity');
    assert.equal(error.status, 400);
    assert.equal(await indexDigest(planning), before);
  }
});

void test('a revision rebinds the requested alias and keeps its stable identity', async (t) => {
  const planning = await planningPath(t);
  const first = await identitiesFingerprint(planning, 'whats-next');
  const { aliases } = await allocateCandidateAliases(
    planning,
    'whats-next',
    { localKeys: ['CANDIDATE-0001'] },
    first,
  );
  const alias = aliases.get('CANDIDATE-0001')!;
  const original = JSON.parse(await readFile(indexFile(planning), 'utf8')) as {
    aliases: Record<string, string>;
  };
  const uid = original.aliases[alias]!;
  const second = await identitiesFingerprint(planning, 'whats-next');
  const revision = await allocateCandidateAliases(
    planning,
    'whats-next',
    {
      localKeys: [alias],
      revisionTarget: { candidateId: alias, revision: 2, uid },
    },
    second,
  );
  assert.equal(revision.aliases.get(alias), alias);
  assert.equal(revision.index.aliases[alias], uid);
});

void test('a revision that returns another key is refused', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  const before = await indexDigest(planning);
  const error = await rejects(() =>
    allocateCandidateAliases(
      planning,
      'whats-next',
      {
        localKeys: ['CANDIDATE-0002'],
        revisionTarget: {
          candidateId: 'CANDIDATE-0001',
          revision: 2,
          uid: '00000000-0000-4000-8000-000000000001',
        },
      },
      fingerprint,
    ),
  );
  assert.equal(error.boundary, 'identity');
  assert.equal(await indexDigest(planning), before);
});

void test('a revision of a Candidate the index does not know is refused', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  const before = await indexDigest(planning);
  const alias = 'CANDIDATE-abcdef01';
  const error = await rejects(() =>
    allocateCandidateAliases(
      planning,
      'whats-next',
      {
        localKeys: [alias],
        revisionTarget: {
          candidateId: alias,
          revision: 2,
          uid: '00000000-0000-4000-8000-000000000002',
        },
      },
      fingerprint,
    ),
  );
  assert.equal(error.boundary, 'identity');
  assert.match(error.message, /no stable identity/);
  assert.equal(await indexDigest(planning), before);
});

void test('a revision naming a Candidate that holds another identity is refused', async (t) => {
  const planning = await planningPath(t);
  const first = await identitiesFingerprint(planning, 'whats-next');
  const { aliases } = await allocateCandidateAliases(
    planning,
    'whats-next',
    { localKeys: ['first-direction'] },
    first,
  );
  const alias = aliases.get('first-direction')!;
  const second = await identitiesFingerprint(planning, 'whats-next');
  const before = await indexDigest(planning);
  const error = await rejects(() =>
    allocateCandidateAliases(
      planning,
      'whats-next',
      {
        localKeys: [alias],
        revisionTarget: {
          candidateId: alias,
          revision: 2,
          uid: '00000000-0000-4000-8000-000000000003',
        },
      },
      second,
    ),
  );
  assert.equal(error.boundary, 'identity');
  assert.match(error.message, /does not hold the stable identity/);
  assert.equal(await indexDigest(planning), before);
});

void test('a revision whose local key is not a canonical alias is refused', async (t) => {
  const planning = await planningPath(t);
  const fingerprint = await identitiesFingerprint(planning, 'whats-next');
  const before = await indexDigest(planning);
  const error = await rejects(() =>
    allocateCandidateAliases(
      planning,
      'whats-next',
      {
        localKeys: ['first-direction'],
        revisionTarget: {
          candidateId: 'first-direction',
          revision: 2,
          uid: '00000000-0000-4000-8000-000000000004',
        },
      },
      fingerprint,
    ),
  );
  assert.equal(error.boundary, 'identity');
  assert.match(error.message, /not a canonical Candidate identifier/);
  assert.equal(await indexDigest(planning), before);
});
