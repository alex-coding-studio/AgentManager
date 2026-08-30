import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackPopoverPosition } from '../lib/markdown-feedback-position.ts';

const reader = { left: 100, top: 100, right: 700, bottom: 1000 };
const viewport = { left: 0, top: 0, right: 800, bottom: 700 };

void test('feedback appears beside a selection rather than at the reader header', () => {
  assert.deepEqual(
    feedbackPopoverPosition(
      { left: 200, top: 450, right: 450, bottom: 470 },
      reader,
      viewport,
    ),
    { left: 100, top: 378 },
  );
});
void test('feedback near the bottom appears above the selected text', () => {
  const result = feedbackPopoverPosition(
    { left: 200, top: 670, right: 450, bottom: 690 },
    reader,
    viewport,
  )!;
  assert.ok(result.top + reader.top < 670);
  assert.ok(result.top + reader.top + 36 < 700);
});
void test('feedback stays inside the visible horizontal reader bounds', () => {
  const result = feedbackPopoverPosition(
    { left: 650, top: 450, right: 690, bottom: 470 },
    reader,
    viewport,
  )!;
  assert.ok(result.left + reader.left + 190 <= reader.right - 8);
});
void test('scrolling the selection out of view hides its feedback popover', () => {
  assert.equal(
    feedbackPopoverPosition(
      { left: 200, top: 730, right: 450, bottom: 760 },
      reader,
      viewport,
    ),
    null,
  );
});
