import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCanvasCanCreateStartNode,
  CanvasStartConflictError,
} from '../lib/task-graph-rules.ts';

void test('allows the first Start node in a Canvas', () => {
  assert.doesNotThrow(() => assertCanvasCanCreateStartNode([]));
});

void test('rejects a second Start node in the same Canvas', () => {
  assert.throws(
    () => assertCanvasCanCreateStartNode([{ role: 'start' }]),
    CanvasStartConflictError,
  );
});
