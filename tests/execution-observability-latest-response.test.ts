import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  StaleResponseError,
  latestResponsePaths,
  publishLatestResponse,
  readLatestResponse,
  reconstructFailFromLog,
  renderLatestResponseMarkdown,
} from '../lib/execution-observability/latest-response-store.ts';
import { createRunLog } from '../lib/execution-observability/run-log.ts';
import type {
  LatestResponseDocument,
  ResponseOwner,
} from '../lib/execution-observability/types.ts';

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'latest-response-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planningPath = path.join(root, '.praxis');
  const moduleOwner: ResponseOwner = {
    kind: 'module',
    projectId: 'project-1',
    planningPath,
    module: 'whats-next',
  };
  const card: ResponseOwner = {
    kind: 'card',
    projectId: 'project-1',
    planningPath,
    cardId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  return { planningPath, module: moduleOwner, card };
}

function document(
  owner: ResponseOwner,
  runId: string,
  status: LatestResponseDocument['status'],
  startedAt = '2026-09-04T00:00:00.000Z',
): LatestResponseDocument {
  return {
    schemaVersion: 1,
    owner:
      owner.kind === 'module'
        ? { kind: 'module', module: owner.module }
        : { kind: 'card', cardId: owner.cardId },
    projectId: owner.projectId,
    runId,
    revision: 0,
    status,
    title:
      status === 'running' ? 'Running' : 'Deployment target needs confirmation',
    detail:
      status === 'running'
        ? 'Reading the Product Source'
        : 'project.yml declares iOS 26.0 while the configuration declares iOS 26.1.',
    subject: { kind: 'layer', label: 'Product Discovery' },
    supplementaryWarnings: status === 'completed' ? ['Unused import'] : [],
    recovery: ['log'],
    startedAt,
    updatedAt: startedAt,
    endedAt: status === 'running' ? null : startedAt,
    logRef: `whats-next/runs/${runId}/run.log`,
    logUrlPath: `/projects/${owner.projectId}/logs/whats-next/${runId}`,
    hostPid: process.pid,
    recentActivity: [],
  };
}

void test('each owner keeps exactly one Latest Response document pair', async (t) => {
  const { module, card } = await fixture(t);
  await publishLatestResponse(module, document(module, 'RUN-1', 'running'));
  await publishLatestResponse(module, document(module, 'RUN-1', 'warning'));
  await publishLatestResponse(
    module,
    document(module, 'RUN-2', 'running', '2026-09-04T01:00:00.000Z'),
  );
  await publishLatestResponse(card, document(card, 'run-a', 'completed'));
  const moduleFiles = (await readdir(latestResponsePaths(module).directory))
    .filter((name) => name.startsWith('latest-response'))
    .sort();
  assert.deepEqual(moduleFiles, ['latest-response.json', 'latest-response.md']);
  const cardFiles = (await readdir(latestResponsePaths(card).directory)).sort();
  assert.deepEqual(cardFiles, ['latest-response.json', 'latest-response.md']);
  const current = await readLatestResponse(module);
  assert.equal(current?.runId, 'RUN-2');
  assert.equal(current?.status, 'running');
  assert.equal(current?.revision, 3);
  assert.equal((await readLatestResponse(card))?.runId, 'run-a');
});

void test('late, canceled or foreign output cannot overwrite a newer response', async (t) => {
  const { module, card } = await fixture(t);
  await publishLatestResponse(module, document(module, 'RUN-1', 'running'));
  await publishLatestResponse(
    module,
    document(module, 'RUN-2', 'running', '2026-09-04T01:00:00.000Z'),
  );
  await assert.rejects(
    publishLatestResponse(module, document(module, 'RUN-1', 'completed')),
    StaleResponseError,
  );
  await publishLatestResponse(
    module,
    document(module, 'RUN-2', 'warning', '2026-09-04T01:00:00.000Z'),
  );
  await assert.rejects(
    publishLatestResponse(
      module,
      document(module, 'RUN-2', 'running', '2026-09-04T01:00:00.000Z'),
    ),
    /already settled/,
  );
  await assert.rejects(
    publishLatestResponse(
      module,
      document(module, 'RUN-2', 'completed', '2026-09-04T01:00:00.000Z'),
    ),
    /already published/,
  );
  const replaced = await publishLatestResponse(
    module,
    document(module, 'RUN-2', 'completed', '2026-09-04T01:00:00.000Z'),
    { allowTerminalReplace: true },
  );
  assert.equal(replaced.status, 'completed');
  await assert.rejects(
    publishLatestResponse(module, document(card, 'run-x', 'completed')),
    /another owner/,
  );
  assert.equal((await readLatestResponse(module))?.status, 'completed');
});

void test('the Markdown document follows the response template', async (t) => {
  const { module } = await fixture(t);
  const published = await publishLatestResponse(
    module,
    document(module, 'RUN-9', 'completed'),
  );
  const markdown = await readFile(latestResponsePaths(module).markdown, 'utf8');
  assert.equal(markdown, renderLatestResponseMarkdown(published));
  assert.match(
    markdown,
    /^# Deployment target needs confirmation\n\nStatus: Completed\nRun: RUN-9\nSubject: Product Discovery\nUpdated: 2026-09-04T00:00:00\.000Z\nLog: whats-next\/runs\/RUN-9\/run\.log\n\nproject\.yml declares/,
  );
  assert.match(markdown, /Additional findings:\n\n- Unused import\n$/);
});

void test('a missing or corrupt document becomes an explicit Fail reconstructed from the log', async (t) => {
  const { module, planningPath } = await fixture(t);
  assert.equal(await readLatestResponse(module), null);
  const logFile = path.join(planningPath, 'whats-next/runs/RUN-3/run.log');
  const log = await createRunLog(logFile, {
    level: 'INFO',
    actor: 'HOST',
    phase: 'RUN',
    event: 'run.started',
    message: 'started',
  });
  log.append({
    level: 'INFO',
    actor: 'AGENT',
    phase: 'EXECUTE',
    event: 'agent.message',
    message: 'Reading the Product Source',
  });
  await log.close();
  await writeFile(latestResponsePaths(module).json, '{ not json');
  assert.equal(await readLatestResponse(module), null);
  const rebuilt = await reconstructFailFromLog(module, {
    runId: 'RUN-3',
    logFile,
    logRef: 'whats-next/runs/RUN-3/run.log',
    subject: { kind: 'layer', label: 'Product Discovery' },
    startedAt: '2026-09-04T00:00:00.000Z',
    endedAt: null,
  });
  assert.equal(rebuilt.status, 'fail');
  assert.equal(rebuilt.reconstructed, true);
  assert.equal(rebuilt.title, 'Response unavailable');
  assert.match(rebuilt.detail, /whats-next\/runs\/RUN-3\/run\.log/);
  assert.equal(
    rebuilt.recentActivity.at(-1)?.message,
    'Reading the Product Source',
  );
});
