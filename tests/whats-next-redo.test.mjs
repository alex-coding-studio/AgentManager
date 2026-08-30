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
  resolveWhatsNextReplacement,
  cancelWhatsNextRun,
} = await import('../lib/whats-next-runs.ts');
const { redoProposalPlan, redoProposalContext } =
  await import('../lib/whats-next-redo.ts');

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

async function fixture(work) {
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
process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{
 if(process.env.REDO_TEST_MODE==='fail'){console.log(JSON.stringify({type:'turn.failed',error:{message:'Fixture failure'}}));return;}
 const {packet}=JSON.parse(fs.readFileSync('request.json','utf8'));
 const candidates=Array.from({length:packet.proposalCorrection?3:2},(_,i)=>({candidateId:'CANDIDATE-000'+(i+1),revision:1,type:'direction',title:'Direction '+(i+1),summary:'A concrete next direction.',derivedFrom:packet.origins.map(n=>n.id),dependsOn:[],resources:packet.resources.filter(r=>r.kind==='previous-proposal').map(r=>({kind:r.kind,path:r.path})),typeTemplateRef:null,metadata:{},presentation:{},assumptions:[],outputMarkdown:'# Direction '+(i+1)+'\\n\\nA concrete next direction.\\n\\n## Why this direction\\n\\n- Resolve the current uncertainty.\\n- Keep the next step bounded.\\n\\n## Assumptions\\n\\n- None'}));
 const result={schemaVersion:1,harness:{id:'agent-manager.whats-next',revision:3},request:packet.request,outcome:'proposal',reflection:{markdown:'The previous directions misunderstood the user.',continuationAdvice:{action:'continue',recommendedFocus:'compare',reason:'Compare the corrected choices.'}},exploration:{consideredNodeIds:packet.origins.map(n=>n.id),notes:[]},candidates};
 console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-session'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
},process.env.REDO_TEST_MODE==='slow'?10000:80));
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

async function finished(project, run) {
  for (let i = 0; i < 200; i++) {
    const value = await readWhatsNextRun(project, run.runId);
    if (!['running', 'validating'].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('Fixture Run did not finish');
}

void test('whole-proposal redo preserves originals until confirmation, then replaces 2 with 3 and blocks after acceptance', async () =>
  fixture(async ({ project, input, original, root }) => {
    const oldFile = path.join(
      project.planningPath,
      'whats-next/runs',
      original.runId,
      'run.json',
    );
    const oldText = await readFile(oldFile, 'utf8');
    const started = await startWhatsNextRun(project, {
      ...input,
      redoProposal: true,
      instruction:
        'Do not repeat the product value. I want to build my own website and do not know where to begin.',
    });
    await assert.rejects(
      () =>
        acceptWhatsNextCandidate(
          project,
          original.runId,
          original.result.candidates[0].candidateId,
        ),
      /pending/,
    );
    await assert.rejects(
      () => startWhatsNextRun(project, { ...input, redoProposal: true }),
      /pending/,
    );
    const ready = await finished(project, started);
    assert.equal(ready.status, 'proposal', ready.error);
    assert.notEqual(ready.sessionId, original.sessionId);
    assert.equal(ready.replacement.state, 'pending');
    assert.equal(ready.result.candidates.length, 3);
    assert.equal(await readFile(oldFile, 'utf8'), oldText);
    await assert.rejects(
      () =>
        acceptWhatsNextCandidate(
          project,
          ready.runId,
          ready.result.candidates[0].candidateId,
        ),
      /Confirm/,
    );
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
    assert.equal(request.packet.operation, 'explore');
    assert.ok(request.packet.proposalCorrection);
    const prior = request.packet.contextWorkspace.primary.find(
      (r) => r.kind === 'previous-proposal',
    );
    assert.ok(prior);
    const expectedContext = redoProposalContext(
      redoProposalPlan(
        await listTaskGraphNodes(project, 'whats-next'),
        [original],
        input.sourceNodeIds,
      ),
    );
    assert.equal(
      await readFile(
        path.join(project.planningPath, prior.logicalPath),
        'utf8',
      ),
      expectedContext.markdown,
    );
    assert.ok(
      expectedContext.responseMarkdown.includes(
        original.result.reflection.continuationAdvice.reason,
      ),
    );
    assert.match(
      await readFile(
        path.join(project.planningPath, prior.logicalPath),
        'utf8',
      ),
      /Direction 1/,
    );
    const applied = await resolveWhatsNextReplacement(
      project,
      ready.runId,
      'replace-proposal',
    );
    assert.equal(applied.run.replacement.state, 'applied');
    await assert.rejects(() => access(oldFile));
    assert.ok(
      (await readdir(path.join(root, 'trash'))).some((name) =>
        name.startsWith(original.runId),
      ),
    );
    const latest = await listLatestWhatsNextRuns(project);
    assert.ok(!latest.some((run) => run.runId === original.runId));
    for (const c of applied.run.result.candidates)
      for (const r of c.resources)
        await access(path.join(project.planningPath, r.path));
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

void test('keep-original, provider failure and cancellation never replace the original proposal', async () =>
  fixture(async ({ project, input, original }) => {
    const oldFile = path.join(
      project.planningPath,
      'whats-next/runs',
      original.runId,
      'run.json',
    );
    const originalText = await readFile(oldFile, 'utf8');
    const replacement = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    await resolveWhatsNextReplacement(
      project,
      replacement.runId,
      'keep-original',
    );
    assert.equal(await readFile(oldFile, 'utf8'), originalText);
    process.env.REDO_TEST_MODE = 'fail';
    const failed = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    assert.equal(failed.status, 'failed');
    await assert.rejects(
      () =>
        resolveWhatsNextReplacement(project, failed.runId, 'replace-proposal'),
      /successful proposal/,
    );
    assert.equal(await readFile(oldFile, 'utf8'), originalText);
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
    assert.equal(await readFile(oldFile, 'utf8'), originalText);
  }));

void test('confirmation rechecks the original revision and external dependents', async () =>
  fixture(async ({ project, input, original }) => {
    const pending = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    const oldFile = path.join(
      project.planningPath,
      'whats-next/runs',
      original.runId,
      'run.json',
    );
    const text = await readFile(oldFile, 'utf8');
    const changed = JSON.parse(text);
    changed.result.candidates[0].revision++;
    await writeFile(oldFile, JSON.stringify(changed));
    await assert.rejects(
      () =>
        resolveWhatsNextReplacement(project, pending.runId, 'replace-proposal'),
      /changed/,
    );
    await access(oldFile);
    await writeFile(oldFile, text);
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
    await resolveWhatsNextReplacement(project, pending.runId, 'keep-original');
  }));

void test('a cleanup failure cannot resurrect old proposals after another replacement', async () =>
  fixture(async ({ project, input, original }) => {
    const first = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    process.env.REDO_TEST_TRASH_FAIL = 'yes';
    const applied = await resolveWhatsNextReplacement(
      project,
      first.runId,
      'replace-proposal',
    );
    assert.ok(applied.run.cleanupWarning);
    assert.ok(
      !(await listLatestWhatsNextRuns(project)).some(
        (run) => run.runId === original.runId,
      ),
    );
    delete process.env.REDO_TEST_TRASH_FAIL;
    const second = await finished(
      project,
      await startWhatsNextRun(project, { ...input, redoProposal: true }),
    );
    assert.ok(second.replacement.runIds.includes(original.runId));
    await resolveWhatsNextReplacement(
      project,
      second.runId,
      'replace-proposal',
    );
    const visible = await listLatestWhatsNextRuns(project);
    assert.deepEqual(
      visible.map((run) => run.runId),
      [second.runId],
    );
  }));
