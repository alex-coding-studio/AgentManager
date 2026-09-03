import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessRequiredChecks,
  splitChecks,
  validateAcceptanceCriteria,
} from '../lib/modules/implementation/checklist.ts';
const checklist = {
  version: 'v1',
  items: [
    {
      id: 'A',
      criterion: 'App launches',
      passCondition: 'Launch succeeds',
      evidence: 'Launch result',
    },
  ],
};
const passed = {
  criterionId: 'A',
  summary: 'Launch',
  status: 'passed' as const,
  evidenceRefs: ['launch.log'],
};
void test('required coverage rejects omissions, duplicates and empty evidence', () => {
  assert.equal(assessRequiredChecks(undefined, [passed]).passed, false);
  for (const checks of [
    [],
    [passed, passed],
    [{ ...passed, evidenceRefs: [] }],
    [{ ...passed, status: 'not-run' as const }],
  ])
    assert.equal(assessRequiredChecks(checklist, checks).passed, false);
});
void test('extra failures do not block and a required ID cannot hide among extras', () => {
  const extra = {
    summary: 'ps unavailable',
    status: 'failed' as const,
    evidenceRefs: [],
  };
  const groups = splitChecks(checklist, [extra], [passed]);
  assert.equal(assessRequiredChecks(checklist, groups.required).passed, true);
  assert.deepEqual(groups.additional, [extra]);
});
void test('user override preserves actual failure and only applies to its frozen version', () => {
  const failed = { ...passed, status: 'failed' as const };
  const override = {
    A: {
      note: 'Simulator is sufficient',
      recordedAt: 'now',
      checklistVersion: 'v1',
    },
  };
  const result = assessRequiredChecks(checklist, [failed], override);
  assert.equal(result.passed, true);
  assert.equal(result.items[0].observed?.status, 'failed');
  assert.equal(
    assessRequiredChecks({ ...checklist, version: 'v2' }, [failed], override)
      .passed,
    false,
  );
});
void test('malformed and duplicate acceptance criteria fail validation', () => {
  for (const value of [
    undefined,
    [],
    [null],
    [checklist.items[0], checklist.items[0]],
  ])
    assert.throws(() => validateAcceptanceCriteria(value as never));
});
