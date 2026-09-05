import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ActiveRunConflictError,
  beginRun,
  getActiveRun,
  isCurrentRun,
  listActiveRuns,
  releaseRun,
  requestStop,
  settleRun,
  type ActiveRunReservation,
} from '../lib/execution-observability/active-runs.ts';
import { runHostOperation } from '../lib/execution-observability/host-operations.ts';
import {
  latestResponsePaths,
  readLatestResponse,
} from '../lib/execution-observability/latest-response-store.ts';
import { classifyResponse } from '../lib/execution-observability/status.ts';
import { parseRunLogText } from '../lib/execution-observability/run-log-format.ts';
import type { ResponseOwner } from '../lib/execution-observability/types.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'active-runs-'));
  const planningPath = path.join(root, '.praxis');
  const owner: ResponseOwner = {
    kind: 'module',
    projectId: 'project-1',
    planningPath,
    module: 'whats-next',
  };
  const reservations: ActiveRunReservation[] = [];
  t.after(async () => {
    for (const reservation of reservations) releaseRun(reservation);
    await rm(root, { recursive: true, force: true });
  });
  const start = async (
    runId: string,
    options: {
      persist?: (
        reservation: ActiveRunReservation,
      ) => Promise<() => Promise<void>>;
      validate?: () => Promise<void>;
    } = {},
  ) => {
    const result = await beginRun({
      owner,
      runId,
      logFile: path.join(planningPath, 'whats-next/runs', runId, 'run.log'),
      logRef: `whats-next/runs/${runId}/run.log`,
      subject: { kind: 'layer', label: 'Product Discovery' },
      layer: 'discovery',
      startMessage: `Run ${runId} started`,
      conflictMessage:
        'A Product Exploration and Design Run is already active.',
      validate: options.validate ?? (async () => undefined),
      persist: options.persist ?? (async () => async () => undefined),
    });
    reservations.push(result.reservation);
    return result.reservation;
  };
  return { planningPath, owner, start };
}

function controllable() {
  let resolve: () => void = () => undefined;
  let canceled = 0;
  const completion = new Promise<void>((done) => {
    resolve = done;
  });
  return {
    handle: {
      completion,
      cancel: () => {
        canceled += 1;
      },
    },
    exit: () => resolve(),
    canceled: () => canceled,
  };
}

void test('transactional start creates the log and running response before any Agent runs, and rejects a second owner Run', async (t) => {
  const { owner, planningPath, start } = await fixture(t);
  const order: string[] = [];
  const reservation = await start('RUN-1', {
    persist: async (reservation) => {
      order.push('persist');
      assert.ok((await stat(reservation.logFile)).isFile());
      assert.equal(await readLatestResponse(owner), null);
      return async () => {
        order.push('rollback');
      };
    },
  });
  assert.deepEqual(order, ['persist']);
  assert.equal(getActiveRun(owner), reservation);
  assert.equal(listActiveRuns(planningPath).length, 1);
  const running = await readLatestResponse(owner);
  assert.equal(running?.status, 'running');
  assert.equal(running?.runId, 'RUN-1');
  assert.equal(running?.layer, 'discovery');
  await assert.rejects(start('RUN-2'), (error: unknown) => {
    assert.ok(error instanceof ActiveRunConflictError);
    assert.equal(error.status, 409);
    assert.match(error.message, /already active/);
    return true;
  });
  assert.equal((await readLatestResponse(owner))?.runId, 'RUN-1');
  assert.equal(
    (await readdir(path.join(planningPath, 'whats-next/runs'))).length,
    1,
  );
});

void test('a failed preflight, log creation or persistence leaves no reservation, log or response behind', async (t) => {
  const { owner, planningPath, start } = await fixture(t);
  await assert.rejects(
    start('RUN-1', {
      validate: async () => {
        throw new Error('Inline feedback is stale.');
      },
    }),
    /stale/,
  );
  assert.equal(getActiveRun(owner), null);
  assert.equal(await readLatestResponse(owner), null);
  const existing = path.join(planningPath, 'whats-next/runs/RUN-2/run.log');
  await mkdir(path.dirname(existing), { recursive: true });
  await writeFile(existing, 'stale');
  await assert.rejects(start('RUN-2'), /EEXIST/);
  assert.equal(getActiveRun(owner), null);
  assert.equal(await readLatestResponse(owner), null);
  assert.equal(await readFile(existing, 'utf8'), 'stale');
  let rolledBack = false;
  await assert.rejects(
    start('RUN-3', {
      persist: async () => {
        throw new Error('Worklog revision conflict.');
      },
    }),
    /revision conflict/,
  );
  await assert.rejects(
    stat(path.join(planningPath, 'whats-next/runs/RUN-3/run.log')),
    /ENOENT/,
  );
  const reservation = await start('RUN-4', {
    persist: async () => async () => {
      rolledBack = true;
    },
  });
  assert.equal(rolledBack, false);
  assert.ok(isCurrentRun(reservation));
});

void test('settlement publishes the terminal response, records the run event and releases the owner', async (t) => {
  const { owner, start } = await fixture(t);
  const reservation = await start('RUN-1');
  reservation.setPhase('executing', 'AGENT');
  reservation.record({
    level: 'INFO',
    actor: 'AGENT',
    phase: 'EXECUTE',
    event: 'agent.message',
    message: 'Reading the Product Source',
  });
  const published = await settleRun(reservation, {
    classification: classifyResponse({
      surface: 'module',
      runState: 'settled',
      outcome: 'clarification',
      question: 'Which deployment target should be authoritative?',
    }),
  });
  assert.equal(published?.status, 'warning');
  assert.equal(published?.title, 'Answer needed');
  assert.equal(
    published?.recentActivity.at(-1)?.message,
    'Reading the Product Source',
  );
  assert.equal(getActiveRun(owner), null);
  const entries = parseRunLogText(await readFile(reservation.logFile, 'utf8'));
  assert.deepEqual(
    entries.map((entry) => entry.event),
    ['run.started', 'phase.executing', 'agent.message', 'run.warning'],
  );
  assert.equal(entries.at(-1)?.level, 'WARN');
  const next = await start('RUN-2');
  assert.equal((await readLatestResponse(owner))?.runId, 'RUN-2');
  assert.equal((await readLatestResponse(owner))?.status, 'running');
  assert.equal(
    await settleRun(reservation, {
      classification: classifyResponse({
        surface: 'module',
        runState: 'settled',
        outcome: 'proposal',
      }),
    }),
    null,
  );
  assert.equal((await readLatestResponse(owner))?.runId, 'RUN-2');
  assert.ok(isCurrentRun(next));
});

void test('a failed terminal publication still closes the log and releases the owner', async (t) => {
  const { owner, start } = await fixture(t);
  const reservation = await start('RUN-1');
  const paths = latestResponsePaths(owner);
  await rm(paths.markdown);
  await mkdir(paths.markdown);
  await assert.rejects(
    settleRun(reservation, {
      classification: classifyResponse({
        surface: 'module',
        runState: 'settled',
        outcome: 'proposal',
      }),
    }),
  );
  assert.equal(getActiveRun(owner), null);
  const events = parseRunLogText(
    await readFile(reservation.logFile, 'utf8'),
  ).map((entry) => entry.event);
  assert.equal(events.at(-1), 'response.publish-failed');
  assert.equal((await readLatestResponse(owner))?.runId, 'RUN-1');
  assert.equal((await readLatestResponse(owner))?.status, 'running');
  await rm(paths.markdown, { recursive: true, force: true });
  const next = await start('RUN-2');
  assert.ok(isCurrentRun(next));
});

void test('confirmed cancellation passes through Stopping and settles as Warning Canceled', async (t) => {
  const { owner, start } = await fixture(t);
  const reservation = await start('RUN-1');
  const agent = controllable();
  reservation.attach(agent.handle);
  reservation.setPhase('executing', 'AGENT');
  const stopping = requestStop(reservation, 2_000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(agent.canceled(), 1);
  const midway = await readLatestResponse(owner);
  assert.equal(midway?.status, 'running');
  assert.equal(midway?.phase, 'stopping');
  assert.equal(midway?.title, 'Stopping');
  agent.exit();
  assert.equal(await stopping, 'confirmed');
  const published = await settleRun(reservation, {
    classification: classifyResponse({
      surface: 'module',
      runState: 'canceled',
      interruptedPhase: 'executing',
      retained: {
        changedFiles: 0,
        commits: [],
        checkpoint: null,
        pullRequests: [],
        checksStarted: false,
      },
    }),
  });
  assert.equal(published?.status, 'warning');
  assert.equal(published?.title, 'Canceled');
  assert.equal(getActiveRun(owner), null);
  const events = parseRunLogText(
    await readFile(reservation.logFile, 'utf8'),
  ).map((entry) => entry.event);
  assert.deepEqual(events, [
    'run.started',
    'phase.executing',
    'cancel.requested',
    'phase.stopping',
    'cancel.confirmed',
    'run.warning',
  ]);
});

void test('unconfirmed termination becomes Fail and blocks the owner until the process exits', async (t) => {
  const { owner, start } = await fixture(t);
  const reservation = await start('RUN-1');
  const agent = controllable();
  reservation.attach(agent.handle);
  assert.equal(await requestStop(reservation, 30), 'unconfirmed');
  const published = await settleRun(reservation, {
    classification: classifyResponse({
      surface: 'module',
      runState: 'termination-unconfirmed',
      interruptedActor: 'AGENT',
    }),
  });
  assert.equal(published?.status, 'fail');
  assert.equal(published?.title, 'Execution could not be stopped');
  assert.equal(getActiveRun(owner), reservation);
  await assert.rejects(start('RUN-2'), /could not be stopped/);
  agent.exit();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(getActiveRun(owner), null);
  const events = parseRunLogText(
    await readFile(reservation.logFile, 'utf8'),
  ).map((entry) => entry.event);
  assert.ok(events.includes('cancel.unconfirmed'));
  assert.equal(events.at(-1), 'process.exited-late');
  const next = await start('RUN-2');
  assert.equal((await readLatestResponse(owner))?.runId, 'RUN-2');
  assert.ok(isCurrentRun(next));
});

void test('host operations get their own log and record without touching the Latest Response', async (t) => {
  const { owner, planningPath } = await fixture(t);
  const project = { id: owner.projectId, planningPath };
  const outcome = await runHostOperation(
    project,
    { kind: 'sync-main', label: 'Sync Up' },
    async (log) => {
      log.append({
        level: 'INFO',
        actor: 'HOST',
        phase: 'PUBLISH',
        event: 'git.fetched',
        message: 'origin/main fast-forwarded to abc123',
      });
      return { updated: true };
    },
  );
  assert.match(outcome.operationId, /^OP-[0-9a-f-]{36}$/);
  assert.equal(
    outcome.logUrlPath,
    `/projects/project-1/logs/host/${outcome.operationId}`,
  );
  assert.deepEqual(outcome.result, { updated: true });
  const entries = parseRunLogText(
    await readFile(path.join(planningPath, outcome.logRef), 'utf8'),
  );
  assert.deepEqual(
    entries.map((entry) => entry.event),
    ['operation.started', 'git.fetched', 'operation.completed'],
  );
  const record = JSON.parse(
    await readFile(
      path.join(planningPath, 'host/operations', `${outcome.operationId}.json`),
      'utf8',
    ),
  );
  assert.equal(record.status, 'completed');
  assert.equal(record.kind, 'sync-main');
  await assert.rejects(
    runHostOperation(
      project,
      { kind: 'undo-action', label: 'Undo' },
      async () => {
        throw new Error('token=ghp_abcdefghijklmnop rejected');
      },
    ),
    /rejected/,
  );
  const failed = (await readdir(path.join(planningPath, 'host/operations')))
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(planningPath, 'host/operations', name));
  assert.equal(failed.length, 2);
  const records = await Promise.all(
    failed.map(async (file) => JSON.parse(await readFile(file, 'utf8'))),
  );
  const undo = records.find((item) => item.kind === 'undo-action');
  assert.equal(undo.status, 'fail');
  assert.match(undo.detail, /token=\[redacted\]/);
  assert.equal(await readLatestResponse(owner), null);
  await assert.rejects(stat(latestResponsePaths(owner).json), /ENOENT/);
});
