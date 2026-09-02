import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedDecisionsAfter,
  classifyWorkerSettlement,
  dispatchWorkerTool,
  workerSettlementEvent,
  workerSettlementPrompt,
  type ExecutionReport,
} from '../lib/coordinator-events.ts';
import { createCardHarnessRequest } from '../lib/just-do-it-harness.ts';
import { createCoordinationRequest } from '../lib/just-do-it-coordination.ts';

const cardId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const criteria = [
  {
    id: 'C1',
    criterion: 'Output works',
    passCondition: 'Required behavior works',
    evidence: 'Actual result',
  },
];
const task = createCardHarnessRequest(
  {
    cardId,
    contextRevision: 2,
    goal: 'Fixture',
    moduleInstructions: 'Fixture rules',
    skills: [],
    resources: [],
    handoffMarkdown: 'Earlier verified conclusion.',
    plan: {
      status: 'finalized',
      overview: 'One Action',
      steps: [
        {
          id: actionId,
          title: 'Create output',
          input: 'Fixture',
          output: 'Working output',
          validation: 'Check output',
          acceptanceCriteria: criteria,
        },
      ],
    },
    acceptedActionIds: [],
    acceptanceChecklist: { version: 'v1', items: criteria },
    acceptanceOverrides: {},
    currentOutput: null,
    execution: {
      running: false,
      hasOutput: false,
      effects: 'clean',
      rollbackConfirmed: false,
      consumedByCardIds: [],
    },
  },
  'execution',
  'Create output',
  actionId,
);
function report(outcome: ExecutionReport['outcome']): ExecutionReport {
  return {
    harnessRevision: task.harnessRevision,
    requestId: task.requestId,
    cardId,
    contextRevision: 2,
    inputFingerprint: task.inputFingerprint,
    handoffSummary: 'Worker outcome',
    stage: 'execution',
    actionId,
    outcome,
    summary: 'Worker result',
    artifactRefs: ['file:output.txt'],
    checks: [
      {
        criterionId: 'C1',
        summary: 'Actual worker check',
        status: outcome === 'delivered' ? 'passed' : 'failed',
        evidenceRefs: ['file:output.txt'],
      },
    ],
    remaining: [],
    additionalChecks: [],
  };
}
function request(repairsRemaining: number) {
  return createCoordinationRequest({
    phase: 'qualify',
    task,
    basis: 'basis',
    priorEvidence: [],
    previousContext: 'Keep earlier repository decision.',
    workerReport: report('blocked'),
    previousDecision: null,
    repairsRemaining,
  });
}

void test('worker settlement is classified from the report outcome, not from a new worker tool', () => {
  assert.equal(classifyWorkerSettlement(report('delivered')).kind, 'completed');
  assert.equal(
    classifyWorkerSettlement(report('blocked')).kind,
    'attention-required',
  );
  assert.equal(
    classifyWorkerSettlement(report('error')).kind,
    'attention-required',
  );
  assert.equal(
    workerSettlementEvent({ kind: 'failed', reason: 'invalid JSON' }),
    'WORKER_FAILED',
  );
  assert.equal(
    workerSettlementEvent({ kind: 'completed', report: report('delivered') }),
    'WORKER_COMPLETED',
  );
  assert.equal(
    workerSettlementEvent({
      kind: 'attention-required',
      report: report('blocked'),
    }),
    'WORKER_ATTENTION_REQUIRED',
  );
});

void test('a failed worker never allows an automatic repair and an exhausted budget removes repair', () => {
  assert.deepEqual(allowedDecisionsAfter({ kind: 'failed', reason: 'x' }, 1), [
    'needs-user',
    'blocked',
  ]);
  assert.deepEqual(
    allowedDecisionsAfter(
      { kind: 'completed', report: report('delivered') },
      1,
    ),
    ['repair', 'ready', 'needs-user', 'blocked'],
  );
  assert.deepEqual(
    allowedDecisionsAfter(
      { kind: 'attention-required', report: report('blocked') },
      0,
    ),
    ['ready', 'needs-user', 'blocked'],
  );
});

void test('continuation prompts carry the event, the new request identity and no task replay', () => {
  const req = request(1);
  const prompt = workerSettlementPrompt(
    { kind: 'attention-required', report: report('blocked') },
    req,
    allowedDecisionsAfter(
      { kind: 'attention-required', report: report('blocked') },
      1,
    ),
  );
  assert.ok(prompt.startsWith('WORKER_ATTENTION_REQUIRED\n'));
  const body = JSON.parse(prompt.split('\n')[1]);
  assert.equal(body.requestId, req.requestId);
  assert.equal(body.phase, 'qualify');
  assert.equal(body.settlement, 'attention-required');
  assert.deepEqual(body.allowedDecisions, [
    'repair',
    'ready',
    'needs-user',
    'blocked',
  ]);
  assert.equal(body.task, undefined);
  assert.equal(body.priorEvidence, undefined);
  assert.equal(body.workerReport.outcome, 'blocked');
  assert.match(prompt, new RegExp(`requestId ${req.requestId}`));
  assert.match(prompt, /call dispatch_worker/);
  const failed = workerSettlementPrompt(
    { kind: 'failed', reason: 'Worker did not return a valid report' },
    request(0),
    ['needs-user', 'blocked'],
  );
  assert.ok(failed.startsWith('WORKER_FAILED\n'));
  assert.match(failed, /no automatic full-task replay/);
  assert.equal(dispatchWorkerTool.name, 'dispatch_worker');
  assert.deepEqual(dispatchWorkerTool.inputSchema.required, ['decision']);
});
