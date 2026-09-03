import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { LocalAgentRunInput } from '../lib/local-agent-transport.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type { TaskGraphNode } from '../lib/task-graph.ts';
import {
  cancelWhatToDoRun,
  listLatestWhatToDoRuns,
  publishDeliveryMap,
  readWhatToDoRun,
  startWhatToDoRun,
  whatToDoAgentEnvironment,
} from '../lib/what-to-do-runs.ts';
import { readWhatToDoCurrentMap } from '../lib/what-to-do-storage.ts';
import { readWhatToDoRunDraft } from '../lib/what-to-do-run-draft.ts';
import { planningService } from '../lib/just-do-it-planning-service.ts';
import { appendCardWorkRecord } from '../lib/just-do-it-worklog.ts';

const featureUid = '00000000-0000-4000-8000-000000000002';

async function fixture(t: test.TestContext) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'what-to-do-run-'));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  const planningPath = path.join(rootPath, '.praxis');
  const nodeId = 'NODE-00000001';
  const nodePath = path.join(planningPath, 'whats-next/nodes', nodeId);
  await mkdir(nodePath, { recursive: true });
  await writeFile(path.join(rootPath, 'README.md'), '# Fixture\n');
  const node: TaskGraphNode = {
    schemaVersion: 1,
    id: nodeId,
    uid: featureUid,
    relations: { derivedFrom: [], dependsOn: [] },
    role: 'node',
    type: 'feature',
    title: 'Accepted Feature',
    summary: 'Accepted behavior.',
    status: 'accepted',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    resources: [
      { kind: 'output', path: `whats-next/nodes/${nodeId}/output.md` },
    ],
    derivedFrom: [],
    dependsOn: [],
    typeTemplateRef: nodeId,
    metadata: {},
    layer: 'product-design',
    artifactKind: 'feature',
  };
  await writeFile(
    path.join(nodePath, 'node.json'),
    `${JSON.stringify(node, null, 2)}\n`,
  );
  await writeFile(
    path.join(nodePath, 'output.md'),
    '# Accepted Feature\n\n## Behavior\n\nDeliver this behavior.\n',
  );
  const project: RegisteredProject = {
    id: '00000000-0000-4000-8000-000000000003',
    kind: 'repository',
    name: 'Fixture',
    description: '',
    rootPath,
    codePath: rootPath,
    planningPath,
    createdAt: '2026-09-02T00:00:00.000Z',
  };
  return { project, planningPath };
}

function controlled() {
  const calls: Array<{
    agent: string;
    input: LocalAgentRunInput;
    resolve: (value: {
      agentSessionId: string | null;
      finalOutput: string;
      usage: null;
    }) => void;
    reject: (error: Error) => void;
    canceled: boolean;
  }> = [];
  const transport = (agent: 'codex' | 'claude', input: LocalAgentRunInput) => {
    let resolve!: (value: {
      agentSessionId: string | null;
      finalOutput: string;
      usage: null;
    }) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<{
      agentSessionId: string | null;
      finalOutput: string;
      usage: null;
    }>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const call = { agent, input, resolve, reject, canceled: false };
    calls.push(call);
    return {
      completion,
      cancel() {
        call.canceled = true;
      },
    };
  };
  return { calls, transport };
}

function input() {
  return {
    instruction: 'Turn this accepted design into delivery boundaries.',
    sourceUids: [featureUid],
    profile: {
      agent: 'codex' as const,
      model: 'gpt-5.6-luna',
      effort: 'high' as const,
    },
  };
}

void test('What to Do Agent environment excludes unrelated credentials', () => {
  assert.deepEqual(
    whatToDoAgentEnvironment({
      PATH: '/usr/bin',
      HOME: '/tmp/home',
      GH_TOKEN: 'secret',
      ANTHROPIC_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
    }),
    { PATH: '/usr/bin', HOME: '/tmp/home' },
  );
});

function result(run: Awaited<ReturnType<typeof startWhatToDoRun>>) {
  const candidateId = 'CANDIDATE-0001';
  const source = run.request.sourceFeatures[0]!;
  const factsPath = 'what-to-do/repository-context/facts.json';
  return {
    schemaVersion: 1,
    harness: run.request.harness,
    request: run.request.request,
    responseMarkdown: '# Delivery Map\n\nOne Contract is ready for review.',
    repositorySummary: {
      markdown: '# Repository Summary\n\nA small fixture repository.',
      evidencePaths: [factsPath],
    },
    reviewedEvidence: [
      { path: factsPath, reason: 'Read the frozen repository facts.' },
    ],
    outcome: 'map-proposal',
    candidates: [
      {
        candidateId,
        revision: 1,
        title: 'Deliver accepted behavior',
        summary: 'One independently deliverable behavior.',
        outcome: 'The behavior is available.',
        includedScope: ['Accepted behavior'],
        excludedScope: [],
        productRules: ['Preserve the accepted behavior.'],
        domainImpact: {
          kind: 'none',
          reason: 'No Domain change is needed.',
          evidencePaths: [factsPath],
        },
        requiredExperienceStates: ['Ready', 'Error'],
        repositoryConstraints: ['Use project-owned checks.'],
        dependsOn: [],
        acceptanceCriteria: [
          {
            id: 'AC-1',
            condition: 'The user reaches the behavior.',
            passCondition: 'The behavior works.',
            evidence: 'Focused behavior evidence.',
          },
        ],
        validationExpectations: ['Run project checks.'],
        sourceClaimIds: ['CLAIM-1'],
        openDecisions: [],
        deliveryStrategy: {
          kind: 'vertical-slice',
          reason: 'The outcome is independently usable.',
        },
      },
    ],
    sourceClaims: [
      {
        claimId: 'CLAIM-1',
        sourcePath: source.outputPath,
        sourceSha256: source.outputSha256,
        anchor: '## Behavior',
        summary: 'The accepted behavior must be delivered.',
        disposition: 'in-scope',
        contractCandidateIds: [candidateId],
        exclusionReason: null,
        exclusionAuthority: null,
      },
    ],
  };
}

function retainedResult(
  run: Awaited<ReturnType<typeof startWhatToDoRun>>,
  map: NonNullable<Awaited<ReturnType<typeof readWhatToDoCurrentMap>>>,
) {
  const contract = map.contracts[0]!;
  const candidateId = `CANDIDATE-${contract.id.slice(5)}`;
  const claim = map.sourceClaims[0]!;
  const { contractIds: _contractIds, ...claimContent } = claim;
  const factsPath = 'what-to-do/repository-context/facts.json';
  return {
    schemaVersion: 1,
    harness: run.request.harness,
    request: run.request.request,
    responseMarkdown: '# Delivery Map\n\nThe focused Contract is retained.',
    repositorySummary: {
      markdown: '# Repository Summary\n\nA small fixture repository.',
      evidencePaths: [factsPath],
    },
    reviewedEvidence: [
      { path: factsPath, reason: 'Read the frozen repository facts.' },
    ],
    outcome: 'map-proposal',
    candidates: [],
    sourceClaims: [{ ...claimContent, contractCandidateIds: [candidateId] }],
    recomposition: {
      effects: [{ kind: 'retain', from: [candidateId], to: [candidateId] }],
    },
  };
}

function replacementResult(
  run: Awaited<ReturnType<typeof startWhatToDoRun>>,
  map: NonNullable<Awaited<ReturnType<typeof readWhatToDoCurrentMap>>>,
  original: ReturnType<typeof result>,
) {
  const priorContract = map.contracts[0]!;
  const priorCandidateId = `CANDIDATE-${priorContract.id.slice(5)}`;
  const candidateId = 'CANDIDATE-0002';
  const { contractIds: _contractIds, ...claim } = map.sourceClaims[0]!;
  return {
    ...original,
    harness: run.request.harness,
    request: run.request.request,
    responseMarkdown: '# Delivery Map\n\nThe Contract was replaced.',
    candidates: [
      {
        ...original.candidates[0]!,
        candidateId,
        title: 'Replacement delivery boundary',
        summary: 'A newly coordinated delivery boundary.',
      },
    ],
    sourceClaims: [{ ...claim, contractCandidateIds: [candidateId] }],
    recomposition: {
      effects: [
        { kind: 'replace', from: [priorCandidateId], to: [candidateId] },
      ],
    },
  };
}

async function settled(project: RegisteredProject, runId: string) {
  for (let index = 0; index < 100; index += 1) {
    const run = await readWhatToDoRun(project, runId);
    if (run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('What to Do Run did not settle.');
}

void test('a real What to Do Run persists the frozen request and Agent result', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(project, input(), control.transport);
  assert.equal(run.status, 'running');
  assert.equal(control.calls.length, 1);
  assert.equal(control.calls[0]!.agent, 'codex');
  assert.equal(control.calls[0]!.input.access, 'read-only');
  assert.equal(control.calls[0]!.input.disableDelegation, true);
  assert.equal(control.calls[0]!.input.model, 'gpt-5.6-luna');
  assert.equal(control.calls[0]!.input.effort, 'high');
  assert.equal(control.calls[0]!.input.environment?.GH_TOKEN, undefined);
  assert.match(control.calls[0]!.input.prompt, /praxis\.what-to-do/);
  assert.match(control.calls[0]!.input.prompt, /OUTPUT SCHEMA/);
  await assert.rejects(
    startWhatToDoRun(project, input(), control.transport),
    /already active/,
  );

  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(result(run)),
    usage: null,
  });
  const completed = await settled(project, run.id);
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.result?.outcome, 'map-proposal');
  assert.equal(completed.map?.contracts.length, 1);
  assert.match(completed.map?.contracts[0]?.id ?? '', /^NODE-[0-9a-f]{8,32}$/);
  assert.equal('candidateId' in completed.map!.contracts[0]!, false);
  assert.equal(completed.agentSessionId, 'agent-session-1');
  const runPath = path.join(planningPath, 'what-to-do/runs', run.id);
  assert.match(
    await readFile(path.join(runPath, 'summary.md'), 'utf8'),
    /1 Contract/,
  );
  assert.match(
    await readFile(path.join(runPath, 'response.md'), 'utf8'),
    /ready for review/,
  );
  assert.match(
    await readFile(
      path.join(planningPath, completed.map!.contracts[0]!.outputPath),
      'utf8',
    ),
    /Deliver accepted behavior/,
  );
  assert.deepEqual(
    (await listLatestWhatToDoRuns(project)).map((item) => item.id),
    [run.id],
  );
  const currentSummary = await readFile(
    path.join(planningPath, 'what-to-do/repository-context/summary.md'),
    'utf8',
  );
  assert.match(currentSummary, new RegExp(run.request.repository.fingerprint));
});

void test('the current formal Map is default Context and focus is optional emphasis', async (t) => {
  const { project } = await fixture(t);
  const control = controlled();
  const first = await startWhatToDoRun(project, input(), control.transport);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(result(first)),
    usage: null,
  });
  const completed = await settled(project, first.id);
  const contract = completed.map!.contracts[0]!;
  const second = await startWhatToDoRun(
    project,
    {
      ...input(),
      sourceUids: [],
      focusContractIds: [contract.id],
    },
    control.transport,
  );
  assert.deepEqual(second.request.sourceFeatures, []);
  assert.ok(
    second.request.content.references.some(
      (entry) =>
        entry.kind === 'focused-delivery-contract' &&
        entry.logicalPath === contract.outputPath,
    ),
  );
  assert.equal(second.request.operation, 'adjust-map');
  assert.deepEqual(second.request.focusCandidateIds, [
    `CANDIDATE-${contract.id.slice(5)}`,
  ]);
  control.calls[1]!.resolve({
    agentSessionId: 'agent-session-2',
    finalOutput: JSON.stringify(retainedResult(second, completed.map!)),
    usage: null,
  });
  const adjusted = await settled(project, second.id);
  assert.equal(adjusted.status, 'succeeded');
  assert.equal(adjusted.map?.contracts[0]?.id, contract.id);
  assert.equal(adjusted.map?.contracts[0]?.uid, contract.uid);
  assert.equal((await readWhatToDoCurrentMap(project))?.runId, second.id);
  assert.deepEqual(await listLatestWhatToDoRuns(project, 0), []);
  assert.equal(
    (await readWhatToDoCurrentMap(project))?.contracts[0]?.id,
    contract.id,
  );
  await assert.rejects(
    startWhatToDoRun(project, input(), control.transport),
    /already part of the current Delivery Map/,
  );
});

void test('Map replacement and Contract import leave no deletable stale Card', async (t) => {
  const { project } = await fixture(t);
  const control = controlled();
  const first = await startWhatToDoRun(project, input(), control.transport);
  const firstResult = result(first);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(firstResult),
    usage: null,
  });
  const completed = await settled(project, first.id);
  const contract = completed.map!.contracts[0]!;
  await planningService.importSource(project, 'what-to-do', contract.uid);
  const second = await startWhatToDoRun(
    project,
    { ...input(), sourceUids: [], focusContractIds: [contract.id] },
    control.transport,
  );
  control.calls[1]!.resolve({
    agentSessionId: 'agent-session-2',
    finalOutput: JSON.stringify(
      replacementResult(second, completed.map!, firstResult),
    ),
    usage: null,
  });
  const repeatedImport = planningService
    .importSource(project, 'what-to-do', contract.uid)
    .then(
      () => 'imported',
      () => 'rejected',
    );
  const adjusted = await settled(project, second.id);
  await repeatedImport;
  assert.equal(adjusted.status, 'succeeded');
  assert.notEqual(adjusted.map?.contracts[0]?.uid, contract.uid);
  await assert.rejects(
    planningService.read(project, contract.uid),
    /not found/,
  );
});

void test('a staged Card transition failure restores the prior Map and Cards', async (t) => {
  const { project } = await fixture(t);
  const control = controlled();
  const first = await startWhatToDoRun(project, input(), control.transport);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(result(first)),
    usage: null,
  });
  const completed = await settled(project, first.id);
  const contract = completed.map!.contracts[0]!;
  const card = await planningService.importSource(
    project,
    'what-to-do',
    contract.uid,
  );
  const secondCard = {
    ...card,
    id: '11111111-1111-4111-8111-111111111111',
    source: {
      ...card.source,
      uid: '11111111-1111-4111-8111-111111111111',
    },
  };
  let transitionCount = 0;
  await assert.rejects(
    publishDeliveryMap(
      project,
      {
        ...completed.map!,
        runId: 'RUN-22222222-2222-4222-8222-222222222222',
        contracts: [],
      },
      {
        list: async () => [card, secondCard],
        stageDeleteCard: async (targetProject, cardId, revision) => {
          transitionCount += 1;
          if (transitionCount === 2)
            throw new Error('Injected Card transition failure.');
          return planningService.stageDeleteCard(
            targetProject,
            cardId,
            revision,
          );
        },
      },
    ),
    /Injected Card transition failure/,
  );
  assert.equal((await readWhatToDoCurrentMap(project))?.runId, first.id);
  assert.equal((await planningService.read(project, card.id)).id, card.id);
});

void test('Map replacement is blocked by a Contract Card with a confirmed Plan', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const first = await startWhatToDoRun(project, input(), control.transport);
  const firstResult = result(first);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(firstResult),
    usage: null,
  });
  const completed = await settled(project, first.id);
  const contract = completed.map!.contracts[0]!;
  const card = await planningService.importSource(
    project,
    'what-to-do',
    contract.uid,
  );
  const protectedCard = {
    ...card,
    revision: card.revision + 1,
    plan: { status: 'finalized' as const, overview: 'Confirmed.', steps: [] },
    finalizedAt: '2026-09-02T01:00:00.000Z',
  };
  await appendCardWorkRecord(
    path.join(planningPath, 'implementation/cards'),
    card.id,
    card.revision,
    {
      kind: 'system-event',
      stage: 'planning',
      actionId: null,
      event: 'plan-finalized',
      text: 'The Plan was confirmed for this test.',
      refs: [],
    },
    { 'planning-state.json': JSON.stringify(protectedCard) },
  );
  const second = await startWhatToDoRun(
    project,
    { ...input(), sourceUids: [], focusContractIds: [contract.id] },
    control.transport,
  );
  control.calls[1]!.resolve({
    agentSessionId: 'agent-session-2',
    finalOutput: JSON.stringify(
      replacementResult(second, completed.map!, firstResult),
    ),
    usage: null,
  });
  const adjusted = await settled(project, second.id);
  assert.equal(adjusted.status, 'failed');
  assert.match(adjusted.error ?? '', /already in progress/);
  assert.equal((await readWhatToDoCurrentMap(project))?.runId, first.id);
  assert.equal(
    (await planningService.read(project, contract.uid)).plan?.status,
    'finalized',
  );
});

void test('a committed current Map completes an interrupted terminal Run publication', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(project, input(), control.transport);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(result(run)),
    usage: null,
  });
  const completed = await settled(project, run.id);
  await new Promise((resolve) => setImmediate(resolve));
  const directory = path.join(planningPath, 'what-to-do/runs', run.id);
  await writeFile(
    path.join(directory, 'run.json'),
    `${JSON.stringify(
      {
        ...completed,
        status: 'running',
        endedAt: null,
        result: null,
        map: null,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(directory, 'terminal.json'),
    `${JSON.stringify(completed, null, 2)}\n`,
  );
  const successor = await startWhatToDoRun(
    project,
    { ...input(), sourceUids: [] },
    control.transport,
  );
  const recovered = await readWhatToDoRun(project, run.id);
  assert.equal(recovered.status, 'succeeded');
  assert.equal(recovered.map?.runId, run.id);
  await assert.rejects(
    readFile(path.join(directory, 'terminal.json')),
    /ENOENT/,
  );
  await cancelWhatToDoRun(project, successor.id);
  control.calls[1]!.reject(new Error('canceled'));
});

void test('an uncommitted terminal record rolls back to an interrupted Run', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(project, input(), control.transport);
  control.calls[0]!.resolve({
    agentSessionId: 'agent-session-1',
    finalOutput: JSON.stringify(result(run)),
    usage: null,
  });
  const completed = await settled(project, run.id);
  await new Promise((resolve) => setImmediate(resolve));
  const directory = path.join(planningPath, 'what-to-do/runs', run.id);
  await rm(path.join(planningPath, 'what-to-do/current-map.json'));
  await writeFile(
    path.join(directory, 'run.json'),
    `${JSON.stringify(
      {
        ...completed,
        status: 'running',
        endedAt: null,
        result: null,
        map: null,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(directory, 'terminal.json'),
    `${JSON.stringify(completed, null, 2)}\n`,
  );
  const recovered = await readWhatToDoRun(project, run.id);
  assert.equal(recovered.status, 'failed');
  assert.match(recovered.error ?? '', /interrupted/);
  await assert.rejects(
    readFile(path.join(directory, 'terminal.json')),
    /ENOENT/,
  );
});

void test('invalid Agent output fails while preserving the raw response', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(
    project,
    {
      ...input(),
      files: [new File(['# Retry evidence\n'], 'retry-evidence.md')],
    },
    control.transport,
  );
  control.calls[0]!.resolve({
    agentSessionId: null,
    finalOutput: '{"not":"a delivery map"}',
    usage: null,
  });
  const failed = await settled(project, run.id);
  assert.equal(failed.status, 'failed');
  assert.match(
    await readFile(
      path.join(planningPath, 'what-to-do/runs', run.id, 'agent-output.txt'),
      'utf8',
    ),
    /not.*delivery map/,
  );
  assert.deepEqual(await readWhatToDoRunDraft(project, failed), {
    instruction: input().instruction,
    files: [
      {
        name: 'retry-evidence.md',
        mediaType: 'text/markdown',
        content: '# Retry evidence\n',
      },
    ],
  });
});

void test('cancel releases the project and rejects late completion', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(project, input(), control.transport);
  const canceled = await cancelWhatToDoRun(project, run.id);
  assert.equal(canceled.status, 'canceled');
  assert.match(
    await readFile(
      path.join(planningPath, 'what-to-do/runs', run.id, 'response.md'),
      'utf8',
    ),
    /canceled/,
  );
  assert.equal(control.calls[0]!.canceled, true);
  control.calls[0]!.resolve({
    agentSessionId: null,
    finalOutput: JSON.stringify(result(run)),
    usage: null,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await readWhatToDoRun(project, run.id)).status, 'canceled');
  const retry = await startWhatToDoRun(project, input(), control.transport);
  assert.equal(retry.status, 'running');
  await cancelWhatToDoRun(project, retry.id);
  control.calls[1]!.reject(new Error('canceled'));
});

void test('an orphaned running record is persisted as interrupted once', async (t) => {
  const { project, planningPath } = await fixture(t);
  const control = controlled();
  const run = await startWhatToDoRun(project, input(), control.transport);
  control.calls[0]!.resolve({
    agentSessionId: null,
    finalOutput: JSON.stringify(result(run)),
    usage: null,
  });
  const completed = await settled(project, run.id);
  await new Promise((resolve) => setImmediate(resolve));
  const runFile = path.join(
    planningPath,
    'what-to-do/runs',
    run.id,
    'run.json',
  );
  await writeFile(
    runFile,
    `${JSON.stringify(
      {
        ...completed,
        status: 'running',
        endedAt: null,
        result: null,
      },
      null,
      2,
    )}\n`,
  );
  const recovered = await readWhatToDoRun(project, run.id);
  assert.equal(recovered.status, 'failed');
  assert.match(recovered.error ?? '', /interrupted/);
  const persisted = JSON.parse(await readFile(runFile, 'utf8'));
  assert.equal(persisted.status, 'failed');
  assert.equal(persisted.endedAt, recovered.endedAt);
  assert.match(
    await readFile(path.join(path.dirname(runFile), 'summary.md'), 'utf8'),
    /Interrupted/,
  );
  assert.match(
    await readFile(path.join(path.dirname(runFile), 'response.md'), 'utf8'),
    /Interrupted/,
  );
  assert.doesNotMatch(
    await readFile(path.join(path.dirname(runFile), 'response.md'), 'utf8'),
    /ready for review/,
  );
});
