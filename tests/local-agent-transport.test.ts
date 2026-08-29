import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCodexEvent } from '../lib/local-agent-transport.ts';

void test('parses Codex JSONL events', () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"thread.started","thread_id":"thread-0001"}'),
    { type: 'thread.started', thread_id: 'thread-0001' },
  );
});

void test('ignores non-JSON Codex output', () => {
  assert.equal(parseCodexEvent('Reading additional input from stdin...'), null);
});
