import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  buildCardHarnessPrompt,
  createCardHarnessRequest,
} from '../lib/just-do-it-harness.ts';
import {
  startCoordinatedExecution,
  CoordinationRunError,
} from '../lib/just-do-it-coordination-runner.ts';
import type { CoordinatedResult } from '../lib/just-do-it-coordination-runner.ts';
const coordinatorModel = process.argv[2];
const workerModel = process.argv[3];
if (!coordinatorModel || !workerModel)
  throw new Error('Supply coordinator and worker model IDs explicitly.');
const root = await mkdtemp(
  path.join(os.tmpdir(), 'agentmanager-coordination-smoke-'),
);
const cardId = randomUUID();
const actionId = randomUUID();
const criteria = [
  {
    id: 'SMOKE-01',
    criterion: 'Create the requested text artifact',
    passCondition: 'delivery.txt contains exactly READY followed by a newline.',
    evidence: 'Read the actual file after execution.',
  },
];
await writeFile(
  path.join(root, 'task.txt'),
  'Create delivery.txt containing exactly READY followed by one newline. No other project work is needed.',
);
const request = createCardHarnessRequest(
  {
    cardId,
    contextRevision: 1,
    goal: 'Validate the coordinator-to-worker protocol using one temporary text file, not an application.',
    moduleInstructions:
      'This is an isolated infrastructure fixture. No GitHub, Git, installation, build, tests, images, setup Skills or external side effects. The coordinator must dispatch the missing file creation to one worker, then read the file to qualify the result. Do not edit task.txt.',
    skills: [],
    resources: [
      { ref: path.join(root, 'task.txt'), description: 'Exact fixture task' },
    ],
    handoffMarkdown:
      'No earlier work. The requested delivery does not exist yet.',
    plan: {
      status: 'finalized',
      overview: 'One bounded text-file task.',
      steps: [
        {
          id: actionId,
          title: 'Create a text artifact',
          input: 'task.txt',
          output: 'delivery.txt',
          validation: 'Read exact contents',
          acceptanceCriteria: criteria,
        },
      ],
    },
    acceptanceChecklist: { version: 'smoke-v1', items: criteria },
    acceptanceOverrides: {},
    acceptedActionIds: [],
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
  'Create the missing file, then verify it.',
  actionId,
);
const startedAt = new Date().toISOString();
const run = startCoordinatedExecution({
  request,
  workerOptions: {
    workingDirectory: root,
    prompt: `${buildCardHarnessPrompt(request)}\nFixture directory: ${root}. Only create delivery.txt. No other files or actions.`,
    model: workerModel,
    effort: 'low',
    access: 'workspace-write',
  },
  workerAgent: 'codex',
  settings: {
    profile: { agent: 'codex', model: coordinatorModel, effort: 'low' },
  },
  priorEvidence: [],
  previousContext:
    'One temporary file fixture; no application setup is needed.',
  readBasis: async () =>
    createHash('sha256')
      .update(
        await readFile(path.join(root, 'delivery.txt'), 'utf8').catch(
          () => '<missing>',
        ),
      )
      .digest('hex'),
  onProgress: (event) =>
    process.stdout.write(`${event.phase}: ${event.summary.slice(0, 240)}\n`),
});
const timer = setTimeout(() => run.cancel(), 150000);
const outputDirectory = path.resolve('outputs/coordination-smoke');
await mkdir(outputDirectory, { recursive: true });
try {
  const result = (await run.completion) as CoordinatedResult;
  const contents = await readFile(path.join(root, 'delivery.txt'), 'utf8');
  assert.equal(contents, 'READY\n');
  const report = JSON.parse(result.finalOutput);
  assert.equal(report.outcome, 'delivered');
  assert.equal(report.checks[0].status, 'passed');
  assert.equal(
    result.coordination.attempts.filter((a) => a.role === 'worker').length,
    1,
  );
  await writeFile(
    path.join(outputDirectory, 'result.json'),
    JSON.stringify(
      { startedAt, endedAt: new Date().toISOString(), contents, ...result },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({
      passed: true,
      attempts: result.coordination.attempts.map((a) => ({
        role: a.role,
        phase: a.phase,
        usage: a.usage,
      })),
      output: path.join(outputDirectory, 'result.json'),
    }) + '\n',
  );
  await rm(root, { recursive: true, force: true });
} catch (error) {
  await writeFile(
    path.join(outputDirectory, 'failure.json'),
    JSON.stringify(
      {
        startedAt,
        endedAt: new Date().toISOString(),
        root,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof CoordinationRunError
          ? {
              coordination: error.coordination,
              records: error.coordinationRecords,
            }
          : {}),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearTimeout(timer);
}
