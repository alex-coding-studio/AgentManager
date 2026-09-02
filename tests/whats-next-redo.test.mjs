import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-redo-hooks.mjs';
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
const {
  startTaskDecompositionRun,
  readTaskDecompositionRun,
  acceptTaskDecompositionCandidate,
  discardTaskDecompositionCandidate,
} = await import('../lib/task-decomposition-runs.ts');

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
    const readModuleInstructions = async (run) => {
      const request = await readPacket(run);
      const reference = request.packet.content.references.find(
        (entry) => entry.kind === 'module-instructions',
      );
      return reference
        ? readFile(
            path.join(
              project.planningPath,
              'whats-next/runs',
              run.runId,
              'context',
              reference.workspacePath,
            ),
            'utf8',
          )
        : '';
    };
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
    assert.equal(await readModuleInstructions(first), 'Use Chinese.');
    assert.equal(first.input.moduleInstructionsState, 'present');
    assert.equal(
      await readModuleInstructions(original),
      'Initial project rule.',
    );
    assert.equal(original.input.moduleInstructionsState, 'present');
    const next = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.equal(next.sessionId, original.sessionId);
    assert.equal(
      await readModuleInstructions(next),
      'Use concise explanations.',
    );
    await saveWhatsNextInstructions(project, '');
    const cleared = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    const packet = (await readPacket(cleared)).packet;
    assert.equal(Object.hasOwn(packet, 'projectInstructions'), false);
    assert.equal(packet.moduleInstructionsState, 'cleared');
    assert.equal(await readModuleInstructions(cleared), '');
    assert.equal(packet.graphMap, undefined);
    assert.equal(await readModuleInstructions(first), 'Use Chinese.');
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
  const context = redoProposalContext(
    {
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
    },
    '# User Input\n\nBuild a personal local website\n',
  );
  assert.equal(
    context.userInput,
    '# User Input\n\nBuild a personal local website',
  );
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
  if(message.id===3)console.log(JSON.stringify({id:3,result:{config:{sandbox_mode:'workspace-write'}}}));
  if(message.id===2)console.log(JSON.stringify({id:2,result:{data:[{cwd:message.params.cwds[0],skills:[{name:'fixture:available',description:'Available when relevant.',path:'/fixture/SKILL.md',enabled:true}],errors:[]}]}}));
 });
}else{
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);
process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{
 fs.writeFileSync('fixture-prompt.txt',input);
 if(process.env.REDO_TEST_MODE==='fail'){console.log(JSON.stringify({type:'turn.failed',error:{message:'Fixture failure'}}));return;}
	 const {packet}=JSON.parse(fs.readFileSync('request.json','utf8'));
 fs.writeFileSync('fixture-argv.json',JSON.stringify(process.argv.slice(2)));
	 if(!packet.origins){const workingSet=packet.workingSet||[];const count=packet.operation==='recompose-candidates'?1:(packet.motion==='diverge'?2:1);const base=packet.operation==='recompose-candidates'?9000:8000;const candidates=Array.from({length:count},(_,i)=>({candidateId:'CANDIDATE-'+String(base+i+1),revision:1,type:'module',title:'Module '+(i+1),summary:'A coherent module boundary.',derivedFrom:[packet.currentNode.id],dependsOn:[],resources:[],typeTemplateRef:null,metadata:{},presentation:{},assumptions:[]}));const recomposition=packet.operation==='recompose-candidates'?{effects:[{kind:workingSet.length>1?'merge':'replace',from:workingSet.map(item=>item.candidateId),to:[candidates[0].candidateId]}]}:undefined;const result={schemaVersion:1,harness:{id:'agent-manager.task-decomposition',revision:8},request:packet.request,impactReview:{reviewedNodeIds:[],affectedNodeIds:[],notes:[]},outcome:'proposal',candidates,...(recomposition?{recomposition}:{})};console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-decomposition-session'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));return;}
	 const candidateBase=packet.intention==='feature-synthesis'?1000:packet.intention==='product-design-completion'?2000:0;
	 const packetResources=[...(packet.content?.references||[]),...(packet.content?.external||[])];
	 const candidates=Array.from({length:packet.revisionTarget?1:(packet.motion==='converge'?1:(packet.proposalCorrection?3:2))},(_,i)=>({candidateId:packet.revisionTarget?.candidateId||('CANDIDATE-'+String(candidateBase+i+1).padStart(4,'0')),revision:packet.revisionTarget?.requiredRevision||1,type:packet.destination.artifactKind,layer:packet.destination.layer,artifactKind:packet.destination.artifactKind,title:'Direction '+(i+1),summary:'A concrete next direction.',derivedFrom:packet.origins.map(n=>n.id),dependsOn:[],resources:packetResources.filter(r=>r.kind==='previous-proposal').map(r=>({kind:r.kind,path:r.logicalPath})),typeTemplateRef:null,metadata:{},presentation:{},assumptions:[],outputMarkdown:'# Direction '+(i+1)+'\\n\\nA concrete next direction.\\n\\n## Why this direction\\n\\n- Resolve the current uncertainty.\\n- Keep the next step bounded.\\n\\n## Assumptions\\n\\n- None'}));
 if(process.env.REDO_TEST_MODE==='invalid-result')candidates[0].outputMarkdown='# Direction 1\\n\\nMissing required sections.';
	 const result={schemaVersion:1,harness:{id:'agent-manager.whats-next',revision:8},request:packet.request,outcome:'proposal',reflection:{markdown:'The previous directions misunderstood the user.',continuationAdvice:{action:'continue',recommendedFocus:'compare',reason:'Compare the corrected choices.'}},exploration:{consideredNodeIds:packet.origins.map(n=>n.id),notes:[]},candidates};
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
    const selected = {
      ...input,
      instruction: `Explore useful directions.\n\n${'x'.repeat(25_000)}`,
      model: 'test-model',
      effort: 'high',
    };
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
    const request = JSON.parse(
      await readFile(artifact(first, 'request.json'), 'utf8'),
    );
    assert.deepEqual(request.profile, first.profile);
    assert.equal(Object.hasOwn(request.packet, 'instruction'), false);
    assert.equal(
      request.packet.content.input.workspacePath,
      'input/user-input.md',
    );
    const packagedUserInput = await readFile(
      path.join(
        artifact(first, 'context'),
        request.packet.content.input.workspacePath,
      ),
      'utf8',
    );
    assert.ok(packagedUserInput.length > 25_000);
    assert.doesNotMatch(request.prompt, /xxxxxxxxxxxxxxxx/);
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

void test('a Source-only Run promotes the Source Markdown as its User Input', async () =>
  fixture(async ({ project, input }) => {
    const run = await finished(
      project,
      await startWhatsNextRun(project, { ...input, instruction: '' }),
    );
    const request = JSON.parse(
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
    assert.equal(request.packet.content.input.kind, 'user-input');
    assert.match(
      request.packet.content.input.logicalPath,
      /nodes\/NODE-[0-9a-f]+\/resources\/user-input\.md$/,
    );
    assert.equal(
      request.packet.content.references.some(
        (entry) =>
          entry.logicalPath === request.packet.content.input.logicalPath,
      ),
      false,
    );
    assert.equal(Object.hasOwn(request.packet, 'instruction'), false);
  }));

void test('Source-only Product Design Completion exposes an explicit zero-Feature readiness state', async () =>
  fixture(async ({ project, input }) => {
    const completion = await finished(
      project,
      await startWhatsNextRun(project, {
        ...input,
        instruction:
          'Define how a user records the first location relationship.',
        intention: 'product-design-completion',
        motion: 'unspecified',
      }),
    );
    const request = JSON.parse(
      await readFile(
        path.join(
          project.planningPath,
          'whats-next/runs',
          completion.runId,
          'request.json',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(request.packet.implicitProductDesignContext, {
      sourceNodeId: input.sourceNodeIds[0],
      featureNodeIds: [],
    });
    assert.match(request.prompt, /first Product Design pass/);
    assert.match(request.prompt, /return one bounded clarification/);
    assert.equal(completion.result.candidates.length, 2);
  }));

void test('Product Design Completion injects the Source and accepted Product Design as primary Context', async () =>
  fixture(async ({ project, input, original }) => {
    assert.equal(original.result.outcome, 'proposal');
    const discovery = [];
    for (const candidate of original.result.candidates) {
      const accepted = await acceptWhatsNextCandidate(
        project,
        original.runId,
        candidate.candidateId,
      );
      discovery.push(accepted.node.id);
    }
    const synthesis = await finished(
      project,
      await startWhatsNextRun(project, {
        ...input,
        sourceNodeIds: discovery,
        instruction: 'Synthesize one Feature.',
        intention: 'feature-synthesis',
        motion: 'converge',
      }),
    );
    assert.equal(synthesis.result.outcome, 'proposal');
    const acceptedFeature = await acceptWhatsNextCandidate(
      project,
      synthesis.runId,
      synthesis.result.candidates[0].candidateId,
    );
    const completion = await finished(
      project,
      await startWhatsNextRun(project, {
        ...input,
        instruction: 'The product does not define deletion yet.',
        intention: 'product-design-completion',
        motion: 'converge',
      }),
    );
    const request = JSON.parse(
      await readFile(
        path.join(
          project.planningPath,
          'whats-next/runs',
          completion.runId,
          'request.json',
        ),
        'utf8',
      ),
    );
    assert.deepEqual(request.packet.implicitProductDesignContext, {
      sourceNodeId: input.sourceNodeIds[0],
      featureNodeIds: [acceptedFeature.node.id],
    });
    const primaryPaths = request.packet.content.references.map(
      (entry) => entry.logicalPath,
    );
    assert.ok(
      primaryPaths.includes(
        `whats-next/nodes/${input.sourceNodeIds[0]}/resources/user-input.md`,
      ),
    );
    assert.ok(
      primaryPaths.includes(
        `whats-next/nodes/${acceptedFeature.node.id}/output.md`,
      ),
    );
    await assert.rejects(
      () =>
        startWhatsNextRun(project, {
          ...input,
          sourceNodeIds: [acceptedFeature.node.id],
          instruction: 'Complete the product from one Feature.',
          intention: 'product-design-completion',
          motion: 'converge',
        }),
      /must start from the Product Source/,
    );
    const independent = await finished(
      project,
      await startWhatsNextRun(project, {
        ...input,
        instruction: 'Another distinct product gap.',
        intention: 'product-design-completion',
        motion: 'converge',
      }),
    );
    assert.notEqual(independent.sessionId, completion.sessionId);
    const refinement = await finished(
      project,
      await startWhatsNextRun(project, {
        ...input,
        sourceNodeIds: completion.result.candidates[0].derivedFrom,
        instruction: 'Resolve the remaining question only.',
        intention: 'product-design-completion',
        motion: 'converge',
        revisionRunId: completion.runId,
        revisionCandidateId: completion.result.candidates[0].candidateId,
      }),
    );
    assert.equal(refinement.sessionId, completion.sessionId);
  }));

void test('failed validation retains the raw Agent output for recovery', async () =>
  fixture(async ({ project, input }) => {
    process.env.REDO_TEST_MODE = 'invalid-result';
    const failed = await finished(
      project,
      await startWhatsNextRun(project, input),
    );
    assert.equal(failed.status, 'failed');
    assert.match(failed.error, /Candidate Markdown/);
    const raw = await readFile(
      path.join(
        project.planningPath,
        'whats-next/runs',
        failed.runId,
        'agent-output.txt',
      ),
      'utf8',
    );
    assert.match(raw, /Missing required sections/);
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
    const sourceOnly = await finished(
      project,
      await startTaskDecompositionRun(project, {
        sourceNodeId: source.id,
        agent: 'codex',
        instruction: '',
        contextRefs: [],
        files: [],
        intention: 'understanding',
      }),
      readTaskDecompositionRun,
    );
    const sourceRequest = JSON.parse(
      await readFile(
        path.join(
          project.planningPath,
          'task-decomposition/runs',
          sourceOnly.runId,
          'request.json',
        ),
        'utf8',
      ),
    );
    assert.equal(sourceRequest.packet.content.input.kind, 'user-input');
    assert.match(
      sourceRequest.packet.content.input.logicalPath,
      /nodes\/NODE-[0-9a-f]+\/resources\/user-input\.md$/,
    );
    const input = {
      sourceNodeId: source.id,
      agent: 'codex',
      model: 'test-model',
      effort: 'max',
      instruction: `Find boundaries\n\n${'x'.repeat(25_000)}`,
      contextRefs: [],
      files: [],
      intention: 'delivery',
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
    assert.equal(first.intention, 'delivery');
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
    const request = JSON.parse(
      await readFile(artifact(first, 'request.json'), 'utf8'),
    );
    assert.deepEqual(request.profile, first.profile);
    assert.equal(request.packet.intention, 'delivery');
    assert.equal(Object.hasOwn(request.packet, 'instruction'), false);
    assert.equal(request.packet.content.input.kind, 'user-input');
    assert.equal(first.input.userInputPath, 'input/user-input.md');
    assert.ok(
      (
        await readFile(
          path.join(artifact(first, 'context'), first.input.userInputPath),
          'utf8',
        )
      ).length > 25_000,
    );
    assert.doesNotMatch(request.prompt, /xxxxxxxxxxxxxxxx/);
    assert.match(request.prompt, /INTENTION PROFILE — Delivery breakdown/);
    const continued = await finished(
      project,
      await startTaskDecompositionRun(project, {
        ...input,
        operation: 'append-candidates',
      }),
      readTaskDecompositionRun,
    );
    assert.equal(continued.sessionId, first.sessionId);
    const changedIntention = await finished(
      project,
      await startTaskDecompositionRun(project, {
        ...input,
        operation: 'append-candidates',
        intention: 'understanding',
      }),
      readTaskDecompositionRun,
    );
    assert.notEqual(changedIntention.sessionId, continued.sessionId);
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

void test('Break It Down atomically recomposes an unaccepted Candidate working set', async () =>
  fixture(async ({ project }) => {
    const created = await createStartNode(project, {
      title: 'Recompose goal',
      idea: 'A product with overlapping module boundaries.',
      contextRefs: [],
      files: [],
    });
    const source = created.node ?? created;
    const initial = await finished(
      project,
      await startTaskDecompositionRun(project, {
        sourceNodeId: source.id,
        agent: 'codex',
        instruction: 'Show two alternative module boundaries.',
        contextRefs: [],
        files: [],
        intention: 'understanding',
        motion: 'diverge',
      }),
      readTaskDecompositionRun,
    );
    assert.equal(initial.status, 'proposal', initial.error);
    assert.equal(initial.result.candidates.length, 2);
    const selectedIds = initial.result.candidates.map(
      (candidate) => candidate.candidateId,
    );
    const recomposed = await finished(
      project,
      await startTaskDecompositionRun(project, {
        sourceNodeId: source.id,
        agent: 'codex',
        instruction: 'Merge these overlapping boundaries.',
        contextRefs: [],
        files: [],
        intention: 'understanding',
        motion: 'converge',
        recomposeCandidateIds: selectedIds,
      }),
      readTaskDecompositionRun,
    );
    assert.equal(recomposed.status, 'proposal', recomposed.error);
    assert.equal(recomposed.operation, 'recompose-candidates');
    assert.deepEqual(recomposed.recomposeCandidateIds, selectedIds);
    assert.equal(recomposed.result.candidates.length, 1);
    assert.equal(recomposed.result.recomposition.effects[0].kind, 'merge');
    await assert.rejects(
      () =>
        discardTaskDecompositionCandidate(
          project,
          recomposed.runId,
          recomposed.result.candidates[0].candidateId,
        ),
      /one atomic working set and cannot be discarded individually/,
    );
    await assert.rejects(
      () =>
        acceptTaskDecompositionCandidate(
          project,
          initial.runId,
          selectedIds[0],
        ),
      /replaced or removed by Recompose/,
    );
    const accepted = await acceptTaskDecompositionCandidate(
      project,
      recomposed.runId,
      recomposed.result.candidates[0].candidateId,
    );
    assert.equal(
      accepted.node.provenance.candidateId,
      recomposed.result.candidates[0].candidateId,
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
      `# User Input\n\n${input.instruction}\n`,
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
    const prior = request.packet.content.references.find(
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
