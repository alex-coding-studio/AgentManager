import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexAppServerDriver } from '../lib/codex-app-server-driver.ts';
import { HostJobBroker, type HostJobEvent } from '../lib/host-job-broker.ts';

const model = process.argv[2];
if (!model) throw new Error('Supply a Codex model ID explicitly.');
const root = await mkdtemp(path.join(os.tmpdir(), 'appserver-code-smoke-'));
const records = path.join(root, '.jobs');
await writeFile(
  path.join(root, 'math.mjs'),
  'export function add(a, b) { return a - b; }\n',
);
await writeFile(
  path.join(root, 'test.mjs'),
  `import assert from 'node:assert/strict';
import {add} from './math.mjs';
await new Promise(resolve => setTimeout(resolve, 3000));
assert.equal(add(2, 3), 5);
console.log('TEST_OK');
`,
);
const events: HostJobEvent[] = [];
const driver = new CodexAppServerDriver({
  brokerFactory: (input) =>
    new HostJobBroker(input.workingDirectory, records, (event) =>
      events.push(event),
    ),
});
const timer = setTimeout(() => void driver.close(), 120000);
try {
  const thread = await driver.startThread({
    profile: { agent: 'codex', model, effort: 'low' },
    workingDirectory: root,
    access: 'workspace-write',
  });
  const turn = driver.startTurn(thread, {
    prompt: `Inspect math.mjs and test.mjs. Fix only the add implementation. Then call the Host dynamic tool run_job exactly once with executable ${JSON.stringify(process.execPath)}, arguments ["test.mjs"], label "code smoke", and workingDirectory ".". Do not run the test with shell or another tool. Wait for the Host tool result, then return exactly SMOKE_OK if it passed.`,
  });
  const result = await turn.completion;
  assert.match(await readFile(path.join(root, 'math.mjs'), 'utf8'), /a \+ b/);
  assert.equal(events.filter((event) => event.status === 'running').length, 1);
  const completed = events.find((event) => event.status === 'completed');
  assert.ok(completed);
  assert.equal(completed.exitCode, 0);
  assert.match(await readFile(completed.logRef, 'utf8'), /TEST_OK/);
  assert.match(result.finalOutput, /SMOKE_OK/);
  const evidence = {
    passed: true,
    model,
    threadId: result.threadId,
    turnId: result.turnId,
    jobEvents: events.map((event) => ({
      status: event.status,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      exitCode: event.exitCode,
      logRef: event.logRef,
    })),
    usage: result.usage,
  };
  await mkdir(path.resolve('outputs'), { recursive: true });
  await writeFile(
    path.resolve('outputs/appserver-code-smoke.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  await rm(root, { recursive: true, force: true });
} finally {
  clearTimeout(timer);
  await driver.close();
}
