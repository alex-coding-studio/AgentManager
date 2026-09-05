import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const REGISTRY_HOME = mkdtempSync(path.join(os.tmpdir(), 'log-viewer-home-'));
process.env.PRAXIS_HOME = REGISTRY_HOME;

const registry = await import('../lib/project-registry.ts');
const { GET } =
  await import('../app/api/projects/[projectId]/logs/[...segments]/route.ts');
const { createRunLog } =
  await import('../lib/execution-observability/run-log.ts');
const { runHostOperation } =
  await import('../lib/execution-observability/host-operations.ts');
const { publishLatestResponse } =
  await import('../lib/execution-observability/latest-response-store.ts');
const { cardRunClassification, resolveLogTarget } =
  await import('../lib/execution-observability/log-targets.ts');

const CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const JOB_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RUN_ID = 'RUN-11111111-1111-4111-8111-111111111111';
const LEGACY_RUN_ID = 'RUN-22222222-2222-4222-8222-222222222222';

test.after(() => rm(REGISTRY_HOME, { recursive: true, force: true }));

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'log-viewer-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'Log viewer probe',
    description: '',
    rootPath: root,
  });
  const get = async (segments: string[], query = '') => {
    const response = await GET(
      new Request(
        `http://localhost:3000/api/projects/${project.id}/logs/${segments.join('/')}${query}`,
      ),
      { params: Promise.resolve({ projectId: project.id, segments }) },
    );
    return {
      status: response.status,
      json: response.headers.get('content-type')?.includes('json')
        ? await response.json()
        : null,
      text: response.headers.get('content-type')?.includes('json')
        ? ''
        : await response.text(),
    };
  };
  return { project, get };
}

async function writeModuleRun(
  planningPath: string,
  runId: string,
  record: Record<string, unknown>,
  log?: string,
) {
  const directory = path.join(planningPath, 'whats-next/runs', runId);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      status: 'proposal',
      startedAt: '2026-09-01T00:00:00.000Z',
      endedAt: '2026-09-01T00:01:00.000Z',
      activity: [],
      error: null,
      profile: { agent: 'codex', model: 'gpt-5', effort: 'high' },
      ...record,
    }),
  );
  if (log) await writeFile(path.join(directory, 'run.log'), log);
  return directory;
}

void test('module Run Logs are served with metadata and incremental offsets', async (t) => {
  const { project, get } = await fixture(t);
  const directory = await writeModuleRun(project.planningPath, RUN_ID, {
    status: 'running',
    endedAt: null,
  });
  const log = await createRunLog(path.join(directory, 'run.log'), {
    level: 'INFO',
    actor: 'HOST',
    phase: 'RUN',
    event: 'run.started',
    message: 'started',
  });
  await publishLatestResponse(
    {
      kind: 'module',
      projectId: project.id,
      planningPath: project.planningPath,
      module: 'whats-next',
    },
    {
      schemaVersion: 1,
      owner: { kind: 'module', module: 'whats-next' },
      projectId: project.id,
      runId: RUN_ID,
      revision: 0,
      status: 'running',
      phase: 'executing',
      actor: 'AGENT',
      title: 'Running',
      detail: 'Reading the Product Source',
      subject: { kind: 'layer', label: 'Product Discovery' },
      supplementaryWarnings: [],
      recovery: ['log'],
      startedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      endedAt: null,
      logRef: `whats-next/runs/${RUN_ID}/run.log`,
      logUrlPath: `/projects/${project.id}/logs/whats-next/${RUN_ID}`,
      hostPid: process.pid,
      recentActivity: [],
    },
  );
  const first = await get(['whats-next', RUN_ID]);
  assert.equal(first.status, 200);
  assert.equal(first.json.meta.kind, 'module');
  assert.equal(first.json.meta.ownerLabel, 'Product Exploration and Design');
  assert.equal(first.json.meta.subject, 'Product Discovery');
  assert.equal(first.json.meta.status, 'running');
  assert.equal(first.json.meta.detail, 'Reading the Product Source');
  assert.equal(first.json.meta.agentProfile.agent, 'codex');
  assert.equal(first.json.legacy, false);
  assert.equal(first.json.live, false);
  assert.match(first.json.text, /run\.started — started\n$/);
  log.append({
    level: 'INFO',
    actor: 'AGENT',
    phase: 'EXECUTE',
    event: 'agent.message',
    message: 'second line',
  });
  await log.close();
  const second = await get(
    ['whats-next', RUN_ID],
    `?offset=${first.json.next}`,
  );
  assert.equal(second.json.offset, first.json.next);
  assert.doesNotMatch(second.json.text, /run\.started/);
  assert.match(second.json.text, /agent\.message — second line\n$/);
  const raw = await get(['whats-next', RUN_ID], '?raw=1');
  assert.equal(raw.status, 200);
  assert.match(raw.text, /^000001 .* HOST RUN run\.started — started\n000002 /);
});

void test('legacy Runs without a Run Log are adapted on read and never live', async (t) => {
  const { project, get } = await fixture(t);
  await writeModuleRun(project.planningPath, LEGACY_RUN_ID, {
    status: 'clarification',
    activity: [
      { at: '2026-09-01T00:00:10.000Z', summary: 'Reading the Product Source' },
      { at: '2026-09-01T00:00:20.000Z', summary: 'Running: rg TODO' },
    ],
  });
  const response = await get(['whats-next', LEGACY_RUN_ID]);
  assert.equal(response.status, 200);
  assert.equal(response.json.legacy, true);
  assert.equal(response.json.live, false);
  assert.equal(response.json.meta.status, 'warning');
  const lines = (response.json.text as string).trimEnd().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0]!, /HOST RUN run\.started/);
  assert.match(
    lines[1]!,
    /AGENT EXECUTE agent\.message — Reading the Product Source/,
  );
  assert.match(lines[3]!, /HOST RUN run\.warning/);
  const tail = await get(
    ['whats-next', LEGACY_RUN_ID],
    `?offset=${response.json.next}`,
  );
  assert.equal(tail.json.text, '');
});

void test('Card Runs resolve through the Card record, legacy activity.json and job links', async (t) => {
  const { project, get } = await fixture(t);
  const { appendCardWorkRecord } =
    await import('../lib/modules/implementation/worklog.ts');
  const cardsRoot = path.join(project.planningPath, 'implementation/cards');
  await mkdir(cardsRoot, { recursive: true });
  const revisionRef = `implementation/cards/${CARD_ID}/00000001`;
  const actions = [
    {
      id: ACTION_ID,
      title: 'Add the token store',
      input: 'Current project',
      output: 'A working file',
      validation: 'Read its contents',
    },
  ];
  const card = {
    schemaVersion: 1,
    id: CARD_ID,
    revision: 1,
    source: {
      module: 'whats-next',
      id: 'NODE-aaaaaaaa',
      uid: CARD_ID,
      title: 'Log fixture',
      summary: 'Write a tiny module',
      dependsOn: [],
      derivedFrom: [],
      outputPaths: [],
    },
    sourceRef: `${revisionRef}/source.md`,
    planRef: `${revisionRef}/plan.md`,
    requirements: 'Use local files only.',
    resources: [],
    plan: { status: 'finalized', overview: 'One step', steps: actions },
    actions,
    run: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    finalizedAt: '2026-09-01T00:00:00.000Z',
    execution: {
      runs: [
        {
          id: RUN_UUID,
          actionId: ACTION_ID,
          status: 'failed',
          input: 'do it',
          profile: { agent: 'claude', model: 'sonnet', effort: '' },
          startedAt: '2026-09-01T00:00:00.000Z',
          endedAt: '2026-09-01T00:05:00.000Z',
          hostPid: process.pid,
          agentSessionId: null,
          usage: null,
          result: null,
          error: 'Worker did not return a valid report.',
          observedRefs: [],
          outputRef: null,
          activityRef: `${revisionRef}/activity.json`,
          jobs: [
            {
              jobId: JOB_ID,
              label: 'LocusKit unit tests',
              ref: `runtime/jobs/${JOB_ID}/output.log`,
            },
          ],
        },
      ],
      acceptedActionIds: [],
    },
  };
  await appendCardWorkRecord(
    cardsRoot,
    CARD_ID,
    0,
    {
      kind: 'system-event',
      stage: 'planning',
      actionId: null,
      event: 'plan-finalized',
      text: 'Fixture user confirmed Plan.',
      refs: [],
    },
    {
      'planning-state.json': JSON.stringify(card),
      'source.md': '# Source',
      'plan.md': '# Plan',
      'activity.json': JSON.stringify([
        {
          phase: 'prepare',
          summary: 'Preparing the Worker assignment',
          updatedAt: '2026-09-01T00:00:05.000Z',
          attempts: 1,
        },
        {
          phase: 'execute',
          summary: 'Finished: swift test (exit 1)',
          updatedAt: '2026-09-01T00:03:00.000Z',
          attempts: 1,
        },
      ]),
    },
  );
  const jobDirectory = path.join(project.planningPath, 'runtime/jobs', JOB_ID);
  await mkdir(jobDirectory, { recursive: true });
  await writeFile(path.join(jobDirectory, 'output.log'), 'Test Suite failed\n');
  await writeFile(
    path.join(jobDirectory, 'job.json'),
    JSON.stringify({
      jobId: JOB_ID,
      status: 'failed',
      label: 'LocusKit unit tests',
      command: 'swift test',
      startedAt: '2026-09-01T00:02:00.000Z',
      endedAt: '2026-09-01T00:03:00.000Z',
      exitCode: 1,
    }),
  );
  const response = await get(['implementation', CARD_ID, RUN_UUID]);
  assert.equal(response.status, 200);
  assert.equal(response.json.meta.kind, 'card');
  assert.equal(response.json.meta.subject, 'Action 1/1 · Add the token store');
  assert.equal(response.json.meta.status, 'fail');
  assert.equal(
    response.json.meta.detail,
    'Worker did not return a valid report.',
  );
  assert.deepEqual(response.json.meta.jobLogs, [
    {
      jobId: JOB_ID,
      label: 'LocusKit unit tests',
      ref: `runtime/jobs/${JOB_ID}/output.log`,
    },
  ]);
  assert.equal(response.json.legacy, true);
  const lines = (response.json.text as string).trimEnd().split('\n');
  assert.match(lines[1]!, /COORDINATOR PREPARE assignment\.progress/);
  assert.match(
    lines[2]!,
    /ERROR JOB VERIFY job\.finished — swift test exited 1/,
  );
  assert.match(
    lines[3]!,
    /ERROR HOST RUN run\.failed — Worker did not return a valid report\./,
  );
  const job = await get(['jobs', JOB_ID], '?raw=1');
  assert.equal(job.status, 200);
  assert.equal(job.text, 'Test Suite failed\n');
  const jobMeta = await get(['jobs', JOB_ID]);
  assert.equal(jobMeta.json.meta.kind, 'job');
  assert.equal(jobMeta.json.meta.status, 'fail');
  assert.equal(jobMeta.json.meta.detail, 'Exited 1');
});

void test('historical Card Runs are classified from their results, not transport success', async () => {
  const base = {
    id: RUN_UUID,
    actionId: ACTION_ID,
    input: 'do it',
    profile: { agent: 'claude', model: 'sonnet', effort: '' },
    startedAt: '2026-09-01T00:00:00.000Z',
    endedAt: '2026-09-01T00:05:00.000Z',
    hostPid: process.pid,
    agentSessionId: null,
    usage: null,
    error: null,
    observedRefs: [],
    outputRef: null,
  } as const;
  const report = (
    outcome: 'delivered' | 'blocked' | 'error',
    checks: Array<'passed' | 'failed' | 'not-run'>,
  ) => ({
    stage: 'execution' as const,
    actionId: ACTION_ID,
    outcome,
    summary: 'LocusKit tests failed and execution stopped.',
    artifactRefs: [],
    checks: checks.map((status, index) => ({
      criterionId: `AC-0${index + 1}`,
      summary: `Check ${index + 1}`,
      status,
      evidenceRefs: [],
    })),
    remaining: [],
    handoffSummary: '',
    harnessRevision: 1,
    requestId: RUN_UUID,
    cardId: CARD_ID,
    contextRevision: 1,
    inputFingerprint: 'sha256:x',
  });
  const blocked = cardRunClassification({
    ...base,
    status: 'succeeded',
    result: report('blocked', ['passed', 'failed']),
  } as never);
  assert.equal(blocked?.status, 'fail');
  const notRun = cardRunClassification({
    ...base,
    status: 'succeeded',
    result: report('delivered', ['passed', 'not-run']),
  } as never);
  assert.equal(notRun?.status, 'warning');
  assert.equal(notRun?.title, 'Required checks incomplete');
  const delivered = cardRunClassification(
    {
      ...base,
      status: 'succeeded',
      result: report('delivered', ['passed']),
    } as never,
    true,
  );
  assert.equal(delivered?.status, 'completed');
  assert.equal(delivered?.title, 'Accepted');
  const failed = cardRunClassification({
    ...base,
    status: 'failed',
    result: null,
    error: 'Worker did not return a valid report.',
  } as never);
  assert.equal(failed?.status, 'fail');
  assert.equal(failed?.title, 'Execution failed');
  const saved = cardRunClassification({
    ...base,
    status: 'succeeded',
    result: report('delivered', ['passed']),
    response: {
      status: 'warning',
      title: 'Pending',
      detail: 'PR review pending.',
      supplementaryWarnings: [],
      recovery: ['log'],
    },
  } as never);
  assert.equal(saved?.title, 'Pending');
});

void test('large completed logs are served in bounded chunks that report their remaining size', async (t) => {
  const { project, get } = await fixture(t);
  const directory = await writeModuleRun(project.planningPath, RUN_ID, {});
  const log = await createRunLog(path.join(directory, 'run.log'), {
    level: 'INFO',
    actor: 'HOST',
    phase: 'RUN',
    event: 'run.started',
    message: 'started',
  });
  for (let index = 0; index < 400; index += 1)
    log.append({
      level: 'INFO',
      actor: 'WORKER',
      phase: 'EXECUTE',
      event: 'worker.progress',
      message: `line ${index} ${'x'.repeat(900)}\ncontinuation ${index}`,
    });
  log.append({
    level: 'ERROR',
    actor: 'HOST',
    phase: 'RUN',
    event: 'run.failed',
    message: 'final failure detail',
  });
  await log.close();
  const first = await get(['whats-next', RUN_ID]);
  assert.ok(first.json.next < first.json.size);
  assert.equal(first.json.live, false);
  assert.doesNotMatch(first.json.text, /final failure detail/);
  let cursor = first.json.next;
  let text = first.json.text as string;
  for (let round = 0; round < 10 && cursor < first.json.size; round += 1) {
    const chunk = await get(['whats-next', RUN_ID], `?offset=${cursor}`);
    text += chunk.json.text;
    cursor = chunk.json.next;
  }
  assert.equal(cursor, first.json.size);
  assert.match(text, /run\.failed — final failure detail\n$/);
  assert.equal(
    text.split('\n').filter((line) => /^\d{6} /.test(line)).length,
    402,
  );
});

void test('Host operation logs resolve by operation id', async (t) => {
  const { project, get } = await fixture(t);
  const outcome = await runHostOperation(
    project,
    { kind: 'sync-main', label: 'Sync Up' },
    async () => 'ok',
  );
  const response = await get(['host', outcome.operationId]);
  assert.equal(response.status, 200);
  assert.equal(response.json.meta.kind, 'host');
  assert.equal(response.json.meta.status, 'completed');
  assert.equal(response.json.meta.subject, 'Sync Up');
  assert.match(response.json.text, /operation\.completed/);
});

void test('unknown, malformed or escaping references are rejected without leaking paths', async (t) => {
  const { project, get } = await fixture(t);
  for (const segments of [
    ['whats-next', 'RUN-not-a-run'],
    ['whats-next', '..'],
    ['implementation', '..', RUN_UUID],
    ['implementation', CARD_ID, '../../project.json'],
    ['host', '../project.json'],
    ['jobs', '..'],
    ['nope', RUN_ID],
    ['whats-next', RUN_ID, 'extra'],
  ]) {
    const response = await get(segments);
    assert.ok(
      response.status === 400 || response.status === 404,
      `${segments.join('/')} → ${response.status}`,
    );
    assert.doesNotMatch(JSON.stringify(response.json), /\.praxis|tmp/);
  }
  const missing = await get(['whats-next', RUN_ID]);
  assert.equal(missing.status, 404);
  await assert.rejects(resolveLogTarget(project, ['host', 'OP-x']), /invalid/);
});
