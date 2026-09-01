import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCardHarnessRequest,
  type CardHarnessRequest,
} from '../lib/just-do-it-harness.ts';
import {
  coordinationPrompt,
  createCoordinationRequest,
  parseCoordinationDecision,
  type CoordinationDecision,
  type CoordinationRequest,
} from '../lib/just-do-it-coordination.ts';
import {
  startCoordinatedExecution,
  coordinationLimits,
  CoordinationRunError,
} from '../lib/just-do-it-coordination-runner.ts';
import { readLocalAgentActivity } from '../lib/local-agent-activity.ts';
import type {
  startLocalAgentRun,
  LocalAgentResult,
} from '../lib/local-agent-transport.ts';

const cardId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profile = {
  agent: 'codex' as const,
  model: 'test-model',
  effort: 'low' as const,
};
const criteria = [
  {
    id: 'C1',
    criterion: 'Output works',
    passCondition: 'Required behavior works',
    evidence: 'Actual result',
  },
];
function task(): CardHarnessRequest {
  return createCardHarnessRequest(
    {
      cardId,
      contextRevision: 2,
      goal: 'Fixture',
      moduleInstructions: 'Fixture rules',
      skills: [],
      resources: [],
      handoffMarkdown:
        'Earlier verified conclusion: use the canonical repository.',
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
}
function decision(
  req: CoordinationRequest,
  kind: CoordinationDecision['decision'],
): CoordinationDecision {
  return {
    version: 1,
    requestId: req.requestId,
    cardId,
    actionId,
    contextRevision: 2,
    checklistVersion: 'v1',
    decision: kind,
    summary: 'Bounded result',
    instructions:
      kind === 'dispatch' || kind === 'repair'
        ? 'Only repair the requested output.'
        : '',
    ...(kind === 'repair'
      ? {
          repairAssessment: {
            fixability: 'actionable' as const,
            criterionIds: ['C1'],
            cause: 'Worker output does not contain the required value.',
            changedApproach:
              'Correct the observed value before verifying again.',
            expectedEvidence:
              'Read the corrected output and report the matching value.',
          },
        }
      : {}),
    verificationPlan: [
      {
        criterionId: 'C1',
        mode: req.workerReport ? 'worker' : 'coordinator',
        evidenceIds: [],
        rationale: 'Checked applicable inputs.',
      },
    ],
    checks:
      kind === 'dispatch' || kind === 'repair'
        ? []
        : [
            {
              criterionId: 'C1',
              summary: 'Checked output',
              status: 'passed',
              evidenceRefs: ['file:output.txt'],
            },
          ],
    artifactRefs: ['file:output.txt'],
    additionalFindings: [
      {
        criterionId: '',
        summary: 'Old lint failure fixed',
        status: 'failed',
        evidenceRefs: ['log:lint'],
        resolved: true,
        needsAttention: false,
      },
    ],
    scopeNotes: [],
    contextSummary:
      'Canonical repository verified; retain this fact for the next Action.',
  };
}
const usage = {
  inputTokens: 10,
  cachedInputTokens: 5,
  cacheWriteInputTokens: 0,
  outputTokens: 2,
  reasoningOutputTokens: 1,
};
function result(output: unknown): LocalAgentResult {
  return {
    agentSessionId: 'fixture',
    finalOutput: JSON.stringify(output),
    usage,
  };
}
function worker(t: CardHarnessRequest, status: 'passed' | 'failed' = 'passed') {
  return result({
    harnessRevision: t.harnessRevision,
    requestId: t.requestId,
    cardId,
    contextRevision: 2,
    inputFingerprint: t.inputFingerprint,
    handoffSummary: 'Worker outcome',
    stage: 'execution',
    actionId,
    outcome: status === 'passed' ? 'delivered' : 'blocked',
    summary: 'Worker result',
    artifactRefs: ['file:output.txt'],
    checks: [
      {
        criterionId: 'C1',
        summary: 'Actual worker check',
        status,
        evidenceRefs: ['file:output.txt'],
      },
    ],
    remaining: [],
    additionalChecks: [],
  });
}
function setup(
  coordinator: (req: CoordinationRequest) => CoordinationDecision,
  workerStatus: Array<'passed' | 'failed'> = ['passed'],
) {
  const request = task();
  const calls: Array<{ agent: string; access: unknown; prompt: string }> = [];
  let workers = 0;
  const transport: typeof startLocalAgentRun = (agent, options) => {
    calls.push({ agent, access: options.access, prompt: options.prompt });
    const value =
      options.access === 'read-only'
        ? result(
            coordinator(
              JSON.parse(options.prompt.split('COORDINATION REQUEST:\n')[1]),
            ),
          )
        : worker(request, workerStatus[workers++] ?? 'passed');
    return { completion: Promise.resolve(value), cancel: () => {} };
  };
  const start = () =>
    startCoordinatedExecution({
      request,
      workerOptions: {
        workingDirectory: '/fixture',
        prompt: 'WORKER',
        model: 'worker-model',
        effort: 'low',
        access: 'workspace-write',
      },
      workerAgent: 'codex',
      settings: { profile },
      priorEvidence: [],
      previousContext: 'Keep earlier repository decision.',
      readBasis: async () => 'basis',
      onProgress: () => {},
      transport,
    });
  return { start, calls };
}
void test('complete worker self-check bypasses coordinator review and keeps separate usage', async () => {
  const f = setup((req) =>
    decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready'),
  );
  const output = (await f.start().completion) as Awaited<
    ReturnType<typeof startCoordinatedExecution>['completion']
  > & { coordination: { attempts: unknown[] } };
  assert.deepEqual(
    f.calls.map((c) => c.access),
    ['read-only', 'workspace-write'],
  );
  assert.equal(output.usage?.inputTokens, 20);
  assert.equal(output.usage?.cachedInputTokens, 10);
  assert.equal(output.coordination.attempts.length, 2);
  assert.deepEqual(JSON.parse(output.finalOutput).additionalChecks, []);
  assert.match(f.calls[1].prompt, /Only repair the requested output/);
});

void test('Coordinator Harness stays a coordinator rather than becoming a Reviewer or retry loop', () => {
  const req = createCoordinationRequest({
    phase: 'prepare',
    task: task(),
    basis: 'current',
    priorEvidence: [],
    previousContext: '',
    workerReport: null,
    previousDecision: null,
    repairsRemaining: 1,
  });
  const prompt = coordinationPrompt(req);
  assert.match(prompt, /You are not the code or product Reviewer/);
  assert.match(prompt, /Trust passed worker self-checks/);
  assert.match(
    prompt,
    /Repeating the same commands without a changed condition is not a repair plan/,
  );
  assert.match(
    prompt,
    /Do not dispatch repair solely for additional diagnostics/,
  );
});
void test('a coordinator-only reference decision does not start a coding worker', async () => {
  const f = setup((req) => decision(req, 'ready'));
  await f.start().completion;
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].access, 'read-only');
});
void test('a human-decision task returns missing checks without unnecessary coding', async () => {
  const f = setup((req) => {
    const d = decision(req, 'needs-user');
    d.checks[0].status = 'not-run';
    return d;
  });
  const output = await f.start().completion;
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.parse(output.finalOutput).outcome, 'blocked');
  assert.equal(JSON.parse(output.finalOutput).checks[0].status, 'not-run');
});
void test('a failed worker check cannot be rewritten as passed by the coordinator', async () => {
  const f = setup(
    (req) => decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready'),
    ['failed'],
  );
  await assert.rejects(
    f.start().completion,
    /required failure|unpassed worker check/,
  );
  assert.equal(f.calls.length, 3);
});
void test('one focused correction is allowed but further repair is rejected without another worker', async () => {
  const f = setup(
    (req) => decision(req, req.phase === 'prepare' ? 'dispatch' : 'repair'),
    ['failed', 'failed'],
  );
  await assert.rejects(f.start().completion, /repair budget exhausted/);
  assert.equal(f.calls.length, 5);
});
void test('a repaired worker result can complete within the same bounded Action request', async () => {
  const f = setup(
    (req) =>
      decision(
        req,
        req.phase === 'prepare'
          ? 'dispatch'
          : req.repairsRemaining
            ? 'repair'
            : 'ready',
      ),
    ['failed', 'passed'],
  );
  const r = await f.start().completion;
  assert.equal(f.calls.length, 4);
  assert.equal(JSON.parse(r.finalOutput).outcome, 'delivered');
});
void test('reuse is accepted only for known evidence bound to current inputs', () => {
  const req = createCoordinationRequest({
    phase: 'prepare',
    task: task(),
    basis: 'current',
    priorEvidence: [
      {
        id: 'prior',
        actionId,
        criterionId: 'C1',
        basis: 'current',
        summary: 'Prior pass',
        evidenceRefs: ['file:output.txt'],
      },
    ],
    previousContext: '',
    workerReport: null,
    previousDecision: null,
    repairsRemaining: 1,
  });
  const d = decision(req, 'ready');
  d.verificationPlan[0] = {
    criterionId: 'C1',
    mode: 'reuse',
    evidenceIds: ['prior'],
    rationale: 'Inputs remain applicable.',
  };
  assert.equal(
    parseCoordinationDecision(JSON.stringify(d), req).decision,
    'ready',
  );
  req.basis = 'changed';
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(d), req),
    /stale or unknown/,
  );
});
void test('foreign identity and invented user waivers fail before dispatch', () => {
  const req = createCoordinationRequest({
    phase: 'prepare',
    task: task(),
    basis: 'current',
    priorEvidence: [],
    previousContext: '',
    workerReport: null,
    previousDecision: null,
    repairsRemaining: 1,
  });
  const d = decision(req, 'dispatch');
  d.actionId = cardId;
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(d), req),
    /another task/,
  );
  d.actionId = actionId;
  d.verificationPlan[0].mode = 'user-decision';
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(d), req),
    /invent a user decision/,
  );
});
void test('stop invalidates a late coordinator reply and prevents worker launch', async () => {
  let resolve!: (value: LocalAgentResult) => void;
  let req!: CoordinationRequest;
  let calls = 0;
  let canceled = 0;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls++;
    req = JSON.parse(options.prompt.split('COORDINATION REQUEST:\n')[1]);
    return {
      completion: new Promise((done) => {
        resolve = done;
      }),
      cancel: () => {
        canceled++;
      },
    };
  };
  const run = startCoordinatedExecution({
    request: task(),
    workerOptions: { workingDirectory: '/fixture', prompt: 'worker' },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  run.cancel();
  resolve(result(decision(req, 'dispatch')));
  await assert.rejects(run.completion, /stopped/);
  assert.equal(calls, 1);
  assert.equal(canceled, 1);
});
void test('coordinator timeout stops the call and retains trace instead of falling back to a worker', async () => {
  let calls = 0;
  let canceled = 0;
  const transport: typeof startLocalAgentRun = () => {
    calls++;
    let reject!: (error: Error) => void;
    return {
      completion: new Promise((_resolve, no) => {
        reject = no;
      }),
      cancel: () => {
        canceled++;
        reject(new Error('stopped'));
      },
    };
  };
  const run = startCoordinatedExecution({
    request: task(),
    workerOptions: { workingDirectory: '/fixture', prompt: 'worker' },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
    limits: { ...coordinationLimits, coordinatorTimeoutMs: 5 },
  });
  await assert.rejects(
    run.completion,
    (error) =>
      error instanceof CoordinationRunError &&
      /timed out/.test(error.message) &&
      error.coordination.attempts.length === 1,
  );
  assert.equal(calls, 1);
  assert.equal(canceled, 1);
});
void test('public activity excludes reasoning and redacts common credential forms', () => {
  assert.equal(
    readLocalAgentActivity({
      type: 'item.completed',
      item: { type: 'reasoning', text: 'private' },
    }),
    null,
  );
  const event = readLocalAgentActivity({
    type: 'item.started',
    item: {
      type: 'command_execution',
      command: 'TOKEN=secret-value curl -H "Bearer abc123"',
    },
  });
  assert.equal(event?.phase, 'started');
  assert(!event?.summary.includes('secret-value'));
  assert(!event?.summary.includes('abc123'));
});

void test('native delegation is disabled for both roles and coordinator tool calls have a hard cap', async () => {
  let canceled = 0;
  let optionsSeen: Parameters<typeof startLocalAgentRun>[1] | undefined;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    optionsSeen = options;
    let reject!: (error: Error) => void;
    queueMicrotask(() => {
      for (let i = 0; i < 3; i++)
        options.onActivity?.({
          kind: 'tool',
          phase: 'started',
          summary: 'Read file',
        });
    });
    return {
      completion: new Promise((_resolve, no) => {
        reject = no;
      }),
      cancel: () => {
        canceled++;
        reject(new Error('stopped'));
      },
    };
  };
  const run = startCoordinatedExecution({
    request: task(),
    workerOptions: { workingDirectory: '/fixture', prompt: 'worker' },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
    limits: { ...coordinationLimits, maxCoordinatorToolCalls: 2 },
  });
  await assert.rejects(run.completion, /tool-call budget exhausted/);
  assert.equal(canceled, 1);
  assert.equal(optionsSeen?.disableDelegation, true);
  assert.equal(optionsSeen?.isolatedProcessGroup, true);
});

void test('a current failed check cannot be hidden with an older passing reference', () => {
  const req = createCoordinationRequest({
    phase: 'qualify',
    task: task(),
    basis: 'same',
    priorEvidence: [
      {
        id: 'old',
        actionId,
        criterionId: 'C1',
        basis: 'same',
        summary: 'Earlier pass',
        evidenceRefs: ['old.log'],
      },
    ],
    previousContext: '',
    workerReport: {
      summary: 'Current failure',
      artifactRefs: [],
      checks: [
        {
          criterionId: 'C1',
          summary: 'Required test failed',
          status: 'failed',
          evidenceRefs: ['new.log'],
        },
      ],
    },
    previousDecision: null,
    repairsRemaining: 1,
  });
  const d = decision(req, 'ready');
  d.verificationPlan[0] = {
    criterionId: 'C1',
    mode: 'reuse',
    evidenceIds: ['old'],
    rationale: 'Source files unchanged.',
  };
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(d), req),
    /current required failure/,
  );
});
void test('proposed user decisions require explicit confirmation and cannot produce ready', () => {
  const req = createCoordinationRequest({
    phase: 'prepare',
    task: task(),
    basis: 'same',
    priorEvidence: [],
    previousContext: '',
    workerReport: null,
    previousDecision: null,
    repairsRemaining: 1,
  });
  const d = decision(req, 'needs-user');
  d.verificationPlan[0].mode = 'needs-user-decision';
  d.checks[0].status = 'not-run';
  assert.equal(
    parseCoordinationDecision(JSON.stringify(d), req).decision,
    'needs-user',
  );
  d.decision = 'ready';
  d.checks[0].status = 'passed';
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(d), req),
    /needs-user result/,
  );
});

void test('coordinator filters ignored diagnostics, surfaces material extras, and preserves raw findings without failing required checks', async () => {
  const f = setup((req) => {
    const d = decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready');
    d.additionalFindings = [
      {
        criterionId: '',
        summary: 'Host cannot inspect .app bundles',
        status: 'not-run',
        evidenceRefs: ['file:build/App.app'],
        resolved: false,
        needsAttention: false,
      },
      {
        criterionId: '',
        summary: 'Optional probe fixed',
        status: 'failed',
        evidenceRefs: ['log:probe'],
        resolved: true,
        needsAttention: false,
      },
      {
        criterionId: '',
        summary: 'User may want to review optional layout behavior',
        status: 'failed',
        evidenceRefs: ['log:layout'],
        resolved: false,
        needsAttention: true,
      },
    ];
    return d;
  });
  const output = (await f.start()
    .completion) as import('../lib/just-do-it-coordination-runner.ts').CoordinatedResult;
  const report = JSON.parse(output.finalOutput);
  assert.equal(f.calls.length, 2);
  assert.equal(report.outcome, 'delivered');
  assert.equal(report.checks[0].status, 'passed');
  assert.deepEqual(report.additionalChecks, []);
  assert.equal(output.coordination.decisions.length, 1);
});

void test('repair without a supported actionable remedy stops before another worker call', async () => {
  for (const fixability of ['unavailable', 'uncertain', 'missing'] as const) {
    const f = setup(
      (req) => {
        const d = decision(
          req,
          req.phase === 'prepare' ? 'dispatch' : 'repair',
        );
        if (d.repairAssessment) {
          if (fixability === 'missing') delete d.repairAssessment;
          else d.repairAssessment.fixability = fixability;
        }
        return d;
      },
      ['failed'],
    );
    await assert.rejects(f.start().completion, /actionable diagnosis/);
    assert.equal(f.calls.length, 3);
  }
});

void test('passed required checks do not ask coordinator to repair additional diagnostics', async () => {
  const f = setup((req) =>
    decision(req, req.phase === 'prepare' ? 'dispatch' : 'repair'),
  );
  const output = await f.start().completion;
  assert.equal(JSON.parse(output.finalOutput).outcome, 'delivered');
  assert.equal(f.calls.length, 2);
});

void test('machine exit contradiction routes the affected required check to coordinator recovery', async () => {
  const request = task();
  const calls: Array<{ access: unknown }> = [];
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls.push({ access: options.access });
    if (options.access === 'workspace-write') {
      options.onActivity?.({
        kind: 'tool',
        phase: 'completed',
        summary: 'Finished: ./scripts/check.sh (exit 1)',
      });
      const report = JSON.parse(worker(request).finalOutput);
      report.checks[0].evidenceRefs = ['command:./scripts/check.sh exit 0'];
      return { completion: Promise.resolve(result(report)), cancel: () => {} };
    }
    const req = JSON.parse(options.prompt.split('COORDINATION REQUEST:\n')[1]);
    const d = decision(req, req.phase === 'prepare' ? 'dispatch' : 'blocked');
    if (req.phase === 'qualify') {
      assert.equal(req.workerReport.checks[0].status, 'failed');
      assert.match(
        req.workerReport.checks[0].summary,
        /Machine evidence contradicts/,
      );
      d.checks = req.workerReport.checks;
      d.verificationPlan[0].mode = 'worker';
    }
    return { completion: Promise.resolve(result(d)), cancel: () => {} };
  };
  const run = startCoordinatedExecution({
    request,
    workerOptions: {
      workingDirectory: '/fixture',
      prompt: 'worker',
      model: 'worker-model',
      effort: 'low',
    },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
  });
  const output = await run.completion;
  const report = JSON.parse(output.finalOutput);
  assert.deepEqual(
    calls.map((call) => call.access),
    ['read-only', 'workspace-write', 'read-only'],
  );
  assert.equal(report.outcome, 'blocked');
  assert.equal(report.checks[0].status, 'failed');
});

void test('coordination failure retains the worker self-check for host presentation', async () => {
  const f = setup(
    (req) => {
      if (req.phase === 'prepare') return decision(req, 'dispatch');
      const invalid = decision(req, 'blocked');
      invalid.actionId = cardId;
      return invalid;
    },
    ['failed'],
  );
  await assert.rejects(
    f.start().completion,
    (error) =>
      error instanceof CoordinationRunError &&
      error.workerReport?.checks[0].status === 'failed' &&
      error.workerReport.summary === 'Worker result',
  );
  assert.equal(f.calls.length, 3);
});

void test('worker controls which unresolved additional checks reach the user', async () => {
  const request = task();
  let calls = 0;
  const transport: typeof startLocalAgentRun = (_agent, options) => {
    calls++;
    if (options.access === 'read-only') {
      const req = JSON.parse(
        options.prompt.split('COORDINATION REQUEST:\n')[1],
      );
      return {
        completion: Promise.resolve(result(decision(req, 'dispatch'))),
        cancel: () => {},
      };
    }
    const report = JSON.parse(worker(request).finalOutput);
    report.additionalChecks = [
      {
        summary: 'Fixed compile issue',
        status: 'failed',
        evidenceRefs: ['log:old'],
        resolved: true,
        needsAttention: false,
      },
      {
        summary: 'Current environment limitation',
        status: 'not-run',
        evidenceRefs: ['log:current'],
        resolved: false,
        needsAttention: true,
      },
    ];
    return { completion: Promise.resolve(result(report)), cancel: () => {} };
  };
  const run = startCoordinatedExecution({
    request,
    workerOptions: { workingDirectory: '/fixture', prompt: 'worker' },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
  });
  const output = JSON.parse((await run.completion).finalOutput);
  assert.equal(calls, 2);
  assert.deepEqual(
    output.additionalChecks.map((check: { summary: string }) => check.summary),
    ['Current environment limitation'],
  );
});
