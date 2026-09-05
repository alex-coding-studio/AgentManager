import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.PRAXIS_STOP_GRACE_MS = '60';

const { createStartNode } = await import('../lib/graph/task/model.ts');
const { cancelWhatsNextRun, readWhatsNextRun, startWhatsNextRun } =
  await import('../lib/modules/product-discovery/runs.ts');
const { readModuleLatestResponse } =
  await import('../lib/latest-response-service.ts');
const { moduleOwner } =
  await import('../lib/execution-observability/module-run.ts');
const { publishLatestResponse, readLatestResponse } =
  await import('../lib/execution-observability/latest-response-store.ts');
const { createRunLog } =
  await import('../lib/execution-observability/run-log.ts');
const { parseRunLogText } =
  await import('../lib/execution-observability/run-log-format.ts');
type LaunchOptions = Parameters<
  typeof import('../lib/agents/transport.ts').startLocalAgentRun
>[1];

async function fixture(t: test.TestContext) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'module-lifecycle-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const project = {
    id: 'lifecycle-project',
    name: 'Lifecycle fixture',
    kind: 'standalone' as const,
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, '.praxis'),
    description: '',
    createdAt: new Date().toISOString(),
  };
  await mkdir(project.planningPath);
  const created = await createStartNode(
    project,
    {
      title: 'Build my local website',
      idea: 'Build it',
      contextRefs: [],
      files: [],
    },
    'whats-next',
  );
  const source = created.node;
  const discovery = () => ({
    sourceNodeIds: [source.id],
    agent: 'codex' as const,
    instruction: 'Explore useful directions',
    contextRefs: [],
    files: [],
    intention: 'mvp-exploration' as const,
  });
  const productDesign = () => ({
    ...discovery(),
    intention: 'product-design-completion' as const,
  });
  return { project, source, discovery, productDesign };
}

function fakeLaunch(mode: 'reject' | 'hang' | 'late' = 'reject') {
  const calls: Array<{
    options: LaunchOptions;
    logExistedAtLaunch: boolean;
    runningDocAtLaunch: boolean;
    canceled: boolean;
    resolve: (finalOutput: string) => void;
  }> = [];
  const launch = (
    _agent: 'codex' | 'claude' | 'deepseek',
    options: LaunchOptions,
  ) => {
    let resolve!: (value: {
      agentSessionId: string | null;
      finalOutput: string;
      usage: null;
    }) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<{
      agentSessionId: string | null;
      finalOutput: string;
      usage: null;
    }>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const runLog = path.join(options.workingDirectory, 'run.log');
    const docPath = path.join(
      options.workingDirectory,
      '..',
      '..',
      'latest-response.json',
    );
    const call = {
      options,
      logExistedAtLaunch: existsSync(runLog),
      runningDocAtLaunch: existsSync(docPath),
      canceled: false,
      resolve: (finalOutput: string) =>
        resolve({ agentSessionId: null, finalOutput, usage: null }),
    };
    calls.push(call);
    return {
      completion,
      cancel: () => {
        call.canceled = true;
        if (mode === 'reject') reject(new Error('canceled'));
        if (mode === 'late')
          resolve({
            agentSessionId: null,
            finalOutput: JSON.stringify({ outcome: 'proposal' }),
            usage: null,
          });
      },
    };
  };
  return { calls, launch };
}

void test('Discovery and Product Design share one Active Run lock and one response', async (t) => {
  const { project, discovery, productDesign } = await fixture(t);
  const owner = moduleOwner(project, 'whats-next');
  const first = fakeLaunch();
  const run = await startWhatsNextRun(project, discovery(), first.launch);
  assert.equal(first.calls.length, 1);
  assert.equal(first.calls[0]!.logExistedAtLaunch, true);
  assert.equal(first.calls[0]!.runningDocAtLaunch, true);
  const running = await readLatestResponse(owner);
  assert.equal(running?.runId, run.runId);
  assert.equal(running?.status, 'running');
  assert.equal(running?.layer, 'discovery');
  assert.equal(running?.subject.label, 'Product Discovery');
  const second = fakeLaunch();
  await assert.rejects(
    startWhatsNextRun(project, productDesign(), second.launch),
    (error: unknown) => {
      assert.match(String((error as Error).message), /already active/);
      assert.equal((error as { status?: number }).status, 409);
      return true;
    },
  );
  assert.equal(second.calls.length, 0);
  assert.equal((await readLatestResponse(owner))?.runId, run.runId);
  await cancelWhatsNextRun(project, run.runId);
  const design = await startWhatsNextRun(
    project,
    productDesign(),
    second.launch,
  );
  assert.equal(second.calls.length, 1);
  const designDoc = await readLatestResponse(owner);
  assert.equal(designDoc?.runId, design.runId);
  assert.equal(designDoc?.layer, 'product-design');
  await assert.rejects(
    startWhatsNextRun(project, discovery(), fakeLaunch().launch),
    /already active/,
  );
  await cancelWhatsNextRun(project, design.runId);
});

void test('cancel passes through Stopping, confirms termination and rejects late output', async (t) => {
  const { project, discovery } = await fixture(t);
  const owner = moduleOwner(project, 'whats-next');
  const fake = fakeLaunch('late');
  const run = await startWhatsNextRun(project, discovery(), fake.launch);
  const canceled = await cancelWhatsNextRun(project, run.runId);
  assert.equal(canceled.status, 'canceled');
  assert.equal(fake.calls[0]!.canceled, true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const stored = await readWhatsNextRun(project, run.runId);
  assert.equal(stored.status, 'canceled');
  assert.equal(stored.response?.status, 'warning');
  assert.equal(stored.response?.title, 'Canceled');
  assert.match(stored.response?.detail ?? '', /during Agent execution/);
  assert.match(stored.response?.detail ?? '', /The graph was not changed\./);
  const doc = await readLatestResponse(owner);
  assert.equal(doc?.status, 'warning');
  assert.equal(doc?.title, 'Canceled');
  const events = parseRunLogText(
    await readFile(path.join(project.planningPath, doc!.logRef), 'utf8'),
  ).map((entry) => entry.event);
  assert.deepEqual(
    events.filter(
      (event) => event.startsWith('cancel.') || event.startsWith('run.'),
    ),
    ['run.started', 'cancel.requested', 'cancel.confirmed', 'run.warning'],
  );
  assert.ok(events.includes('phase.stopping'));
});

void test('unconfirmed termination becomes Fail and blocks a new Run until the process exits', async (t) => {
  const { project, discovery } = await fixture(t);
  const owner = moduleOwner(project, 'whats-next');
  const fake = fakeLaunch('hang');
  const run = await startWhatsNextRun(project, discovery(), fake.launch);
  const stopped = await cancelWhatsNextRun(project, run.runId);
  assert.equal(stopped.status, 'failed');
  assert.equal(stopped.response?.title, 'Execution could not be stopped');
  const doc = await readLatestResponse(owner);
  assert.equal(doc?.status, 'fail');
  await assert.rejects(
    startWhatsNextRun(project, discovery(), fakeLaunch().launch),
    /could not be stopped/,
  );
  fake.calls[0]!.resolve('{}');
  await new Promise((resolve) => setTimeout(resolve, 30));
  const next = await startWhatsNextRun(
    project,
    discovery(),
    fakeLaunch().launch,
  );
  assert.equal((await readLatestResponse(owner))?.runId, next.runId);
  await cancelWhatsNextRun(project, next.runId);
});

void test('a Running response whose host process is gone becomes Fail with a recovery event', async (t) => {
  const { project } = await fixture(t);
  const owner = moduleOwner(project, 'whats-next');
  const runId = 'RUN-33333333-3333-4333-8333-333333333333';
  const logFile = path.join(
    project.planningPath,
    'whats-next/runs',
    runId,
    'run.log',
  );
  const log = await createRunLog(logFile, {
    level: 'INFO',
    actor: 'HOST',
    phase: 'RUN',
    event: 'run.started',
    message: 'started elsewhere',
  });
  await log.close();
  await publishLatestResponse(owner, {
    schemaVersion: 1,
    owner: { kind: 'module', module: 'whats-next' },
    projectId: project.id,
    runId,
    revision: 0,
    status: 'running',
    phase: 'executing',
    actor: 'AGENT',
    title: 'Running',
    detail: 'Exploring',
    subject: { kind: 'layer', label: 'Product Discovery' },
    supplementaryWarnings: [],
    recovery: ['log'],
    startedAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
    endedAt: null,
    logRef: `whats-next/runs/${runId}/run.log`,
    logUrlPath: `/projects/${project.id}/logs/whats-next/${runId}`,
    hostPid: 2_147_483_000,
    recentActivity: [],
  });
  const recovered = await readModuleLatestResponse(project, 'whats-next');
  assert.equal(recovered?.status, 'fail');
  assert.equal(recovered?.title, 'Execution ownership lost');
  assert.equal((await readLatestResponse(owner))?.status, 'fail');
  const events = parseRunLogText(await readFile(logFile, 'utf8'));
  assert.equal(events.at(-1)?.event, 'recovery.ownership-lost');
  assert.equal(events.at(-1)?.phase, 'RECOVERY');
});

void test('without a stored document the newest terminal Run derives the initial response', async (t) => {
  const { project } = await fixture(t);
  assert.equal(await readModuleLatestResponse(project, 'whats-next'), null);
  const runId = 'RUN-44444444-4444-4444-8444-444444444444';
  const directory = path.join(project.planningPath, 'whats-next/runs', runId);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      sessionId: 'SESSION-1',
      requestId: 'REQUEST-1',
      agentSessionId: null,
      sourceNodeIds: [],
      operation: 'explore',
      intention: 'mvp-exploration',
      motion: 'unspecified',
      status: 'canceled',
      transport: 'codex',
      harness: { id: 'praxis.whats-next', revision: 8 },
      inputFingerprint: 'sha256:x',
      startedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:01:00.000Z',
      endedAt: '2026-09-01T00:01:00.000Z',
      usage: null,
      activity: [],
      result: null,
      error: null,
    }),
  );
  const derived = await readModuleLatestResponse(project, 'whats-next');
  assert.equal(derived?.runId, runId);
  assert.equal(derived?.status, 'warning');
  assert.equal(derived?.title, 'Canceled');
  assert.match(derived?.detail ?? '', /graph was not changed/);
  assert.equal(derived?.reconstructed, true);
  assert.equal(
    existsSync(
      path.join(project.planningPath, 'whats-next/latest-response.json'),
    ),
    false,
  );
});
