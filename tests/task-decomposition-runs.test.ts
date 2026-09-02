import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceRunWithPreviewsInPlace } from '../lib/task-graph-preview-state.ts';
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
    content: {
      input: {
        workspacePath: 'input/user-input.md',
        sha256: 'sha256:user-input',
      },
      references: [],
      external: [],
    },
  });

  assert.match(prompt, /Decomposition Agent/);
  assert.match(prompt, /human-manageable resolution/);
  assert.match(prompt, /CANDIDATE-/);
  assert.match(prompt, /SESSION-0001/);
  assert.match(prompt, /input\/user-input\.md/);
  assert.doesNotMatch(prompt, /Propose the next-level modules/);
});

void test('builds a continuation prompt without reinjecting the Harness', () => {
  const prompt = buildTaskDecompositionContinuationPrompt({
    operation: 'append-candidates',
    content: {
      input: { workspacePath: 'input/user-input.md' },
      references: [],
      external: [],
    },
  });

  assert.match(prompt, /Continue the existing Praxis/);
  assert.match(prompt, /append-candidates/);
  assert.match(prompt, /input\/user-input\.md/);
  assert.doesNotMatch(prompt, /complete output contract/);
  assert.doesNotMatch(prompt, /Decomposition Agent/);
});
void test('replaces a revised Candidate without changing sibling order', () => {
  const current = [
    { id: 'CANDIDATE-0001', revision: 1 },
    { id: 'CANDIDATE-0002', revision: 1 },
    { id: 'RUN-0001', revision: 0 },
  ];

  assert.deepEqual(
    replaceRunWithPreviewsInPlace(current, 'RUN-0001', [
      { id: 'CANDIDATE-0001', revision: 2 },
    ]),
    [
      { id: 'CANDIDATE-0001', revision: 2 },
      { id: 'CANDIDATE-0002', revision: 1 },
    ],
  );
});

void test('inserts genuinely new Candidates at the Run placeholder', () => {
  const current = [
    { id: 'CANDIDATE-0001' },
    { id: 'RUN-0001' },
    { id: 'CANDIDATE-0002' },
  ];

  assert.deepEqual(
    replaceRunWithPreviewsInPlace(current, 'RUN-0001', [
      { id: 'CANDIDATE-0003' },
      { id: 'CANDIDATE-0004' },
    ]).map((preview) => preview.id),
    ['CANDIDATE-0001', 'CANDIDATE-0003', 'CANDIDATE-0004', 'CANDIDATE-0002'],
  );
});
