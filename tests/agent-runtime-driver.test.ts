import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HostJobBroker,
  hostJobCompletionPrompt,
} from '../lib/agents/host-job-broker.ts';
import { CodexAppServerDriver } from '../lib/agents/codex/app-server-driver.ts';
import { LegacyAgentSessionDriver } from '../lib/agents/legacy-session-driver.ts';
import type { startLocalAgentRun } from '../lib/agents/transport.ts';

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
  const continuation = hostJobCompletionPrompt(result);
  assert.match(continuation, /cite this event's jobId/);
  assert.match(continuation, /without opening or copying the log/);
  assert.match(
    continuation,
    /Continue immediately with separately assigned work/,
  );
  const failed = hostJobCompletionPrompt({
    ...result,
    status: 'failed',
    exitCode: 1,
  });
  assert.match(failed, /Inspect logRef only when needed/);
  assert.doesNotMatch(failed, /return without opening or copying the log/);
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
else if(message.method==='turn/start'){turnStarts++;const turnId='turn-'+turnStarts;send({id:message.id,result:{turn:{id:turnId}}});if(turnStarts===1)send({id:900,method:'item/tool/call',params:{threadId:'thread-1',turnId,callId:'call-1',tool:'run_job',arguments:{label:'wait',executable:process.execPath,arguments:['-e',"setTimeout(()=>console.log('EVENT_DONE'),100)"],workingDirectory:${JSON.stringify(root)}}}});else{send({method:'thread/tokenUsage/updated',params:{threadId:'thread-1',turnId,tokenUsage:{total:{inputTokens:20,cachedInputTokens:8,cacheWriteInputTokens:0,outputTokens:4,reasoningOutputTokens:1,totalTokens:25}}}});send({method:'item/completed',params:{threadId:'thread-1',turnId,item:{type:'agentMessage',text:'EVENT_OK'}}});send({method:'turn/completed',params:{threadId:'thread-1',turn:{id:turnId,status:'completed'}}});}}
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
    'activity',
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

void test('Codex App Server driver answers a rejected job path instead of leaving the tool pending', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-path-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'app-server-outside-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-path'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-path'}}});send({id:901,method:'item/tool/call',params:{threadId:'thread-path',turnId:'turn-path',tool:'run_job',arguments:{label:'escape',executable:process.execPath,arguments:['-e',''],workingDirectory:${JSON.stringify(outside)}}}});}
else if(message.id===901){if(message.result?.success!==false)process.exit(2);send({method:'item/completed',params:{threadId:'thread-path',turnId:'turn-path',item:{type:'agentMessage',text:'PATH_REJECTED'}}});send({method:'turn/completed',params:{threadId:'thread-path',turn:{id:'turn-path',status:'completed'}}});}
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
  const result = await driver.startTurn(thread, { prompt: 'reject escape' })
    .completion;
  assert.equal(result.finalOutput, 'PATH_REJECTED');
});

void test('Codex App Server exposes a quick Host candidate publication tool', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start'){if(!message.params.dynamicTools.some(tool=>tool.name==='publish_candidate'))process.exit(2);send({id:message.id,result:{thread:{id:'thread-publish'}}});}
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-publish'}}});send({id:902,method:'item/tool/call',params:{threadId:'thread-publish',turnId:'turn-publish',tool:'publish_candidate',arguments:{headSha:'a'.repeat(40)}}});}
else if(message.id===902){if(message.result?.success!==true)process.exit(3);send({method:'item/completed',params:{threadId:'thread-publish',turnId:'turn-publish',item:{type:'agentMessage',text:'PUBLISHED'}}});send({method:'turn/completed',params:{threadId:'thread-publish',turn:{id:'turn-publish',status:'completed'}}});}
});`,
  );
  let received = '';
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
    hostTools: [
      {
        name: 'publish_candidate',
        description: 'Publish candidate',
        inputSchema: { type: 'object' },
        call: async (arguments_) => {
          received = String(arguments_.headSha);
          return { number: 7 };
        },
      },
    ],
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'workspace-write',
  });
  const result = await driver.startTurn(thread, { prompt: 'publish' })
    .completion;
  assert.equal(received, 'a'.repeat(40));
  assert.equal(result.finalOutput, 'PUBLISHED');
});

void test('a suspending Host tool interrupts the turn and resumes the thread with the continuation prompt', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-suspend-'));
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
else if(message.method==='thread/start'){if(message.params.dynamicTools.some(tool=>tool.name==='run_job'))process.exit(4);if(message.params.sandbox!=='read-only'||message.params.developerInstructions!=='COORDINATE')process.exit(5);send({id:message.id,result:{thread:{id:'thread-c'}}});}
else if(message.method==='turn/start'){turnStarts++;const turnId='turn-'+turnStarts;send({id:message.id,result:{turn:{id:turnId}}});if(turnStarts===1)send({id:910,method:'item/tool/call',params:{threadId:'thread-c',turnId,callId:'call-1',tool:'dispatch_worker',arguments:{decision:{decision:'dispatch'}}}});else{if(!message.params.input[0].text.startsWith('WORKER_COMPLETED'))process.exit(6);send({method:'thread/tokenUsage/updated',params:{threadId:'thread-c',turnId,tokenUsage:{total:{inputTokens:30,cachedInputTokens:10,cacheWriteInputTokens:0,outputTokens:6,reasoningOutputTokens:1},last:{inputTokens:12,cachedInputTokens:4,cacheWriteInputTokens:0,outputTokens:2,reasoningOutputTokens:0}}}});send({method:'item/completed',params:{threadId:'thread-c',turnId,item:{type:'agentMessage',text:'{"decision":"ready"}'}}});send({method:'turn/completed',params:{threadId:'thread-c',turn:{id:turnId,status:'completed'}}});}}
else if(message.id===910){if(message.result?.success!==true||!/dispatched/.test(message.result.contentItems[0].text))process.exit(7);send({id:911,method:'item/tool/call',params:{threadId:'thread-c',turnId:'turn-1',callId:'call-2',tool:'dispatch_worker',arguments:{decision:{}}}});}
else if(message.id===911){if(message.result?.success!==false)process.exit(8);}
else if(message.method==='turn/interrupt'){send({id:message.id,result:{}});send({method:'turn/completed',params:{threadId:'thread-c',turn:{id:message.params.turnId,status:'interrupted'}}});}
});`,
  );
  let resolveWorker!: () => void;
  const settled = new Promise<void>((resolve) => {
    resolveWorker = resolve;
  });
  const events: string[] = [];
  const usages: Array<number | undefined> = [];
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
    hostTools: [
      {
        name: 'dispatch_worker',
        description: 'Dispatch',
        inputSchema: { type: 'object' },
        call: async () => ({
          suspend: true as const,
          acknowledgement: 'Worker dispatched.',
          continuation: settled.then(() => ({
            prompt: 'WORKER_COMPLETED {"checks":[]}',
          })),
        }),
      },
    ],
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'read-only',
    instructions: 'COORDINATE',
    hostJobs: false,
  });
  const turn = driver.startTurn(thread, {
    prompt: 'prepare',
    onEvent: (event) => {
      events.push(event.type);
      if (event.type === 'turn-completed')
        usages.push(event.usage?.inputTokens);
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(events, [
    'turn-started',
    'activity',
    'tool-suspended',
    'activity',
    'turn-completed',
  ]);
  resolveWorker();
  const result = await turn.completion;
  assert.equal(result.turnId, 'turn-2');
  assert.equal(result.finalOutput, '{"decision":"ready"}');
  assert.equal(result.usage?.inputTokens, 30);
  assert.deepEqual(events, [
    'turn-started',
    'activity',
    'tool-suspended',
    'activity',
    'turn-completed',
    'tool-resumed',
    'turn-started',
    'activity',
    'turn-completed',
  ]);
  assert.deepEqual(usages, [undefined, 12]);
});

void test('a suspending Host tool can settle the logical turn without another physical turn', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-settle-'));
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
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-s'}}});
else if(message.method==='turn/start'){turnStarts++;if(turnStarts>1)process.exit(9);send({id:message.id,result:{turn:{id:'turn-1'}}});send({id:920,method:'item/tool/call',params:{threadId:'thread-s',turnId:'turn-1',callId:'call-1',tool:'dispatch_worker',arguments:{}}});}
else if(message.method==='turn/interrupt'){send({id:message.id,result:{}});send({method:'turn/completed',params:{threadId:'thread-s',turn:{id:message.params.turnId,status:'interrupted'}}});}
});`,
  );
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
    hostTools: [
      {
        name: 'dispatch_worker',
        description: 'Dispatch',
        inputSchema: { type: 'object' },
        call: async () => ({
          suspend: true as const,
          acknowledgement: 'Worker dispatched.',
          continuation: new Promise((resolve) =>
            setTimeout(() => resolve({ finalOutput: 'HOST_SETTLED' }), 50),
          ),
        }),
      },
    ],
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'read-only',
    hostJobs: false,
  });
  const events: string[] = [];
  const result = await driver.startTurn(thread, {
    prompt: 'prepare',
    onEvent: (event) => events.push(event.type),
  }).completion;
  assert.equal(result.finalOutput, 'HOST_SETTLED');
  assert.equal(result.turnId, 'turn-1');
  assert.deepEqual(events, [
    'turn-started',
    'activity',
    'tool-suspended',
    'turn-completed',
    'tool-resumed',
  ]);
});

void test('a thread without Host jobs rejects run_job instead of starting a process', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-nojobs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-n'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-1'}}});send({id:930,method:'item/tool/call',params:{threadId:'thread-n',turnId:'turn-1',callId:'call-1',tool:'run_job',arguments:{label:'x',executable:process.execPath,arguments:['-e','1']}}});}
else if(message.id===930){send({method:'item/completed',params:{threadId:'thread-n',turnId:'turn-1',item:{type:'agentMessage',text:message.result.success===false?'REJECTED':'STARTED'}}});send({method:'turn/completed',params:{threadId:'thread-n',turn:{id:'turn-1',status:'completed'}}});}
});`,
  );
  let jobs = 0;
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs'), () => {
        jobs++;
      }),
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'read-only',
    hostJobs: false,
  });
  const result = await driver.startTurn(thread, { prompt: 'x' }).completion;
  assert.equal(result.finalOutput, 'REJECTED');
  assert.equal(jobs, 0);
});

void test('a suspended logical turn is rejected when the App Server exits before the continuation settles', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-exit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-server.mjs');
  await writeFile(
    server,
    `import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin});
function send(value){process.stdout.write(JSON.stringify(value)+'\\n')}
rl.on('line',line=>{const message=JSON.parse(line);
if(message.method==='initialize')send({id:message.id,result:{}});
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-x'}}});
else if(message.method==='turn/start'){send({id:message.id,result:{turn:{id:'turn-1'}}});send({id:940,method:'item/tool/call',params:{threadId:'thread-x',turnId:'turn-1',callId:'call-1',tool:'dispatch_worker',arguments:{}}});}
else if(message.method==='turn/interrupt'){send({id:message.id,result:{}});send({method:'turn/completed',params:{threadId:'thread-x',turn:{id:'turn-1',status:'interrupted'}}});setTimeout(()=>process.exit(0),50);}
});`,
  );
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
    hostTools: [
      {
        name: 'dispatch_worker',
        description: 'Dispatch',
        inputSchema: { type: 'object' },
        call: async () => ({
          suspend: true as const,
          acknowledgement: 'Worker dispatched.',
          continuation: new Promise(() => {}),
        }),
      },
    ],
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'read-only',
    hostJobs: false,
  });
  const events: string[] = [];
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('logical turn never settled')), 1500),
  );
  await assert.rejects(
    () =>
      Promise.race([
        driver.startTurn(thread, {
          prompt: 'prepare',
          onEvent: (event) => events.push(event.type),
        }).completion,
        timeout,
      ]),
    /Codex App Server exited/,
  );
  assert.deepEqual(events, [
    'turn-started',
    'activity',
    'tool-suspended',
    'turn-completed',
  ]);
});

void test('a continuation turn without its own token update reports no inherited usage', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-server-usage-'));
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
else if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread-u'}}});
else if(message.method==='turn/start'){turnStarts++;const turnId='turn-'+turnStarts;send({id:message.id,result:{turn:{id:turnId}}});if(turnStarts===1){send({method:'thread/tokenUsage/updated',params:{threadId:'thread-u',turnId,tokenUsage:{total:{inputTokens:10,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:1,reasoningOutputTokens:0},last:{inputTokens:10,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:1,reasoningOutputTokens:0}}}});send({id:950,method:'item/tool/call',params:{threadId:'thread-u',turnId,callId:'call-1',tool:'dispatch_worker',arguments:{}}});}else{send({method:'item/completed',params:{threadId:'thread-u',turnId,item:{type:'agentMessage',text:'DONE'}}});send({method:'turn/completed',params:{threadId:'thread-u',turn:{id:turnId,status:'completed'}}});}}
else if(message.method==='turn/interrupt'){send({id:message.id,result:{}});send({method:'turn/completed',params:{threadId:'thread-u',turn:{id:message.params.turnId,status:'interrupted'}}});}
});`,
  );
  const driver = new CodexAppServerDriver({
    command: process.execPath,
    arguments: [server],
    brokerFactory: (input) =>
      new HostJobBroker(input.workingDirectory, path.join(root, 'jobs')),
    hostTools: [
      {
        name: 'dispatch_worker',
        description: 'Dispatch',
        inputSchema: { type: 'object' },
        call: async () => ({
          suspend: true as const,
          acknowledgement: 'Worker dispatched.',
          continuation: Promise.resolve({ prompt: 'WORKER_COMPLETED' }),
        }),
      },
    ],
  });
  t.after(() => driver.close());
  const thread = await driver.startThread({
    profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    workingDirectory: root,
    access: 'read-only',
    hostJobs: false,
  });
  const usages: Array<number | null> = [];
  const result = await driver.startTurn(thread, {
    prompt: 'prepare',
    onEvent: (event) => {
      if (event.type === 'turn-completed')
        usages.push(event.usage?.inputTokens ?? null);
    },
  }).completion;
  assert.equal(result.finalOutput, 'DONE');
  assert.deepEqual(usages, [10, null]);
  assert.equal(result.usage?.inputTokens, 10);
});

async function readdirOne(directory: string) {
  const entries = await import('node:fs/promises').then((fs) =>
    fs.readdir(directory),
  );
  assert.equal(entries.length, 1);
  return entries[0];
}
