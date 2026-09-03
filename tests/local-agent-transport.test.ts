import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClaudeArguments,
  localAgentUsageDelta,
  normalizeClaudeUsage,
  parseClaudeEvent,
  parseCodexEvent,
} from '../lib/agents/transport.ts';

void test('subtracts the prior Session total from resumed Codex usage', () => {
  const baseline = {
    inputTokens: 144_684,
    cachedInputTokens: 109_952,
    cacheWriteInputTokens: 0,
    outputTokens: 9_740,
    reasoningOutputTokens: 2_810,
  };
  const cumulative = {
    inputTokens: 361_304,
    cachedInputTokens: 289_408,
    cacheWriteInputTokens: 0,
    outputTokens: 32_312,
    reasoningOutputTokens: 7_376,
  };

  assert.deepEqual(localAgentUsageDelta(cumulative, baseline), {
    inputTokens: 216_620,
    cachedInputTokens: 179_456,
    cacheWriteInputTokens: 0,
    outputTokens: 22_572,
    reasoningOutputTokens: 4_566,
  });
  assert.deepEqual(localAgentUsageDelta(cumulative), cumulative);
  assert.deepEqual(localAgentUsageDelta(baseline, cumulative), baseline);
});

void test('parses Codex JSONL events', () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"thread.started","thread_id":"thread-0001"}'),
    { type: 'thread.started', thread_id: 'thread-0001' },
  );
});

void test('ignores non-JSON Codex output', () => {
  assert.equal(parseCodexEvent('Reading additional input from stdin...'), null);
});

void test('parses Claude JSONL events', () => {
  assert.deepEqual(
    parseClaudeEvent(
      '{"type":"system","subtype":"init","session_id":"session-0001"}',
    ),
    { type: 'system', subtype: 'init', session_id: 'session-0001' },
  );
});

void test('ignores non-JSON Claude output', () => {
  assert.equal(parseClaudeEvent('Loading local settings...'), null);
});

void test('maps Claude usage onto the shared transport shape', () => {
  assert.deepEqual(
    normalizeClaudeUsage({
      input_tokens: 11,
      cache_read_input_tokens: 22,
      cache_creation_input_tokens: 33,
      output_tokens: 44,
      output_tokens_details: { thinking_tokens: 55 },
    }),
    {
      inputTokens: 11,
      cachedInputTokens: 22,
      cacheWriteInputTokens: 33,
      outputTokens: 44,
      reasoningOutputTokens: 55,
    },
  );
  assert.equal(normalizeClaudeUsage(undefined), null);
});

void test('resumes a Claude Session only when an identifier exists', () => {
  assert.deepEqual(buildClaudeArguments('session-0001').slice(-2), [
    '--resume',
    'session-0001',
  ]);
  assert.ok(!buildClaudeArguments().includes('--resume'));
  assert.ok(buildClaudeArguments().includes('--restricted'));
  assert.deepEqual(
    buildClaudeArguments().slice(
      buildClaudeArguments().indexOf('--tools'),
      buildClaudeArguments().indexOf('--tools') + 2,
    ),
    ['--tools', 'Read,Glob,Grep'],
  );
});
