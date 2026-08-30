import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserUuid } from '../lib/browser-uuid.ts';

void test('browser IDs need only getRandomValues and set RFC UUID version and variant bits', () => {
  assert.equal(
    createBrowserUuid((bytes) => bytes.fill(0)),
    '00000000-0000-4000-8000-000000000000',
  );
  assert.equal(
    createBrowserUuid((bytes) => bytes.fill(255)),
    'ffffffff-ffff-4fff-bfff-ffffffffffff',
  );
});

void test('browser IDs keep cryptographic entropy rather than falling back to timestamps or counters', () => {
  const ids = Array.from({ length: 100 }, () => createBrowserUuid());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
