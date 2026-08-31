import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  access,
  rm,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/'))
      return {
        url: pathToFileURL(path.join(repo, specifier.slice(2) + '.ts')).href,
        shortCircuit: true,
      };
    if (specifier === 'trash')
      return {
        url:
          'data:text/javascript,' +
          encodeURIComponent(
            `import {rename,mkdir} from 'node:fs/promises'; import path from 'node:path'; import {randomUUID} from 'node:crypto'; export default async function trash(paths){const root=process.env.REDO_TEST_ROOT; if(!root)throw Error('Test trash has no root'); if(process.env.REDO_TEST_TRASH_FAIL)throw Error('Fixture trash failure'); await mkdir(path.join(root,'trash'),{recursive:true}); for(const file of [paths].flat()){if(!file.startsWith(root+'/'))throw Error('Refusing non-test trash');await rename(file,path.join(root,'trash',path.basename(file)+'-'+randomUUID()));}}`,
          ),
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { createStartNode, listTaskGraphNodes } =
  await import('../lib/task-graph.ts');
const {
  startWhatsNextRun,
  readWhatsNextRun,
  listLatestWhatsNextRuns,
  acceptWhatsNextCandidate,
  cancelWhatsNextRun,
} = await import('../lib/whats-next-runs.ts');
const { redoProposalPlan, redoProposalContext } =
  await import('../lib/whats-next-redo.ts');
const { saveWhatsNextInstructions } =
  await import('../lib/whats-next-context.ts');
const { startTaskDecompositionRun, readTaskDecompositionRun } =
  await import('../lib/task-decomposition-runs.ts');

void test('continued Runs receive current Instructions, clearing is explicit, and running snapshots stay unchanged', async () =>
  fixture(async ({ project, input, original }) => {
    await saveWhatsNextInstructions(project, 'Use Chinese.');
    const running = await startWhatsNextRun(project, input);
    await saveWhatsNextInstructions(project, 'Use concise explanations.');
    const first = await finished(project, running);
    const readPacket = async (run) =>
      JSON.parse(
        await readFile(
          path.join(
            project.planningPath,
            'whats-next/runs',
            run.runId,
            'request.json',
          ),
          'utf8',
        ),
      );
    assert.equal(first.sessionId, original.sessionId);
    const actualPrompt = await readFile(
      path.join(
        project.planningPath,
        'whats-next/runs',
        first.runId,
        'fixture-prompt.txt',
      ),
      'utf8',
    );
    assert.match(actualPrompt, /fixture:available/);
    assert.match(actualPrompt, /not a request to invoke/);
    assert.equal(
      (await readPacket(first)).packet.projectInstructions,
      'Use Chinese.',
    );
    assert.equal(first.input.projectInstructions, 'Use Chinese.');
    assert.equal(
      (await readPacket(original)).packet.projectInstructions,
      'Initial project rule.',
    );
    assert.equal(original.input.projectInstructions, 'Initial project rule.');
    const next = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.equal(next.sessionId, original.sessionId);
    assert.equal(
      (await readPacket(next)).packet.projectInstructions,
      'Use concise explanations.',
    );
    await saveWhatsNextInstructions(project, '');
    const cleared = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    const packet = (await readPacket(cleared)).packet;
    assert.equal(Object.hasOwn(packet, 'projectInstructions'), true);
    assert.equal(packet.projectInstructions, '');
    assert.equal(packet.graphMap, undefined);
    assert.equal(
      (await readPacket(first)).packet.projectInstructions,
      'Use Chinese.',
    );
  }, 'Initial project rule.'));

void test('redo keeps the proposal instruction and complete last response without duplicating current outputs', () => {
  const original = {
    runId: 'original',
    operation: 'explore',
    startedAt: '2026-08-29T00:00:00Z',
    input: { instruction: 'Build a personal local website' },
  };
  const refined = {
    runId: 'refined',
    operation: 'refine-candidate',
    startedAt: '2026-08-29T00:01:00Z',
    input: { instruction: 'Only refine this card' },
    result: {
      outcome: 'proposal',
      reflection: {
        markdown: 'Last full reflection',
        continuationAdvice: {
          recommendedFocus: 'compare',
          reason: 'Last next-step recommendation',
        },
      },
      candidates: [{ outputMarkdown: '# Current A\n\nRefined output' }],
    },
  };
  const context = redoProposalContext({
    histories: [original, refined],
    targets: [
      {
        runId: 'refined',
        candidate: {
          candidateId: 'a',
          title: 'A',
          revision: 2,
          outputMarkdown: '# Current A\n\nRefined output',
        },
      },
      {
        runId: 'original',
        candidate: {
          candidateId: 'b',
          title: 'B',
          revision: 1,
          outputMarkdown: '# Current B\n\nUnchanged sibling',
        },
      },
    ],
  });
  assert.equal(context.instruction, 'Build a personal local website');
  assert.match(context.responseMarkdown, /Last full reflection/);
  assert.match(context.responseMarkdown, /Last next-step recommendation/);
  assert.match(context.markdown, /Unchanged sibling/);
  assert.equal(context.markdown.match(/Refined output/g).length, 1);
  assert.equal(context.outputs.length, 2);
});

async function fixture(work, initialInstructions) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'redo-proposal-test-'));
  const previousPath = process.env.PATH;
  try {
    process.env.REDO_TEST_ROOT = root;
    process.env.REDO_TEST_MODE = 'success';
    await mkdir(path.join(root, 'bin'));
    await writeFile(
      path.join(root, 'bin/codex'),
      `#!${process.execPath}
const fs=require('node:fs');
if(process.argv[2]==='app-server'){
 require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
  const message=JSON.parse(line);
  if(message.id===1)console.log(JSON.stringify({id:1,result:{}}));
  if(message.id===2)console.log(JSON.stringify({id:2,result:{data:[{cwd:message.params.cwds[0],skills:[{name:'fixture:available',description:'Available when relevant.',path:'/fixture/SKILL.md',enabled:true}],errors:[]}]}}));
 });
}else{
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{
 fs.writeFileSync('fixture-prompt.txt',input);
 if(process.env.REDO_TEST_MODE==='fail'){console.log(JSON.stringify({type:'turn.failed',error:{message:'Fixture failure'}}));return;}
 const {packet}=JSON.parse(fs.readFileSync('request.json','utf8'));
 fs.writeFileSync('fixture-argv.json',JSON.stringify(process.argv.slice(2)));
 if(!packet.origins){console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-decomposition-session'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));return;}
 const candidates=Array.from({length:packet.proposalCorrection?3:2},(_,i)=>({candidateId:'CANDIDATE-000'+(i+1),revision:1,type:'direction',title:'Direction '+(i+1),summary:'A concrete next direction.',derivedFrom:packet.origins.map(n=>n.id),dependsOn:[],resources:packet.resources.filter(r=>r.kind==='previous-proposal').map(r=>({kind:r.kind,path:r.path})),typeTemplateRef:null,metadata:{},presentation:{},assumptions:[],outputMarkdown:'# Direction '+(i+1)+'\\n\\nA concrete next direction.\\n\\n## Why this direction\\n\\n- Resolve the current uncertainty.\\n- Keep the next step bounded.\\n\\n## Assumptions\\n\\n- None'}));
 const result={schemaVersion:1,harness:{id:'agent-manager.whats-next',revision:3},request:packet.request,outcome:'proposal',reflection:{markdown:'The previous directions misunderstood the user.',continuationAdvice:{action:'continue',recommendedFocus:'compare',reason:'Compare the corrected choices.'}},exploration:{consideredNodeIds:packet.origins.map(n=>n.id),notes:[]},candidates};
 console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-session'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
},process.env.REDO_TEST_MODE==='slow'?10000:80));
}
`,
      { mode: 0o755 },
    );
    process.env.PATH = `${path.join(root, 'bin')}:${previousPath}`;
    const project = {
      id: 'test-project',
      name: 'Test',
      kind: 'standalone',
      rootPath: root,
      planningPath: path.join(root, 'planning'),
      codePath: null,
      description: '',
      createdAt: new Date().toISOString(),
    };
    const initial = await createStartNode(
      project,
      {
        title: 'Build my local website',
        idea: 'Build my local website',
        contextRefs: [],
        files: [],
      },
      'whats-next',
    );
    const source = initial.node ?? initial;
    const input = {
      sourceNodeIds: [source.id],
      instruction: 'Explore useful directions',
      agent: 'codex',
      contextRefs: [],
      files: [],
    };
    if (initialInstructions !== undefined)
      await saveWhatsNextInstructions(project, initialInstructions);
    const run = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.equal(run.status, 'proposal', run.error);
    await work({ project, input, original: run, root });
  } finally {
    process.env.PATH = previousPath;
    delete process.env.REDO_TEST_MODE;
    delete process.env.REDO_TEST_ROOT;
    delete process.env.REDO_TEST_TRASH_FAIL;
    await rm(root, { recursive: true, force: true });
  }
}

async function finished(project, run, reader = readWhatsNextRun) {
  for (let i = 0; i < 200; i++) {
    const value = await reader(project, run.runId);
    if (!['running', 'validating'].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('Fixture Run did not finish');
}

void test('What’s Next persists the requested model, forwards CLI flags, and isolates changed profiles', async () =>
  fixture(async ({ project, input, original }) => {
    const selected = { ...input, model: 'test-model', effort: 'high' };
    const first = await finished(
      project,
      await startWhatsNextRun(project, selected),
    );
    assert.notEqual(first.sessionId, original.sessionId);
    assert.deepEqual(first.profile, {
      agent: 'codex',
      model: 'test-model',
      effort: 'high',
    });
    const artifact = (run, name) =>
      path.join(project.planningPath, 'whats-next/runs', run.runId, name);
    const argv = JSON.parse(
      await readFile(artifact(first, 'fixture-argv.json'), 'utf8'),
    );
    assert.equal(argv[argv.indexOf('--model') + 1], 'test-model');
    assert.ok(argv.includes('model_reasoning_effort="high"'));
    assert.ok(!argv.includes('resume'));
    assert.deepEqual(
      JSON.parse(await readFile(artifact(first, 'request.json'), 'utf8'))
        .profile,
      first.profile,
    );
    const continued = await finished(
      project,
      await startWhatsNextRun(project, selected),
    );
    assert.equal(continued.sessionId, first.sessionId);
    const changed = await finished(
      project,
      await startWhatsNextRun(project, { ...selected, effort: 'low' }),
    );
    assert.notEqual(changed.sessionId, continued.sessionId);
    const defaults = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.notEqual(defaults.sessionId, changed.sessionId);
    assert.equal(defaults.profile.model, '');
    await assert.rejects(
      () => startWhatsNextRun(project, { ...input, model: 'bad;model' }),
      /configuration/,
    );
  }));

void test('Break It Down persists profiles, forwards flags, and resumes only matching selections', async () =>
  fixture(async ({ project }) => {
    const created = await createStartNode(project, {
      title: 'Decompose goal',
      idea: 'A small feature',
      contextRefs: [],
      files: [],
    });
    const source = created.node ?? created;
    const input = {
      sourceNodeId: source.id,
      agent: 'codex',
      model: 'test-model',
      effort: 'max',
      instruction: 'Find boundaries',
      contextRefs: [],
      files: [],
    };
    const first = await finished(
      project,
      await startTaskDecompositionRun(project, input),
      readTaskDecompositionRun,
    );
    assert.equal(first.status, 'failed');
    assert.ok(first.error);
    assert.equal(first.agentSessionId, 'fixture-decomposition-session');
    assert.deepEqual(first.profile, {
      agent: 'codex',
      model: 'test-model',
      effort: 'max',
    });
    const artifact = (run, name) =>
      path.join(
        project.planningPath,
        'task-decomposition/runs',
        run.runId,
        name,
      );
    const argv = JSON.parse(
      await readFile(artifact(first, 'fixture-argv.json'), 'utf8'),
    );
    assert.equal(argv[argv.indexOf('--model') + 1], 'test-model');
    assert.ok(argv.includes('model_reasoning_effort="max"'));
    assert.deepEqual(
      JSON.parse(await readFile(artifact(first, 'request.json'), 'utf8'))
        .profile,
      first.profile,
    );
    const continued = await finished(
      project,
      await startTaskDecompositionRun(project, {
        ...input,
        operation: 'append-candidates',
      }),
      readTaskDecompositionRun,
    );
    assert.equal(continued.sessionId, first.sessionId);
    const changed = await finished(
      project,
      await startTaskDecompositionRun(project, {
        ...input,
        operation: 'append-candidates',
        model: '',
      }),
      readTaskDecompositionRun,
    );
    assert.notEqual(changed.sessionId, continued.sessionId);
    await assert.rejects(
      () => startTaskDecompositionRun(project, { ...input, effort: 'invalid' }),
      /configuration/,
    );
  }));

void test('Re-propose trashes the previous proposal before generation and exposes new cards without another action', async () =>
  fixture(async ({ project, input, original, root }) => {
    const oldFile = path.join(
      project.planningPath,
      'whats-next/runs',
      original.runId,
      'run.json',
    );
    const expectedContext = redoProposalContext(
      redoProposalPlan(
        await listTaskGraphNodes(project, 'whats-next'),
        [original],
        input.sourceNodeIds,
      ),
    );
    const started = await startWhatsNextRun(project, {
      ...input,
      redoProposal: true,
      instruction: 'I want to build my own website. How do I begin?',
    });
    assert.equal(started.replacement.state, 'applied');
    await assert.rejects(() => access(oldFile));
    assert.ok(
      (await readdir(path.join(root, 'trash'))).some((name) =>
        name.startsWith(original.runId),
      ),
    );
    assert.ok(
      !(await listLatestWhatsNextRuns(project)).some(
        (run) => run.runId === original.runId,
      ),
    );
    await assert.rejects(
      () =>
        acceptWhatsNextCandidate(
          project,
          original.runId,
          original.result.candidates[0].candidateId,
        ),
      /no longer available/,
    );
    const ready = await finished(project, started);
    assert.equal(ready.status, 'proposal', ready.error);
    assert.equal(ready.result.candidates.length, 3);
    assert.notEqual(ready.sessionId, original.sessionId);
    const request = JSON.parse(
      await readFile(
        path.join(
          project.planningPath,
          'whats-next/runs',
          ready.runId,
          'request.json',
        ),
        'utf8',
      ),
    );
    const prior = request.packet.contextWorkspace.primary.find(
      (resource) => resource.kind === 'previous-proposal',
    );
    assert.equal(
      await readFile(
        path.join(project.planningPath, prior.logicalPath),
        'utf8',
      ),
      expectedContext.markdown,
    );
    for (const candidate of ready.result.candidates)
      for (const resource of candidate.resources)
        await access(path.join(project.planningPath, resource.path));
    const accepted = await acceptWhatsNextCandidate(
      project,
      ready.runId,
      ready.result.candidates[0].candidateId,
    );
    assert.equal(accepted.node.uid, ready.result.candidates[0].uid);
    await assert.rejects(
      () => startWhatsNextRun(project, { ...input, redoProposal: true }),
      /Formal Nodes/,
    );
  }));

void test('failed or canceled generation never restores deliberately abandoned proposals', async () =>
  fixture(async ({ project, input, original }) => {
    const oldFile = path.join(
      project.planningPath,
      'whats-next/runs',
      original.runId,
      'run.json',
    );
    process.env.REDO_TEST_MODE = 'fail';
    const failed = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    assert.equal(failed.status, 'failed');
    await assert.rejects(() => access(oldFile));
    assert.ok(
      !(await listLatestWhatsNextRuns(project)).some(
        (run) => run.runId === original.runId,
      ),
    );
    process.env.REDO_TEST_MODE = 'success';
    const retry = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.equal(retry.status, 'proposal');
    process.env.REDO_TEST_MODE = 'slow';
    const running = await startWhatsNextRun(project, {
      ...input,
      redoProposal: true,
    });
    await cancelWhatsNextRun(project, running.runId);
    assert.equal(
      (await readWhatsNextRun(project, running.runId)).status,
      'canceled',
    );
    await assert.rejects(() =>
      access(
        path.join(
          project.planningPath,
          'whats-next/runs',
          retry.runId,
          'run.json',
        ),
      ),
    );
  }));

void test('Formal children and external dependencies prevent abandonment before any files are removed', async () =>
  fixture(async ({ project, input, original }) => {
    const nodes = await listTaskGraphNodes(project, 'whats-next');
    const outsider = {
      ...structuredClone(original),
      runId: 'other',
      result: {
        ...structuredClone(original.result),
        candidates: [
          {
            ...structuredClone(original.result.candidates[0]),
            candidateId: 'CANDIDATE-abcdefab',
            uid: 'other',
            derivedFrom: [],
            relations: {
              derivedFrom: [],
              dependsOn: [original.result.candidates[0].uid],
            },
            dependsOn: [original.result.candidates[0].candidateId],
          },
        ],
      },
    };
    assert.throws(
      () => redoProposalPlan(nodes, [original, outsider], input.sourceNodeIds),
      /depend on/,
    );
    await acceptWhatsNextCandidate(
      project,
      original.runId,
      original.result.candidates[0].candidateId,
    );
    await assert.rejects(
      () => startWhatsNextRun(project, { ...input, redoProposal: true }),
      /Formal Nodes/,
    );
    await access(
      path.join(
        project.planningPath,
        'whats-next/runs',
        original.runId,
        'run.json',
      ),
    );
  }));

void test('Trash failure stops before Agent execution and reports failure without resurrecting abandoned cards', async () =>
  fixture(async ({ project, input, original }) => {
    process.env.REDO_TEST_TRASH_FAIL = 'yes';
    const failed = await startWhatsNextRun(project, {
      ...input,
      redoProposal: true,
    });
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /No Agent was started/);
    assert.equal(failed.agentSessionId, null);
    assert.equal(failed.usage, null);
    assert.ok(
      !(await listLatestWhatsNextRuns(project)).some(
        (run) => run.runId === original.runId,
      ),
    );
    await access(
      path.join(
        project.planningPath,
        'whats-next/runs',
        original.runId,
        'run.json',
      ),
    );
  }));

void test('a second Re-propose keeps previous abandonment records effective and supports retained context', async () =>
  fixture(async ({ project, input, original }) => {
    const first = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    const second = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    assert.equal(second.status, 'proposal', second.error);
    assert.ok(second.replacement.runIds.includes(original.runId));
    assert.ok(second.replacement.runIds.includes(first.runId));
    assert.deepEqual(
      (await listLatestWhatsNextRuns(project)).map((run) => run.runId),
      [second.runId],
    );
  }));
