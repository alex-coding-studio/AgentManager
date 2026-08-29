import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaskDecompositionContinuationPrompt,
  buildTaskDecompositionPrompt,
} from '../lib/task-decomposition-prompt.ts';

void test('builds a bounded prompt with the Harness contract and request packet', () => {
  const prompt = buildTaskDecompositionPrompt({
    request: {
      sessionId: 'SESSION-0001',
      requestId: 'REQUEST-0001',
      inputFingerprint: 'fingerprint',
    },
    instruction: 'Propose the next-level modules.',
  });

  assert.match(prompt, /Task Decomposition Agent/);
  assert.match(prompt, /CANDIDATE-/);
  assert.match(prompt, /SESSION-0001/);
  assert.match(prompt, /Propose the next-level modules/);
});

void test('builds a continuation prompt without reinjecting the Harness', () => {
  const prompt = buildTaskDecompositionContinuationPrompt({
    operation: 'append-candidates',
    instruction: 'Consider the newly supplied constraint.',
  });

  assert.match(prompt, /Continue the existing AgentManager/);
  assert.match(prompt, /append-candidates/);
  assert.doesNotMatch(prompt, /complete output contract/);
  assert.doesNotMatch(prompt, /Task Decomposition Agent/);
});
