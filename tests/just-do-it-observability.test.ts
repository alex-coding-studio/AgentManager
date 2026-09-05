import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

process.env.PRAXIS_STOP_GRACE_MS = '80';

const { githubReader } = await import('../lib/github-delivery.ts');
const { classifyActionRun, createExecutionService } =
  await import('../lib/modules/implementation/execution-service.ts');
const { createPlanningService } =
  await import('../lib/modules/implementation/planning-service.ts');
const { appendCardWorkRecord } =
  await import('../lib/modules/implementation/worklog.ts');
const { readCardLatestResponse } =
  await import('../lib/modules/implementation/execution-response.ts');
const { parseRunLogText } =
  await import('../lib/execution-observability/run-log-format.ts');
type RegisteredProject = import('../lib/project-registry.ts').RegisteredProject;
type PlanningCard =
  import('../lib/modules/implementation/planning-service.ts').PlanningCard;
type ActionRun =
  import('../lib/modules/implementation/execution-types.ts').ActionRun;
type LocalAgentResult = import('../lib/agents/transport.ts').LocalAgentResult;
type LaunchOptions = Parameters<
  typeof import('../lib/agents/transport.ts').startLocalAgentRun
>[1];
type CardHarnessRequest =
  import('../lib/modules/implementation/harness.ts').CardHarnessRequest;

const exec = promisify(execFile);
const git = (cwd: string, ...args: string[]) =>
  exec('git', args, { cwd }).then((result) => result.stdout.trim());

function seedCard(title: string): PlanningCard {
  const action = {
    id: randomUUID(),
    title: `${title} step`,
    input: 'Workspace',
    output: 'Working file',
    validation: 'Check file',
    acceptanceCriteria: [
      {
        id: 'AC-01',
        criterion: 'Working output',
        passCondition: 'The expected output is readable',
        evidence: 'Output reference',
      },
    ],
  };
  return {
    schemaVersion: 1,
    id: randomUUID(),
    revision: 1,
    source: {
      module: 'whats-next',
      id: `NODE-${title}`,
      uid: randomUUID(),
      title,
      summary: 'Observability fixture',
      dependsOn: [],
      derivedFrom: [],
      outputPaths: [],
    },
    sourceRef: 'source.md',
    requirements: '',
    resources: [],
    plan: { status: 'finalized', overview: 'One step', steps: [action] },
    actions: [action],
    run: null,
    createdAt: '',
    updatedAt: '',
    finalizedAt: new Date().toISOString(),
  };
}

function delivered(
  request: CardHarnessRequest,
  checks: Array<'passed' | 'failed' | 'not-run'> = ['passed'],
): LocalAgentResult {
  return {
    agentSessionId: 'fixture',
    usage: null,
    finalOutput: JSON.stringify({
      harnessRevision: request.harnessRevision,
      requestId: request.requestId,
      cardId: request.context.cardId,
      contextRevision: request.context.contextRevision,
      inputFingerprint: request.inputFingerprint,
      handoffSummary: 'Fixture file written',
      stage: 'execution',
      actionId: request.actionId,
      outcome: checks.includes('failed') ? 'blocked' : 'delivered',
      summary: 'File written in Card worktree',
      artifactRefs: ['file:app.txt'],
      checks: checks.map((status, index) => ({
        criterionId: 'AC-01',
        summary: `Check ${index + 1}`,
        status,
        evidenceRefs: ['file:app.txt'],
      })),
      remaining: [],
    }),
  };
}

async function fixture(
  t: test.TestContext,
  mode: 'settle' | 'hang' = 'settle',
) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jdi-observability-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const rootPath = path.join(base, 'project');
  await mkdir(rootPath, { recursive: true });
  const project: RegisteredProject = {
    id: randomUUID(),
    kind: 'standalone',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    name: 'Observability fixture',
    description: '',
    createdAt: '',
  };
  await mkdir(project.planningPath, { recursive: true });
  await git(rootPath, 'init', '-b', 'main');
  await git(rootPath, 'config', 'user.name', 'Fixture');
  await git(rootPath, 'config', 'user.email', 'fixture@example.invalid');
  await writeFile(path.join(rootPath, 'app.txt'), 'initial\n');
  await writeFile(path.join(rootPath, '.gitignore'), '.praxis/\n');
  await git(rootPath, 'add', '.');
  await git(rootPath, 'commit', '-m', 'initial');
  const cards = [seedCard('Alpha'), seedCard('Beta')];
  for (const card of cards)
    await appendCardWorkRecord(
      path.join(project.planningPath, 'implementation/cards'),
      card.id,
      0,
      {
        kind: 'system-event',
        stage: 'planning',
        actionId: null,
        event: 'plan-finalized',
        text: 'Fixture confirmation',
        refs: [],
      },
      { 'planning-state.json': JSON.stringify(card) },
    );
  const calls: Array<{
    options: LaunchOptions;
    request: CardHarnessRequest;
    resolve: (result: LocalAgentResult) => void;
    reject: (error: Error) => void;
    canceled: boolean;
  }> = [];
  const transport = (
    _agent: 'codex' | 'claude' | 'deepseek',
    options: LaunchOptions,
  ) => {
    const request = JSON.parse(
      options.prompt
        .split('\nREQUEST DATA')[1]!
        .split(':\n')[1]!
        .split('\n\nExecution runtime:')[0]!,
    ) as CardHarnessRequest;
    let resolve!: (result: LocalAgentResult) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<LocalAgentResult>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const call = { options, request, resolve, reject, canceled: false };
    calls.push(call);
    return {
      completion,
      cancel: () => {
        call.canceled = true;
        if (mode === 'settle') reject(new Error('Fixture canceled'));
      },
    };
  };
  const store = createPlanningService(undefined, new Map());
  const service = createExecutionService(
    store,
    transport,
    new Map(),
    1800000,
    githubReader,
    undefined,
    undefined,
    (input) => input.transport!(input.workerAgent, input.workerOptions),
  );
  const input = (card: PlanningCard) => ({
    cardId: card.id,
    actionId: card.actions[0]!.id,
    expectedRevision: 1,
    instruction: '',
    profile: {
      agent: 'codex' as const,
      model: 'fixture',
      effort: 'low' as const,
    },
  });
  async function settled(card: PlanningCard) {
    for (let i = 0; i < 300; i++) {
      const current = await store.read(project, card.id);
      if (current.execution?.runs.at(-1)?.status !== 'running') return current;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Fixture did not settle');
  }
  const runLog = async (card: PlanningCard, run: ActionRun) =>
    parseRunLogText(
      await readFile(path.join(project.planningPath, run.logRef!), 'utf8'),
    );
  const responseFile = (card: PlanningCard) =>
    path.join(
      project.planningPath,
      'implementation/cards',
      card.id,
      'latest-response.json',
    );
  return {
    project,
    cards,
    calls,
    store,
    service,
    input,
    settled,
    runLog,
    responseFile,
  };
}

void test('two independent Cards run concurrently, each with its own Run Log and Latest Response', async (t) => {
  const {
    project,
    cards,
    calls,
    store,
    service,
    input,
    settled,
    runLog,
    responseFile,
  } = await fixture(t);
  const [alpha, beta] = cards as [PlanningCard, PlanningCard];
  const startedAlpha = await service.start(project, input(alpha));
  const startedBeta = await service.start(project, input(beta));
  assert.equal(startedAlpha.execution?.runs[0]?.status, 'running');
  assert.equal(startedBeta.execution?.runs[0]?.status, 'running');
  assert.equal(calls.length, 2);
  const alphaDoc = JSON.parse(await readFile(responseFile(alpha), 'utf8'));
  const betaDoc = JSON.parse(await readFile(responseFile(beta), 'utf8'));
  assert.equal(alphaDoc.status, 'running');
  assert.equal(betaDoc.status, 'running');
  assert.notEqual(alphaDoc.runId, betaDoc.runId);
  assert.match(alphaDoc.subject.label, /^Action 1\/1 · Alpha step$/);
  await assert.rejects(
    service.start(project, {
      ...input(alpha),
      expectedRevision: startedAlpha.revision,
    }),
    /This Card already has a running Action\./,
  );
  calls[0]!.resolve(delivered(calls[0]!.request));
  const alphaDone = await settled(alpha);
  assert.equal(alphaDone.execution?.runs[0]?.status, 'succeeded');
  assert.equal(alphaDone.execution?.runs[0]?.response?.status, 'completed');
  assert.equal(
    (await store.read(project, beta.id)).execution?.runs[0]?.status,
    'running',
  );
  const events = (await runLog(alpha, alphaDone.execution!.runs[0]!)).map(
    (entry) => `${entry.actor} ${entry.event}`,
  );
  assert.equal(events[0], 'HOST run.started');
  assert.equal(events.at(-1), 'HOST run.completed');
  assert.equal(
    JSON.parse(await readFile(responseFile(alpha), 'utf8')).status,
    'completed',
  );
  calls[1]!.resolve(delivered(calls[1]!.request, ['passed', 'not-run']));
  const betaDone = await settled(beta);
  assert.equal(betaDone.execution?.runs[0]?.response?.status, 'warning');
  assert.equal(
    betaDone.execution?.runs[0]?.response?.title,
    'Required checks incomplete',
  );
});

void test('cancel passes through Stopping, confirms termination and publishes Canceled with retained effects', async (t) => {
  const { project, cards, calls, service, input, runLog, responseFile } =
    await fixture(t);
  const alpha = cards[0]!;
  const started = await service.start(project, input(alpha));
  await writeFile(path.join(project.rootPath, 'partial.txt'), 'partial');
  const run = started.execution!.runs[0]!;
  const canceled = await service.update(
    project,
    alpha.id,
    started.revision,
    'cancel',
    run.id,
  );
  const final = canceled.execution!.runs[0]!;
  assert.equal(final.status, 'canceled');
  assert.equal(final.stopResult, 'confirmed');
  assert.equal(final.response?.status, 'warning');
  assert.equal(final.response?.title, 'Canceled');
  assert.match(
    final.response?.detail ?? '',
    /You canceled this Run during Coordinator preparation/,
  );
  assert.equal(calls[0]!.canceled, true);
  const events = (await runLog(alpha, final)).map((entry) => entry.event);
  for (const expected of [
    'cancel.requested',
    'phase.stopping',
    'cancel.confirmed',
    'run.warning',
  ])
    assert.ok(events.includes(expected), expected);
  const doc = JSON.parse(await readFile(responseFile(alpha), 'utf8'));
  assert.equal(doc.status, 'warning');
  assert.equal(doc.title, 'Canceled');
  assert.equal(doc.retained.checkpoint, final.commit);
});

void test('unconfirmed termination becomes Fail and blocks the Card until the process exits', async (t) => {
  const { project, cards, calls, service, input, responseFile } = await fixture(
    t,
    'hang',
  );
  const alpha = cards[0]!;
  const started = await service.start(project, input(alpha));
  const run = started.execution!.runs[0]!;
  const stopped = await service.update(
    project,
    alpha.id,
    started.revision,
    'cancel',
    run.id,
  );
  const final = stopped.execution!.runs[0]!;
  assert.equal(final.status, 'failed');
  assert.equal(final.stopResult, 'unconfirmed');
  assert.equal(final.response?.title, 'Execution could not be stopped');
  assert.equal(
    JSON.parse(await readFile(responseFile(alpha), 'utf8')).status,
    'fail',
  );
  await assert.rejects(
    service.start(project, {
      ...input(alpha),
      expectedRevision: stopped.revision,
    }),
    /could not be stopped|already has a running Action/,
  );
  calls[0]!.reject(new Error('exited late'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  const next = await service.start(project, {
    ...input(alpha),
    expectedRevision: stopped.revision,
  });
  assert.equal(next.execution?.runs.at(-1)?.status, 'running');
  calls[1]!.reject(new Error('cleanup'));
});

void test('Host Job events are logged with the JOB actor and linked from the Run', async (t) => {
  const { project, cards, calls, service, input, settled, runLog } =
    await fixture(t);
  const alpha = cards[0]!;
  await service.start(project, input(alpha));
  const options = calls[0]!.options;
  const jobId = randomUUID();
  const logRef = path.join(
    project.planningPath,
    'runtime/jobs',
    jobId,
    'output.log',
  );
  options.onActivity?.({
    kind: 'tool',
    phase: 'started',
    summary: 'Running job: LocusKit unit tests',
    job: {
      jobId,
      label: 'LocusKit unit tests',
      command: 'swift test',
      status: 'running',
      exitCode: null,
      logRef,
    },
  });
  options.onActivity?.({
    kind: 'tool',
    phase: 'completed',
    summary: 'Finished: swift test (exit 1)',
    job: {
      jobId,
      label: 'LocusKit unit tests',
      command: 'swift test',
      status: 'failed',
      exitCode: 1,
      logRef,
    },
  });
  calls[0]!.resolve(delivered(calls[0]!.request, ['failed']));
  const done = await settled(alpha);
  const run = done.execution!.runs[0]!;
  assert.deepEqual(run.jobs, [
    {
      jobId,
      label: 'LocusKit unit tests',
      ref: `runtime/jobs/${jobId}/output.log`,
    },
  ]);
  assert.equal(run.response?.status, 'fail');
  const entries = await runLog(alpha, run);
  const started = entries.find((entry) => entry.event === 'job.started');
  const finished = entries.find((entry) => entry.event === 'job.finished');
  assert.equal(started?.actor, 'JOB');
  assert.equal(started?.phase, 'VERIFY');
  assert.equal(finished?.level, 'ERROR');
  assert.match(
    finished?.message ?? '',
    new RegExp(`exited 1; job log ${jobId}`),
  );
  assert.ok(entries.some((entry) => entry.event === 'phase.verifying'));
});

void test('a user override that satisfies the checklist restores Pass and republishes the response', async (t) => {
  const {
    project,
    cards,
    calls,
    service,
    input,
    settled,
    runLog,
    responseFile,
  } = await fixture(t);
  const alpha = cards[0]!;
  await service.start(project, input(alpha));
  calls[0]!.resolve(delivered(calls[0]!.request, ['failed']));
  const blocked = await settled(alpha);
  const run = blocked.execution!.runs[0]!;
  assert.equal(run.response?.status, 'fail');
  assert.ok(!run.response?.recovery.includes('pass'));
  const overridden = await service.overrideRequiredCheck(
    project,
    alpha.id,
    blocked.revision,
    'AC-01',
    'Verified manually on the device.',
  );
  const after = overridden.execution!.runs[0]!;
  assert.equal(after.result?.checks[0]?.status, 'failed');
  assert.equal(after.response?.status, 'completed');
  assert.ok(after.response?.recovery.includes('pass'));
  assert.match(
    after.response?.supplementaryWarnings.join('\n') ?? '',
    /Accepted by user override: Check 1 \(failed\)/,
  );
  const doc = JSON.parse(await readFile(responseFile(alpha), 'utf8'));
  assert.equal(doc.status, 'completed');
  assert.ok(doc.recovery.includes('pass'));
  const events = (await runLog(alpha, after)).map((entry) => entry.event);
  assert.equal(events.at(-1), 'recovery.override');
});

void test('Coordinator title and detail shape a Warning without choosing its color', () => {
  const run = {
    id: 'run',
    actionId: 'action',
    status: 'succeeded',
    startedAt: '',
    endedAt: '',
    hostPid: 1,
    agentSessionId: null,
    usage: null,
    input: '',
    profile: { agent: 'codex', model: '', effort: '' },
    error: null,
    observedRefs: [],
    outputRef: null,
    result: {
      stage: 'execution',
      actionId: 'action',
      outcome: 'blocked',
      summary: 'Blocked on a decision.',
      artifactRefs: [],
      checks: [{ summary: 'Build', status: 'not-run', evidenceRefs: [] }],
      remaining: [],
      handoffSummary: '',
      harnessRevision: 1,
      requestId: 'run',
      cardId: 'card',
      contextRevision: 1,
      inputFingerprint: '',
    },
    coordination: {
      profile: { agent: 'codex', model: '', effort: '' },
      attempts: [],
      contextSummary: '',
      decisions: [
        {
          decision: 'needs-user',
          title: 'Deployment target needs confirmation',
          detail:
            'project.yml declares iOS 26.0 while the supplied configuration declares iOS 26.1. Choose which one is authoritative.',
        },
      ],
    },
  } as unknown as ActionRun;
  const classification = classifyActionRun(run);
  assert.equal(classification.status, 'warning');
  assert.equal(classification.title, 'Deployment target needs confirmation');
  assert.match(classification.detail, /Choose which one is authoritative/);
  assert.deepEqual(classification.recovery, ['log', 'answer']);
  const fallback = classifyActionRun({
    ...run,
    coordination: {
      ...run.coordination!,
      decisions: [{ decision: 'blocked' }],
    },
  } as unknown as ActionRun);
  assert.equal(fallback.status, 'warning');
  assert.equal(fallback.title, 'Blocked');
});

void test('Undo writes a Host operation log and records it on the Card', async (t) => {
  const { project, cards, calls, service, input, settled } = await fixture(t);
  const alpha = cards[0]!;
  await service.start(project, input(alpha));
  calls[0]!.resolve(delivered(calls[0]!.request));
  const done = await settled(alpha);
  const undone = await service.undoAction(
    project,
    alpha.id,
    alpha.actions[0]!.id,
    done.revision,
  );
  const operation = undone.execution?.lastOperation;
  assert.equal(operation?.kind, 'undo-action');
  assert.equal(operation?.status, 'completed');
  assert.match(
    operation?.logUrlPath ?? '',
    new RegExp(`^/projects/${project.id}/logs/host/OP-`),
  );
  const logFile = path.join(
    project.planningPath,
    'host/operations',
    `${operation!.id}.log`,
  );
  assert.ok((await stat(logFile)).isFile());
  const events = parseRunLogText(await readFile(logFile, 'utf8')).map(
    (entry) => entry.event,
  );
  assert.deepEqual(events, [
    'operation.started',
    'operation.card',
    'operation.completed',
  ]);
  const response = await readCardLatestResponse(project, undone);
  assert.equal(response, null);
});
