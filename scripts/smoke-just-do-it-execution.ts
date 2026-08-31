import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendCardWorkRecord } from '../lib/just-do-it-worklog.ts';
import {
  planningService,
  type PlanningCard,
} from '../lib/just-do-it-planning-service.ts';
import { createExecutionService } from '../lib/just-do-it-execution-service.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';

if (process.argv[2] !== '--run-live')
  throw new Error(
    'Use --run-live to explicitly authorize one real Agent call in a temporary fixture.',
  );
const rootPath = await mkdtemp(path.join(os.tmpdir(), 'jdi-live-execution-'));
const id = randomUUID();
const actionId = randomUUID();
const project: RegisteredProject = {
  id,
  name: 'Execution smoke',
  kind: 'standalone',
  rootPath,
  planningPath: path.join(rootPath, '.agent-manager'),
  codePath: null,
  description: '',
  createdAt: new Date().toISOString(),
};
await mkdir(project.planningPath);
const action = {
  id: actionId,
  title: 'Create the smoke output file',
  input: 'An empty temporary folder.',
  output: 'smoke.txt containing exactly ready followed by a newline.',
  validation: 'Read smoke.txt and compare with the required text.',
};
const card: PlanningCard = {
  schemaVersion: 1,
  id,
  revision: 1,
  source: {
    module: 'whats-next',
    id: `NODE-${id.slice(-8)}`,
    uid: id,
    title: 'Minimal file-writing smoke',
    summary: 'Create exactly one small text file in this temporary folder.',
    dependsOn: [],
    derivedFrom: [],
    outputPaths: [],
  },
  sourceRef: `implementation/cards/${id}/00000001/source.md`,
  requirements:
    'Only create smoke.txt with ready followed by newline. No Git, network, packages, or other files. Do not edit the host-owned .agent-manager directory.',
  resources: [],
  plan: {
    status: 'finalized',
    overview: 'One tiny file output.',
    steps: [action],
  },
  actions: [action],
  run: null,
  finalizedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
await appendCardWorkRecord(
  path.join(project.planningPath, 'implementation/cards'),
  id,
  0,
  {
    kind: 'system-event',
    stage: 'planning',
    actionId: null,
    event: 'plan-finalized',
    text: 'The smoke fixture author authorized this one-file Plan.',
    refs: [],
  },
  {
    'planning-state.json': JSON.stringify(card),
    'source.md': card.requirements,
  },
);
const service = createExecutionService(
  planningService,
  undefined,
  new Map(),
  120000,
);
console.log(JSON.stringify({ rootPath, cardId: id }));
await service.start(project, {
  cardId: id,
  actionId,
  expectedRevision: 1,
  instruction: card.requirements,
  profile: { agent: 'codex', model: process.argv[3] ?? '', effort: 'low' },
});
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const current = await planningService.read(project, id);
  const run = current.execution!.runs.at(-1)!;
  if (run.status === 'running') continue;
  const content = await readFile(
    path.join(rootPath, 'smoke.txt'),
    'utf8',
  ).catch(() => null);
  console.log(
    JSON.stringify({
      status: run.status,
      error: run.error,
      content,
      result: run.result,
      observedRefs: run.observedRefs,
      usage: run.usage,
      accepted: current.execution!.acceptedActionIds,
    }),
  );
  if (
    run.status !== 'succeeded' ||
    content !== 'ready\n' ||
    current.execution!.acceptedActionIds.length
  )
    process.exitCode = 1;
  break;
}
