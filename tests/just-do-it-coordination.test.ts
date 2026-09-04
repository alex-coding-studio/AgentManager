import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCardHarnessRequest,
  type CardHarnessRequest,
} from '../lib/modules/implementation/harness.ts';
import {
  coordinationPrompt,
  createCoordinationRequest,
  parseCoordinationDecision,
  type CoordinationDecision,
  type CoordinationRequest,
} from '../lib/modules/implementation/coordination.ts';
import {
  startCoordinatedExecution,
  coordinationLimits,
  CoordinationRunError,
} from '../lib/modules/implementation/coordination-runner.ts';
import { readLocalAgentActivity } from '../lib/agents/activity.ts';
import type {
  startLocalAgentRun,
  LocalAgentResult,
} from '../lib/agents/transport.ts';
import {
  isHostToolSuspension,
  type AgentRuntimeCapabilities,
  type AgentRuntimeThread,
  type AgentRuntimeThreadInput,
  type AgentRuntimeTurn,
  type AgentRuntimeTurnInput,
  type AgentSessionDriver,
  type HostTool,
} from '../lib/agents/runtime-driver.ts';
import type { CoordinatorSession } from '../lib/agents/event-driven-transport.ts';
import { CodexAppServerDriver } from '../lib/agents/codex/app-server-driver.ts';
import { HostJobBroker } from '../lib/agents/host-job-broker.ts';
import {
  compileResponsibilityInstructions,
  executionResponsibilityInstructions,
  loadExecutionResponsibilities,
  resolveExecutionResponsibilities,
} from '../lib/modules/implementation/execution-responsibilities.ts';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
const setupSkill = {
  name: 'ios-dev-agent:setup',
  path: '/installed/ios/setup/SKILL.md',
};
function task(
  skills: Array<{ name: string; path: string }> = [setupSkill],
): CardHarnessRequest {
  return createCardHarnessRequest(
    {
      cardId,
      contextRevision: 2,
      goal: 'Fixture',
      moduleInstructions: 'Fixture rules',
      skills,
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
    responsibilities: ['general'],
    skillPaths: [],
    summary: 'Bounded result',
    instructions:
      kind === 'dispatch' || kind === 'extend' || kind === 'repair'
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
      kind === 'dispatch' || kind === 'extend' || kind === 'repair'
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
  options: {
    request?: CardHarnessRequest;
    discoverSkills?: Parameters<
      typeof startCoordinatedExecution
    >[0]['discoverSkills'];
  } = {},
) {
  const request = options.request ?? task();
  const calls: Array<{
    agent: string;
    access: unknown;
    prompt: string;
    allowedSkillPaths?: string[];
  }> = [];
  let workers = 0;
  const transport: typeof startLocalAgentRun = (agent, options) => {
    calls.push({
      agent,
      access: options.access,
      prompt: options.prompt,
      allowedSkillPaths: options.allowedSkillPaths,
    });
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
      discoverSkills: options.discoverSkills,
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
  assert.match(f.calls[1].prompt, /"responsibilities":\["general"\]/);
  assert.match(f.calls[1].prompt, /Perform only this packet/);
  assert.match(f.calls[1].prompt, /Read each assigned SKILL.md once/);
  assert.doesNotMatch(f.calls[1].prompt, /Mechanical responsibility/);
  assert.deepEqual(f.calls[1].allowedSkillPaths, []);
});

void test('runtime-discovered Skills become the validated Coordinator catalog', async () => {
  const f = setup(
    (req) => {
      assert.deepEqual(req.availableSkills, [setupSkill]);
      const output = decision(
        req,
        req.phase === 'prepare' ? 'dispatch' : 'ready',
      );
      output.skillPaths = [setupSkill.path];
      return output;
    },
    ['passed'],
    {
      request: task([]),
      discoverSkills: async () => ({
        skills: [
          { ...setupSkill, description: 'Setup', enabled: true },
          {
            name: 'unselected',
            description: 'Another Skill',
            path: '/installed/unselected/SKILL.md',
            enabled: false,
          },
        ],
        executionAccess: 'workspace-write',
      }),
    },
  );
  await f.start().completion;
  assert.deepEqual(f.calls[1].allowedSkillPaths, [setupSkill.path]);
  assert.match(f.calls[1].prompt, /ios-dev-agent:setup/);
  assert.doesNotMatch(f.calls[1].prompt, /unselected/);
});

void test('Coordinator composes inherited Worker responsibilities for mixed work', async () => {
  const f = setup((req) => {
    const output = decision(
      req,
      req.phase === 'prepare' ? 'dispatch' : 'ready',
    );
    output.responsibilities = ['mechanical', 'ios-development'];
    output.skillPaths = ['/installed/ios/setup/SKILL.md'];
    return output;
  });
  await f.start().completion;
  const workerPrompt = f.calls[1].prompt;
  assert.match(
    workerPrompt,
    /"responsibilities":\["mechanical","ios-development"\]/,
  );
  assert.match(workerPrompt, /Execution responsibility general/);
  assert.match(workerPrompt, /Mechanical responsibility/);
  assert.match(workerPrompt, /iOS development responsibility/);
  assert.match(workerPrompt, /ios-dev-agent:setup/);
  assert.deepEqual(f.calls[1].allowedSkillPaths, [
    '/installed/ios/setup/SKILL.md',
  ]);
  assert.equal(
    workerPrompt.match(/Execution responsibility general/g)?.length,
    1,
  );
});

void test('responsibility resolution defaults to general and keeps additions composable', () => {
  assert.deepEqual(resolveExecutionResponsibilities(undefined), ['general']);
  assert.deepEqual(resolveExecutionResponsibilities('retired-responsibility'), [
    'general',
  ]);
  assert.deepEqual(
    resolveExecutionResponsibilities([
      'mechanical',
      'ios-development',
      'mechanical',
    ]),
    ['mechanical', 'ios-development'],
  );
  assert.deepEqual(
    resolveExecutionResponsibilities(['general', 'mechanical']),
    ['mechanical'],
  );
  const combined = executionResponsibilityInstructions([
    'mechanical',
    'ios-development',
  ]);
  assert.equal(combined.match(/Execution responsibility general/g)?.length, 1);
  assert.match(combined, /Mechanical responsibility/);
  assert.match(combined, /iOS development responsibility/);
  assert.equal(combined.match(/script-source-inspection/g)?.length, 1);
  assert.match(
    combined,
    /successful compile before creating or updating a Draft/,
  );
  assert.match(combined, /Mark the pull request Ready for review only after/);

  const overridden = compileResponsibilityInstructions(
    {
      general: {
        inherits: null,
        assignment: 'base',
        overrides: [],
        rules: [
          { id: 'packet', instruction: 'Keep the packet.' },
          { id: 'script', instruction: 'Do not inspect scripts.' },
        ],
      },
      'script-maintainer': {
        inherits: 'general',
        assignment: 'maintain scripts',
        overrides: ['script'],
        rules: [{ id: 'script', instruction: 'Inspect the assigned script.' }],
      },
    },
    ['script-maintainer'],
  );
  assert.match(overridden, /Keep the packet/);
  assert.match(overridden, /Inspect the assigned script/);
  assert.doesNotMatch(overridden, /Do not inspect scripts/);

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
  const invalid = decision(req, 'dispatch');
  invalid.responsibilities = ['general', 'mechanical'];
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(invalid), req),
    /General is inherited/,
  );

  const unavailableSkill = decision(req, 'dispatch');
  unavailableSkill.skillPaths = ['/installed/unknown/SKILL.md'];
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(unavailableSkill), req),
    /unavailable Skill/,
  );
});

void test('responsibility definitions are discovered from library JSON files', async (t) => {
  const library = await mkdtemp(path.join(os.tmpdir(), 'responsibilities-'));
  t.after(() => rm(library, { recursive: true, force: true }));
  await writeFile(
    path.join(library, 'general.json'),
    JSON.stringify({
      id: 'general',
      inherits: null,
      assignment: 'General work.',
      overrides: [],
      rules: [{ id: 'base', instruction: 'Follow the packet.' }],
    }),
  );
  await writeFile(
    path.join(library, 'release.json'),
    JSON.stringify({
      id: 'release',
      inherits: { id: 'general', path: './general.json' },
      assignment: 'Release work.',
      overrides: [],
      rules: [{ id: 'release', instruction: 'Publish the release.' }],
    }),
  );
  assert.deepEqual(Object.keys(loadExecutionResponsibilities(library)), [
    'general',
    'release',
  ]);
});

void test('Coordinator changes a Worker assignment only after a responsibility gap', () => {
  const prepare = createCoordinationRequest({
    phase: 'prepare',
    task: task(),
    basis: 'current',
    priorEvidence: [],
    previousContext: '',
    workerReport: null,
    previousDecision: null,
    repairsRemaining: 1,
  });
  const previous = decision(prepare, 'dispatch');
  previous.responsibilities = ['ios-development'];
  previous.skillPaths = ['/installed/ios/setup/SKILL.md'];
  const qualify = createCoordinationRequest({
    phase: 'qualify',
    task: task(),
    basis: 'current',
    priorEvidence: [],
    previousContext: '',
    workerReport: {
      outcome: 'blocked',
      checks: [
        {
          criterionId: 'C1',
          summary: 'Current responsibility cannot run the required tool.',
          status: 'failed',
          evidenceRefs: ['log:worker'],
        },
      ],
      artifactRefs: [],
      summary: 'Worker stopped.',
      remaining: [],
    },
    previousDecision: previous,
    repairsRemaining: 1,
  });
  const changed = decision(qualify, 'extend');
  changed.responsibilities = ['mechanical', 'ios-development'];
  changed.skillPaths = previous.skillPaths;
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(changed), qualify),
    /only after a Worker responsibility gap/,
  );
  qualify.workerReport!.responsibilityGap =
    'The assigned responsibilities do not permit the required script.';
  assert.equal(
    parseCoordinationDecision(JSON.stringify(changed), qualify).decision,
    'extend',
  );
  previous.responsibilities = ['general'];
  changed.responsibilities = ['ios-development'];
  assert.equal(
    parseCoordinationDecision(JSON.stringify(changed), qualify).decision,
    'extend',
  );
  const mislabeledRepair = decision(qualify, 'repair');
  mislabeledRepair.responsibilities = previous.responsibilities;
  mislabeledRepair.skillPaths = previous.skillPaths;
  assert.throws(
    () => parseCoordinationDecision(JSON.stringify(mislabeledRepair), qualify),
    /requires extension, not repair/,
  );
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
    /first form a concise, high-level understanding of the task/,
  );
  assert.match(prompt, /choose at least one responsibility/);
  assert.match(prompt, /Read only each applicable SKILL.md entrypoint/);
  assert.match(prompt, /do not open its references/);
  assert.match(
    prompt,
    /assign mechanical alone even if it generates iOS files/,
  );
  assert.match(
    prompt,
    /unit-test entrypoints used to validate directly authored code remain feedback/,
  );
  assert.match(
    prompt,
    /may be read, diagnosed and fixed without adding mechanical/,
  );
  assert.match(
    prompt,
    /Add ios-development only when the Worker must directly/,
  );
  assert.match(prompt, /Repository delivery.*does not require ios-development/);
  assert.match(prompt, /finish code and compilation, publish a Draft/);
  assert.match(prompt, /mark it Ready only after every required gate passes/);
  assert.match(
    prompt,
    /logRef without opening, copying or summarizing the log/,
  );
  assert.match(prompt, /Never add a Next step/);
  assert.match(prompt, /black-box execution and error boundary/);
  assert.match(prompt, /After dispatch, suspend completely/);
  assert.match(prompt, /Earlier verified conclusion/);
  assert.match(prompt, /acceptance criteria remain unchanged/);
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
    .completion) as import('../lib/modules/implementation/coordination-runner.ts').CoordinatedResult;
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

type Scripted = (
  request: CoordinationRequest,
  turn: number,
) => CoordinationDecision | 'hang';
function requestFrom(prompt: string): CoordinationRequest {
  const marker = 'COORDINATION REQUEST:\n';
  if (prompt.includes(marker)) return JSON.parse(prompt.split(marker)[1]);
  return JSON.parse(prompt.split('\n')[1]);
}
class FakePushDriver implements AgentSessionDriver {
  readonly provider = 'codex' as const;
  readonly capabilities: AgentRuntimeCapabilities = {
    persistentThreads: true,
    pushToolResults: true,
    turnResume: true,
    turnInterrupt: true,
  };
  threads: AgentRuntimeThreadInput[] = [];
  prompts: string[] = [];
  closed = false;
  interrupted = 0;
  private hang?: (error: Error) => void;
  private script: Scripted;
  private hostTools: HostTool[];
  private viaTool: boolean;
  constructor(script: Scripted, hostTools: HostTool[], viaTool = true) {
    this.script = script;
    this.hostTools = hostTools;
    this.viaTool = viaTool;
  }
  async startThread(
    input: AgentRuntimeThreadInput,
  ): Promise<AgentRuntimeThread> {
    this.threads.push(input);
    return {
      provider: 'codex',
      threadId: 'thread-fixture',
      profile: input.profile,
      workingDirectory: input.workingDirectory,
      access: input.access,
    };
  }
  async resumeThread(thread: AgentRuntimeThread) {
    return thread;
  }
  startTurn(
    thread: AgentRuntimeThread,
    input: AgentRuntimeTurnInput,
  ): AgentRuntimeTurn {
    let stopped = false;
    const at = () => new Date().toISOString();
    const completion = (async () => {
      let prompt = input.prompt;
      let physical = 0;
      while (true) {
        const turnId = `turn-${++physical}`;
        this.prompts.push(prompt);
        input.onEvent?.({
          type: 'turn-started',
          threadId: thread.threadId,
          turnId,
          at: at(),
        });
        const scripted = this.script(requestFrom(prompt), this.prompts.length);
        if (scripted === 'hang') {
          await new Promise<never>((_, reject) => {
            this.hang = reject;
          });
          throw new Error('unreachable');
        }
        const decision = scripted;
        if (stopped) throw new Error('Agent turn interrupted.');
        if (
          this.viaTool &&
          (decision.decision === 'dispatch' ||
            decision.decision === 'extend' ||
            decision.decision === 'repair')
        ) {
          const tool = this.hostTools.find(
            (item) => item.name === 'dispatch_worker',
          );
          assert.ok(tool, 'dispatch_worker tool must be registered');
          const outcome = await tool.call({ decision });
          assert.ok(isHostToolSuspension(outcome));
          input.onEvent?.({
            type: 'tool-suspended',
            threadId: thread.threadId,
            turnId,
            tool: 'dispatch_worker',
            at: at(),
          });
          input.onEvent?.({
            type: 'turn-completed',
            threadId: thread.threadId,
            turnId,
            usage,
            at: at(),
          });
          const continuation = await outcome.continuation;
          if (stopped) throw new Error('Agent turn interrupted.');
          input.onEvent?.({
            type: 'tool-resumed',
            threadId: thread.threadId,
            turnId,
            tool: 'dispatch_worker',
            at: at(),
          });
          if ('finalOutput' in continuation)
            return {
              threadId: thread.threadId,
              turnId,
              finalOutput: continuation.finalOutput,
              usage,
            };
          prompt = continuation.prompt;
          continue;
        }
        input.onEvent?.({
          type: 'activity',
          threadId: thread.threadId,
          turnId,
          summary: 'Agent report received.',
          at: at(),
        });
        input.onEvent?.({
          type: 'turn-completed',
          threadId: thread.threadId,
          turnId,
          usage,
          at: at(),
        });
        return {
          threadId: thread.threadId,
          turnId,
          finalOutput: JSON.stringify(decision),
          usage,
        };
      }
    })();
    return {
      completion,
      interrupt: () => {
        stopped = true;
        this.interrupted++;
        this.hang?.(new Error('Agent turn interrupted.'));
      },
    };
  }
  async close() {
    this.closed = true;
  }
}
function pushSetup(
  script: Scripted,
  workers: Array<
    | 'passed'
    | 'failed'
    | 'delivered-failed'
    | 'responsibility-gap'
    | 'invalid'
    | 'hang'
  > = ['passed'],
  options: {
    viaTool?: boolean;
    limits?: typeof coordinationLimits;
    resumeWorkerSessionId?: string;
    packetDir?: string;
    runtimeInstructions?: string;
  } = {},
) {
  const request = task();
  const workerCalls: string[] = [];
  const workerResumes: Array<string | undefined> = [];
  let canceled = 0;
  let index = 0;
  let driver: FakePushDriver | undefined;
  const workerTransport: typeof startLocalAgentRun = (_agent, opts) => {
    workerCalls.push(opts.prompt);
    workerResumes.push(opts.resumeSessionId);
    const kind = workers[index++] ?? 'passed';
    if (kind === 'hang') {
      let reject!: (error: Error) => void;
      const completion = new Promise<LocalAgentResult>((_, fail) => {
        reject = fail;
      });
      return {
        completion,
        cancel: () => {
          canceled++;
          reject(new Error('The Agent Run was canceled.'));
        },
      };
    }
    const value: LocalAgentResult =
      kind === 'invalid'
        ? { agentSessionId: 'w', finalOutput: 'not json', usage }
        : kind === 'responsibility-gap'
          ? result({
              ...JSON.parse(worker(request, 'failed').finalOutput),
              responsibilityGap:
                'The assigned responsibility cannot change iOS product code.',
            })
          : kind === 'delivered-failed'
            ? result({
                ...JSON.parse(worker(request, 'failed').finalOutput),
                outcome: 'delivered',
              })
            : worker(request, kind);
    return { completion: Promise.resolve(value), cancel: () => canceled++ };
  };
  const progress: string[] = [];
  const run = startCoordinatedExecution({
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
    onProgress: (event) => progress.push(`${event.phase}: ${event.summary}`),
    workerTransport,
    limits: options.limits,
    packetDir: options.packetDir,
    runtimeInstructions: options.runtimeInstructions,
    resumeWorkerSessionId: options.resumeWorkerSessionId,
    coordinatorSession: async (input): Promise<CoordinatorSession> => {
      driver = new FakePushDriver(
        script,
        input.hostTools,
        options.viaTool ?? true,
      );
      return { driver, decoratePrompt: (prompt) => `DECORATED ${prompt}` };
    },
  });
  return {
    run,
    request,
    workerCalls,
    workerResumes,
    progress,
    driver: () => driver!,
    canceled: () => canceled,
  };
}
type Coordinated = Awaited<
  ReturnType<typeof startCoordinatedExecution>['completion']
> & {
  coordination: {
    attempts: Array<{
      role: string;
      phase: string;
      sessionId: string | null;
      usage: unknown;
    }>;
    decisions: unknown[];
  };
};

void test('push coordinator dispatches through the Host tool and a complete worker self-check settles without resuming it', async () => {
  const f = pushSetup((req) =>
    decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready'),
  );
  const output = (await f.run.completion) as Coordinated;
  assert.equal(JSON.parse(output.finalOutput).outcome, 'delivered');
  assert.deepEqual(
    output.coordination.attempts.map((a) => `${a.role}:${a.phase}`),
    ['coordinator:prepare', 'worker:execute'],
  );
  assert.equal(output.coordination.attempts[0].sessionId, 'thread-fixture');
  assert.equal(output.coordination.decisions.length, 1);
  assert.equal(output.usage?.inputTokens, 20);
  assert.equal(f.driver().prompts.length, 1);
  assert.match(f.driver().prompts[0], /^DECORATED /);
  assert.equal(f.driver().threads[0].access, 'read-only');
  assert.equal(f.driver().threads[0].hostJobs, false);
  assert.match(f.driver().threads[0].instructions ?? '', /dispatch_worker/);
  assert.equal(f.driver().closed, true);
  assert.match(f.workerCalls[0], /Only repair the requested output/);
});

void test('WORKER_COMPLETED with unresolved checks resumes the same coordinator thread and one repair can finish the Action', async () => {
  const f = pushSetup(
    (req) => decision(req, req.phase === 'prepare' ? 'dispatch' : 'repair'),
    ['delivered-failed', 'passed'],
  );
  const output = (await f.run.completion) as Coordinated;
  assert.equal(JSON.parse(output.finalOutput).outcome, 'delivered');
  assert.deepEqual(
    output.coordination.attempts.map((a) => `${a.role}:${a.phase}`),
    [
      'coordinator:prepare',
      'worker:execute',
      'coordinator:qualify',
      'worker:repair',
    ],
  );
  assert.equal(f.driver().prompts.length, 2);
  assert.ok(f.driver().prompts[1].startsWith('WORKER_COMPLETED'));
  const continuation = requestFrom(f.driver().prompts[1]);
  assert.equal(continuation.phase, 'qualify');
  assert.equal(continuation.repairsRemaining, 1);
  assert.equal(
    output.coordination.attempts
      .filter((a) => a.role === 'coordinator')
      .every((a) => a.sessionId === 'thread-fixture'),
    true,
  );
  assert.equal(output.usage?.inputTokens, 40);
});

void test('WORKER_FAILED resumes the coordinator without a repair option and rejects a repair reply', async () => {
  const timersBefore = process
    .getActiveResourcesInfo()
    .filter((resource) => resource === 'Timeout').length;
  const seen: string[] = [];
  const f = pushSetup(
    (req, turn) => {
      seen.push(req.phase);
      return decision(req, turn === 1 ? 'dispatch' : 'repair');
    },
    ['invalid'],
  );
  await assert.rejects(
    () => f.run.completion,
    (error) =>
      error instanceof CoordinationRunError &&
      /repair budget exhausted/.test(error.message),
  );
  assert.ok(f.driver().prompts[1].startsWith('WORKER_FAILED'));
  const continuation = requestFrom(f.driver().prompts[1]);
  assert.equal(continuation.repairsRemaining, 0);
  assert.match(continuation.workerReport?.summary ?? '', /valid report/);
  assert.equal(f.workerCalls.length, 1);
  assert.equal(f.driver().closed, true);
  assert.equal(
    process
      .getActiveResourcesInfo()
      .filter((resource) => resource === 'Timeout').length,
    timersBefore,
    'a rejected coordination turn must not leave its deadline armed',
  );
});

void test('WORKER_FAILED lets the coordinator return blocked with honest checks', async () => {
  const f = pushSetup(
    (req, turn) => {
      const value = decision(req, turn === 1 ? 'dispatch' : 'blocked');
      if (turn > 1)
        value.checks = [
          {
            criterionId: 'C1',
            summary: 'Not verified',
            status: 'not-run',
            evidenceRefs: ['host:worker-failed'],
          },
        ];
      return value;
    },
    ['invalid'],
  );
  const output = (await f.run.completion) as Coordinated;
  const report = JSON.parse(output.finalOutput);
  assert.equal(report.outcome, 'blocked');
  assert.equal(report.checks[0].status, 'not-run');
  assert.deepEqual(
    output.coordination.attempts.map((a) => `${a.role}:${a.phase}`),
    ['coordinator:prepare', 'worker:execute', 'coordinator:qualify'],
  );
});

void test('a blocked worker report becomes WORKER_ATTENTION_REQUIRED and the coordinator may ask the user', async () => {
  const f = pushSetup(
    (req, turn) => {
      const value = decision(req, turn === 1 ? 'dispatch' : 'needs-user');
      if (turn > 1)
        value.checks = [
          {
            criterionId: 'C1',
            summary: 'Worker blocked',
            status: 'not-run',
            evidenceRefs: ['worker:blocked'],
          },
        ];
      return value;
    },
    ['failed'],
  );
  const output = (await f.run.completion) as Coordinated;
  assert.equal(JSON.parse(output.finalOutput).outcome, 'blocked');
  assert.ok(f.driver().prompts[1].startsWith('WORKER_ATTENTION_REQUIRED'));
  assert.deepEqual(
    requestFrom(f.driver().prompts[1]).workerReport?.checks.map(
      (c) => c.status,
    ),
    ['failed'],
  );
});

void test('a dispatch decision returned as text is still dispatched by the Host and resumed in the same thread', async () => {
  const f = pushSetup(
    (req, turn) => {
      const value = decision(req, turn === 1 ? 'dispatch' : 'needs-user');
      if (turn > 1)
        value.checks = [
          {
            criterionId: 'C1',
            summary: 'Worker blocked',
            status: 'not-run',
            evidenceRefs: ['worker:blocked'],
          },
        ];
      return value;
    },
    ['failed'],
    { viaTool: false },
  );
  const output = (await f.run.completion) as Coordinated;
  assert.equal(JSON.parse(output.finalOutput).outcome, 'blocked');
  assert.equal(f.driver().prompts.length, 2);
  assert.ok(f.driver().prompts[1].startsWith('WORKER_ATTENTION_REQUIRED'));
  assert.deepEqual(
    output.coordination.attempts.map((a) => `${a.role}:${a.phase}`),
    ['coordinator:prepare', 'worker:execute', 'coordinator:qualify'],
  );
});

void test('stop during a suspended coordinator cancels the worker and never resumes the thread', async () => {
  const f = pushSetup((req) => decision(req, 'dispatch'), ['hang']);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(f.workerCalls.length, 1);
  f.run.cancel();
  await assert.rejects(() => f.run.completion, CoordinationRunError);
  assert.equal(f.canceled(), 1);
  assert.equal(f.driver().prompts.length, 1);
  assert.equal(f.driver().closed, true);
});

void test('a coordinator physical turn that never completes is timed out and interrupted', async () => {
  const f = pushSetup(() => 'hang', [], {
    limits: { ...coordinationLimits, coordinatorTimeoutMs: 40 },
  });
  await assert.rejects(
    () => f.run.completion,
    (error) =>
      error instanceof CoordinationRunError && /timed out/.test(error.message),
  );
  assert.equal(f.driver().interrupted, 1);
  assert.equal(f.workerCalls.length, 0);
});

void test('a non-Codex coordinator profile keeps the legacy fresh-session path', async () => {
  const request = task();
  const calls: string[] = [];
  const transport: typeof startLocalAgentRun = (agent, options) => {
    calls.push(`${agent}:${options.access}`);
    const value =
      options.access === 'read-only'
        ? result(
            decision(
              requestFrom(options.prompt),
              requestFrom(options.prompt).phase === 'prepare'
                ? 'dispatch'
                : 'ready',
            ),
          )
        : worker(request);
    return { completion: Promise.resolve(value), cancel: () => {} };
  };
  let sessions = 0;
  const output = (await startCoordinatedExecution({
    request,
    workerOptions: {
      workingDirectory: '/fixture',
      prompt: 'WORKER',
      access: 'workspace-write',
    },
    workerAgent: 'codex',
    settings: { profile: { agent: 'claude', model: 'opus', effort: 'low' } },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: () => {},
    transport,
    coordinatorSession: async (input) => {
      sessions++;
      assert.equal(input.profile.agent, 'claude');
      return null;
    },
  }).completion) as Coordinated;
  assert.equal(sessions, 1);
  assert.deepEqual(calls, ['claude:read-only', 'codex:workspace-write']);
  assert.equal(JSON.parse(output.finalOutput).outcome, 'delivered');
});

void test('rejected dispatch_worker calls count against the coordinator tool cap and the cap interrupts the thread', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'coordinator-cap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
let calls=0;let interrupted=false;
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
function dispatch(){calls++;send({id:1000+calls,method:'item/tool/call',params:{threadId:'thread-cap',turnId:'turn-1',callId:'call-'+calls,tool:'dispatch_worker',arguments:{decision:{}}}});}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-cap'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-1'}}});dispatch();}
else if(typeof message.id==='number'&&message.id>1000){if(message.result?.success!==false)process.exit(3);if(!interrupted&&calls<60)dispatch();}
else if(message.method==='turn/interrupt'){interrupted=true;send({id:message.id,result:{}});process.stderr.write('INTERRUPTED_AFTER_'+calls+'\\n');send({method:'turn/completed',params:{threadId:'thread-cap',turn:{id:'turn-1',status:'interrupted'}}});}
});`,
  );
  const request = task();
  let dispatched = 0;
  const workerTransport: typeof startLocalAgentRun = () => {
    dispatched++;
    return { completion: Promise.resolve(worker(request)), cancel: () => {} };
  };
  const progress: string[] = [];
  const run = startCoordinatedExecution({
    request,
    workerOptions: {
      workingDirectory: root,
      prompt: 'WORKER',
      access: 'workspace-write',
    },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: (event) => progress.push(event.summary),
    workerTransport,
    coordinatorSession: async (input): Promise<CoordinatorSession> => ({
      driver: new CodexAppServerDriver({
        command: process.execPath,
        arguments: [server],
        brokerFactory: (thread) =>
          new HostJobBroker(thread.workingDirectory, path.join(root, 'jobs')),
        hostTools: input.hostTools,
      }),
      decoratePrompt: (prompt) => prompt,
    }),
  });
  await assert.rejects(
    () => run.completion,
    (error) =>
      error instanceof CoordinationRunError &&
      /tool-call budget exhausted/.test(error.message),
  );
  assert.equal(dispatched, 0);
  assert.equal(
    progress.filter((summary) => summary === 'Running tool: dispatch_worker')
      .length,
    coordinationLimits.maxCoordinatorToolCalls + 1,
  );
});

void test('the first worker resumes the previous round and a repair starts fresh', async () => {
  const f = pushSetup(
    (req) => decision(req, req.phase === 'prepare' ? 'dispatch' : 'repair'),
    ['delivered-failed', 'passed'],
    { resumeWorkerSessionId: 'previous-round-session' },
  );
  await f.run.completion;
  assert.deepEqual(f.workerResumes, ['previous-round-session', undefined]);
});

void test('a round without a previous session starts its worker fresh', async () => {
  const f = pushSetup((req) =>
    decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready'),
  );
  await f.run.completion;
  assert.deepEqual(f.workerResumes, [undefined]);
});

void test('a resumed packet Worker receives the current response identity', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'worker-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  const f = pushSetup(
    (req) => decision(req, req.phase === 'prepare' ? 'dispatch' : 'ready'),
    ['passed'],
    {
      packetDir,
      runtimeInstructions: 'Use the prepared worktree.',
      resumeWorkerSessionId: 'previous-round-session',
    },
  );
  await f.run.completion;
  assert.deepEqual(f.workerResumes, ['previous-round-session']);
  assert.match(f.workerCalls[0], /Read .*\/Manifest\.md/);
  assert.doesNotMatch(f.workerCalls[0], /COORDINATOR ASSIGNMENT/);
  assert.ok(f.workerCalls[0].length < 900);
  assert.match(f.workerCalls[0], /supersedes every prior response identity/);
  assert.match(f.workerCalls[0], new RegExp(f.request.requestId));
  assert.match(f.workerCalls[0], new RegExp(f.request.inputFingerprint));
  assert.match(
    await readFile(path.join(packetDir, 'Environment.md'), 'utf8'),
    /Use the prepared worktree/,
  );
  assert.match(
    await readFile(path.join(packetDir, 'Assignment.md'), 'utf8'),
    /Only repair the requested output/,
  );
  assert.match(
    await readFile(path.join(packetDir, 'Assignment.md'), 'utf8'),
    new RegExp(f.request.requestId),
  );
});

void test('a responsibility extension resumes its Worker and preserves fresh repair capacity', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'worker-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetDir = path.join(root, 'packet');
  const f = pushSetup(
    (req) => {
      const output = decision(
        req,
        req.phase === 'prepare'
          ? 'dispatch'
          : req.workerReport?.responsibilityGap
            ? 'extend'
            : 'repair',
      );
      output.responsibilities =
        req.phase === 'prepare' ? ['general'] : ['ios-development'];
      return output;
    },
    ['responsibility-gap', 'delivered-failed', 'passed'],
    { packetDir, runtimeInstructions: 'Use the prepared worktree.' },
  );
  await f.run.completion;
  assert.deepEqual(f.workerResumes, [undefined, 'fixture', undefined]);
  assert.equal(f.workerCalls.length, 3);
  assert.equal(
    f.progress.filter(
      (entry) =>
        entry === 'qualify: Coordinator is preparing or assessing the Action.',
    ).length,
    1,
  );
  assert.equal(
    f.progress.filter(
      (entry) =>
        entry === 'qualify: Worker needs attention; resuming the coordinator.',
    ).length,
    0,
  );
  assert.equal(
    f.progress.filter(
      (entry) =>
        entry ===
        'qualify: Worker completed with unresolved checks; resuming the coordinator.',
    ).length,
    1,
  );
  assert.equal(
    f.progress.filter((entry) => entry.startsWith('extend:')).length,
    0,
  );
  const first = JSON.parse(
    await readFile(
      path.join(packetDir, 'Responsibilities/Responsibility-1.json'),
      'utf8',
    ),
  ) as { id: string };
  const second = JSON.parse(
    await readFile(
      path.join(packetDir, 'Responsibilities/Responsibility-2.json'),
      'utf8',
    ),
  ) as { id: string };
  assert.deepEqual([first.id, second.id], ['general', 'ios-development']);
});

void test('a rejected dispatch followed by an empty final response preserves the original validation error', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'coordinator-cap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
let calls=0;let interrupted=false;
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
function dispatch(){calls++;send({id:1000+calls,method:'item/tool/call',params:{threadId:'thread-cap',turnId:'turn-1',callId:'call-'+calls,tool:'dispatch_worker',arguments:{decision:{}}}});}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-cap'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-1'}}});dispatch();}
else if(typeof message.id==='number'&&message.id>1000){if(message.result?.success!==false)process.exit(3);send({method:'turn/completed',params:{threadId:'thread-cap',turn:{id:'turn-1',status:'completed'}}});}
else if(message.method==='turn/interrupt'){interrupted=true;send({id:message.id,result:{}});process.stderr.write('INTERRUPTED_AFTER_'+calls+'\\n');send({method:'turn/completed',params:{threadId:'thread-cap',turn:{id:'turn-1',status:'interrupted'}}});}
});`,
  );
  const request = task();
  let dispatched = 0;
  const workerTransport: typeof startLocalAgentRun = () => {
    dispatched++;
    return { completion: Promise.resolve(worker(request)), cancel: () => {} };
  };
  const progress: string[] = [];
  const run = startCoordinatedExecution({
    request,
    workerOptions: {
      workingDirectory: root,
      prompt: 'WORKER',
      access: 'workspace-write',
    },
    workerAgent: 'codex',
    settings: { profile },
    priorEvidence: [],
    previousContext: '',
    readBasis: async () => 'basis',
    onProgress: (event) => progress.push(event.summary),
    workerTransport,
    coordinatorSession: async (input): Promise<CoordinatorSession> => ({
      driver: new CodexAppServerDriver({
        command: process.execPath,
        arguments: [server],
        brokerFactory: (thread) =>
          new HostJobBroker(thread.workingDirectory, path.join(root, 'jobs')),
        hostTools: input.hostTools,
      }),
      decoratePrompt: (prompt) => prompt,
    }),
  });
  await assert.rejects(
    () => run.completion,
    (error) =>
      error instanceof CoordinationRunError &&
      /Coordinator response does not match its contract/.test(error.message),
  );
  assert.equal(dispatched, 0);
  assert.equal(
    progress.filter((summary) => summary === 'Running tool: dispatch_worker')
      .length,
    1,
  );
});
