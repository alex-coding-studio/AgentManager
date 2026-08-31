import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HostJobBroker } from '../lib/host-job-broker.ts';
import { CodexAppServerDriver } from '../lib/codex-app-server-driver.ts';
import { LegacyAgentSessionDriver } from '../lib/legacy-agent-session-driver.ts';
import type { startLocalAgentRun } from '../lib/local-agent-transport.ts';

void test('Host job completion is pushed once with durable log and status', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-job-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const records = path.join(root, 'records');
  const events: string[] = [];
  const broker = new HostJobBroker(root, records, (event) =>
    events.push(event.status),
  );
  const job = await broker.run({
    label: 'fixture',
    executable: process.execPath,
    arguments: ['-e', "setTimeout(()=>console.log('READY'),80)"],
    workingDirectory: root,
  });
  const result = await job.completion;
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.deepEqual(events, ['running', 'completed']);
  assert.match(await readFile(result.logRef, 'utf8'), /READY/);
  assert.equal(
    JSON.parse(await readFile(path.join(records, job.id, 'job.json'), 'utf8'))
      .status,
    'completed',
  );
});

void test('Host job output refreshes activity without involving the Agent turn', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-job-progress-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const progress: string[] = [];
  const broker = new HostJobBroker(
    root,
    path.join(root, 'records'),
    undefined,
    (event) => progress.push(event.outputTail),
  );
  const job = await broker.run({
    label: 'progress',
    executable: process.execPath,
    arguments: ['-e', "console.log('BUILD_STARTED')"],
    workingDirectory: root,
  });
  await job.completion;
  assert.deepEqual(progress, ['BUILD_STARTED']);
});

void test('Host job rejects workspace escape and cancels its process group', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-job-cancel-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'agent-job-outside-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const broker = new HostJobBroker(root, path.join(root, 'records'));
  await assert.rejects(
    broker.run({
      label: 'escape',
      executable: process.execPath,
      arguments: ['-e', ''],
      workingDirectory: outside,
    }),
    /inside the Card workspace/,
  );
  const job = await broker.run({
    label: 'cancel',
    executable: process.execPath,
    arguments: ['-e', 'setInterval(()=>{},1000)'],
    workingDirectory: root,
  });
  job.cancel();
  assert.equal((await job.completion).status, 'canceled');
});

void test('legacy Claude driver exposes no push or persistent-thread capability', async () => {
  const transport: typeof startLocalAgentRun = (provider, input) => ({
    completion: Promise.resolve({
      agentSessionId: 'legacy-session',
      finalOutput: `${provider}:${input.prompt}`,
      usage: null,
    }),
    cancel: () => {},
  });
  const driver = new LegacyAgentSessionDriver('claude', transport);
  assert.deepEqual(driver.capabilities, {
    persistentThreads: false,
    pushToolResults: false,
    turnResume: false,
    turnInterrupt: true,
  });
  const thread = await driver.startThread({
    profile: { agent: 'claude', model: 'fixture', effort: 'low' },
    workingDirectory: '/tmp',
    access: 'workspace-write',
  });
  const result = await driver.startTurn(thread, { prompt: 'work' }).completion;
  assert.equal(result.finalOutput, 'claude:work');
  assert.equal(result.turnId, 'legacy-session');
});

void test('Codex App Server driver resumes a new physical turn only after Host job exit', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-driver-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
let turnStarts=0;
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-1'}}});
else if(message.method==='turn/start'){turnStarts++;const turnId='turn-'+turnStarts;send({id:message.id,result:{turn:{id:turnId}}});if(turnStarts===1)send({id:900,method:'item/tool/call',params:{threadId:'thread-1',turnId,callId:'call-1',tool:'run_job',arguments:{label:'wait',executable:process.execPath,arguments:['-e',"setTimeout(()=>console.log('EVENT_DONE'),100)"],workingDirectory:'.'}}});else{send({method:'thread/tokenUsage/updated',params:{threadId:'thread-1',turnId,tokenUsage:{total:{inputTokens:20,cachedInputTokens:8,cacheWriteInputTokens:0,outputTokens:4,reasoningOutputTokens:1,totalTokens:25}}}});send({method:'item/completed',params:{threadId:'thread-1',turnId,item:{type:'agentMessage',text:'EVENT_OK'}}});send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:turnId,status:'completed'}}});}}
else if(message.method==='turn/interrupt'){send({id:message.id,result:{}});send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:message.params.turnId,status:'interrupted'}}});}
});`,
  );
  const statuses: string[] = [];
  const runtimeEvents: string[] = [];
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(
        input.workingDirectory,
        path.join(root, 'jobs'),
        (event) => statuses.push(event.status),
      ),
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'workspace-write',
  });
  const result = await driver.startTurn(thread, {
    prompt: 'wait',
    onEvent: (event) => runtimeEvents.push(event.type),
  }).completion;
  assert.equal(result.threadId, 'thread-1');
  assert.equal(result.turnId, 'turn-2');
  assert.equal(result.finalOutput, 'EVENT_OK');
  assert.equal(result.usage?.inputTokens, 20);
  assert.equal(result.usage?.cachedInputTokens, 8);
  assert.deepEqual(statuses, ['running', 'completed']);
  assert.deepEqual(runtimeEvents, [
    'turn-started',
    'job-started',
    'turn-completed',
    'job-completed',
    'turn-started',
    'activity',
    'turn-completed',
  ]);
  assert.match(
    await readFile(
      path.join(
        root,
        'jobs',
        await readdirOne(path.join(root, 'jobs')),
        'output.log',
      ),
      'utf8',
    ),
    /EVENT_DONE/,
  );
});

void test('Codex App Server driver retains output delivered beside turn start', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-immediate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-fast'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-fast'}}});send({method:'item/completed',params:{threadId:'thread-fast',turnId:'turn-fast',item:{type:'agentMessage',text:'FAST_OK'}}});send({method:'turn/completed',params:{threadId:'thread-fast',turn:{id:'turn-fast',status:'completed'}}});}
});`,
  );
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'workspace-write',
  });
  const result = await driver.startTurn(thread, { prompt: 'finish now' })
    .completion;
  assert.equal(result.finalOutput, 'FAST_OK');
});

async function readdirOne(directory: string) {
  const entries = await import('node:fs/promises').then((fs) =>
    fs.readdir(directory),
  );
  assert.equal(entries.length, 1);
  return entries[0];
}
