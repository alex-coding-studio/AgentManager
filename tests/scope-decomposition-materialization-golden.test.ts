import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptTaskDecompositionCandidate,
  startTaskDecompositionRun,
} from '../lib/modules/scope-decomposition/runs.ts';
import {
  TASK_DECOMPOSITION_HARNESS_ID,
  TASK_DECOMPOSITION_HARNESS_REVISION,
} from '../lib/modules/scope-decomposition/harness.ts';
import {
  captureGraphState,
  createGoldenProject,
  deferredLaunch,
  settledTaskDecompositionRun,
} from './helpers/graph-materialization-golden.ts';

const GOLDENS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/materialization/scope-decomposition',
);
const UPDATE = process.env.PRAXIS_UPDATE_GOLDENS === '1';

type StartedRun = {
  sessionId: string;
  requestId: string;
  inputFingerprint: string;
};

function base(started: StartedRun, sourceNodeId: string) {
  return {
    schemaVersion: 1,
    harness: {
      id: TASK_DECOMPOSITION_HARNESS_ID,
      revision: TASK_DECOMPOSITION_HARNESS_REVISION,
    },
    request: {
      sessionId: started.sessionId,
      requestId: started.requestId,
      inputFingerprint: started.inputFingerprint,
    },
    impactReview: {
      reviewedNodeIds: [sourceNodeId],
      affectedNodeIds: [],
      notes: [],
    },
  };
}

function proposal(
  started: StartedRun,
  sourceNodeId: string,
  candidates: Array<Record<string, unknown>>,
  recomposition?: { effects: Array<Record<string, unknown>> },
) {
  return {
    ...base(started, sourceNodeId),
    outcome: 'proposal',
    candidates,
    ...(recomposition && { recomposition }),
  };
}

function candidate(
  candidateId: string,
  title: string,
  sourceNodeId: string,
  dependsOn: string[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    candidateId,
    revision: 1,
    type: 'module',
    title,
    summary: `${title} stated as one bounded unit of work.`,
    derivedFrom: [sourceNodeId],
    dependsOn,
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: ['The source already describes the intended outcome.'],
    ...overrides,
  };
}

async function assertGolden(name: string, captured: Record<string, unknown>) {
  const file = path.join(GOLDENS, `${name}.json`);
  const serialized = `${JSON.stringify(captured, null, 2)}\n`;
  if (UPDATE) {
    await writeFile(file, serialized);
    return;
  }
  const expected = await readFile(file, 'utf8').catch(() => null);
  assert.ok(
    expected !== null,
    `missing golden ${name}; regenerate with PRAXIS_UPDATE_GOLDENS=1`,
  );
  assert.deepEqual(captured, JSON.parse(expected));
}

function request(
  sourceNodeId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    sourceNodeId,
    agent: 'codex' as const,
    instruction: 'Break the source into bounded modules.',
    contextRefs: [],
    files: [],
    ...overrides,
  };
}

async function project(t: test.TestContext) {
  return createGoldenProject(t, 'Build my local website', 'task-graph');
}

async function settleProposal(
  fixture: Awaited<ReturnType<typeof project>>,
  candidates: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  const agent = deferredLaunch();
  const started = await startTaskDecompositionRun(
    fixture.project,
    request(fixture.source.id, overrides),
    agent.launch,
  );
  agent.respond(
    JSON.stringify(proposal(started, fixture.source.id, candidates)),
  );
  const settled = await settledTaskDecompositionRun(
    fixture.project,
    started.runId,
  );
  assert.equal(settled.status, 'proposal', settled.error ?? undefined);
  return { started, settled };
}

void test('a proposed decomposition materializes its Candidates and identities', async (t) => {
  const fixture = await project(t);
  const source = fixture.source.id;
  await settleProposal(fixture, [
    candidate('CANDIDATE-0001', 'Capture the source', source),
    candidate('CANDIDATE-0002', 'Render the page', source, ['CANDIDATE-0001']),
    candidate('CANDIDATE-0003', 'Publish the site', source, ['CANDIDATE-0002']),
  ]);
  await assertGolden('propose', await captureGraphState(fixture.project));
});

void test('appended Candidates join the existing proposal', async (t) => {
  const fixture = await project(t);
  const source = fixture.source.id;
  const first = await settleProposal(fixture, [
    candidate('CANDIDATE-0001', 'Capture the source', source),
  ]);
  const appended = await settleProposal(
    fixture,
    [candidate('CANDIDATE-0002', 'Render the page', source)],
    { operation: 'append-candidates' },
  );
  assert.equal(appended.settled.operation, 'append-candidates');
  const original = first.settled.result;
  const added = appended.settled.result;
  assert.ok(original?.outcome === 'proposal' && added?.outcome === 'proposal');
  assert.notEqual(
    original.candidates[0]!.candidateId,
    added.candidates[0]!.candidateId,
  );
  await assertGolden(
    'append-candidates',
    await captureGraphState(fixture.project),
  );
});

void test('a revised Candidate keeps its identity and advances its revision', async (t) => {
  const fixture = await project(t);
  const source = fixture.source.id;
  const first = await settleProposal(fixture, [
    candidate('CANDIDATE-0001', 'Capture the source', source),
  ]);
  const result = first.settled.result;
  assert.ok(result && result.outcome === 'proposal');
  const alias = result.candidates[0]!.candidateId;
  const agent = deferredLaunch();
  const started = await startTaskDecompositionRun(
    fixture.project,
    request(source, {
      revisionRunId: first.started.runId,
      revisionCandidateId: alias,
    }),
    agent.launch,
  );
  agent.respond(
    JSON.stringify(
      proposal(started, source, [
        candidate(alias, 'Capture the source precisely', source, [], {
          revision: 2,
        }),
      ]),
    ),
  );
  const settled = await settledTaskDecompositionRun(
    fixture.project,
    started.runId,
  );
  assert.equal(settled.status, 'proposal', settled.error ?? undefined);
  await assertGolden(
    'revise-candidate',
    await captureGraphState(fixture.project),
  );
});

void test('a recomposition retains, replaces, splits and removes with dependency repair', async (t) => {
  const fixture = await project(t);
  const source = fixture.source.id;
  const first = await settleProposal(fixture, [
    candidate('CANDIDATE-0001', 'Capture the source', source),
    candidate('CANDIDATE-0002', 'Render the page', source, ['CANDIDATE-0001']),
    candidate('CANDIDATE-0003', 'Publish the site', source, ['CANDIDATE-0002']),
  ]);
  const result = first.settled.result;
  assert.ok(result && result.outcome === 'proposal');
  const [retained, replaced, removed] = result.candidates.map(
    (entry) => entry.candidateId,
  );
  assert.ok(retained && replaced && removed);
  const agent = deferredLaunch();
  const started = await startTaskDecompositionRun(
    fixture.project,
    request(source, {
      recomposeCandidateIds: [retained, replaced, removed],
    }),
    agent.launch,
  );
  agent.respond(
    JSON.stringify(
      proposal(
        started,
        source,
        [
          candidate('CANDIDATE-0010', 'Render the shell', source, [retained]),
          candidate('CANDIDATE-0011', 'Render the content', source, [
            'CANDIDATE-0010',
          ]),
        ],
        {
          effects: [
            { kind: 'retain', from: [retained], to: [retained] },
            {
              kind: 'split',
              from: [replaced],
              to: ['CANDIDATE-0010', 'CANDIDATE-0011'],
            },
            { kind: 'remove', from: [removed], to: [] },
          ],
        },
      ),
    ),
  );
  const settled = await settledTaskDecompositionRun(
    fixture.project,
    started.runId,
  );
  assert.equal(settled.status, 'proposal', settled.error ?? undefined);
  await assertGolden('recompose', await captureGraphState(fixture.project));
});

void test('dependency-ordered acceptance promotes Candidates to formal Nodes', async (t) => {
  const fixture = await project(t);
  const source = fixture.source.id;
  const first = await settleProposal(fixture, [
    candidate('CANDIDATE-0001', 'Capture the source', source),
    candidate('CANDIDATE-0002', 'Render the page', source, ['CANDIDATE-0001']),
  ]);
  const result = first.settled.result;
  assert.ok(result && result.outcome === 'proposal');
  const prerequisite = result.candidates[0]!.candidateId;
  const dependent = result.candidates[1]!.candidateId;
  await assert.rejects(
    () =>
      acceptTaskDecompositionCandidate(
        fixture.project,
        first.started.runId,
        dependent,
      ),
    /Accept/,
  );
  await acceptTaskDecompositionCandidate(
    fixture.project,
    first.started.runId,
    prerequisite,
  );
  await acceptTaskDecompositionCandidate(
    fixture.project,
    first.started.runId,
    dependent,
  );
  await assertGolden('accept', await captureGraphState(fixture.project));
});

void test('an insufficient-evidence result leaves the graph untouched', async (t) => {
  const fixture = await project(t);
  const agent = deferredLaunch();
  const started = await startTaskDecompositionRun(
    fixture.project,
    request(fixture.source.id),
    agent.launch,
  );
  agent.respond(
    JSON.stringify({
      ...base(started, fixture.source.id),
      outcome: 'insufficient-evidence',
      missingEvidence: ['The source does not state the intended audience.'],
    }),
  );
  const settled = await settledTaskDecompositionRun(
    fixture.project,
    started.runId,
  );
  assert.equal(
    settled.status,
    'insufficient-evidence',
    settled.error ?? undefined,
  );
  await assertGolden(
    'insufficient-evidence',
    await captureGraphState(fixture.project),
  );
});

void test('a clarification leaves the graph untouched', async (t) => {
  const fixture = await project(t);
  const agent = deferredLaunch();
  const started = await startTaskDecompositionRun(
    fixture.project,
    request(fixture.source.id),
    agent.launch,
  );
  agent.respond(
    JSON.stringify({
      ...base(started, fixture.source.id),
      outcome: 'clarification',
      clarification: {
        question: 'Should the site serve one reader or a team?',
        options: [
          {
            id: 'one-reader',
            label: 'One reader',
            effect: 'Decompose for a single reader.',
            recommended: true,
          },
          {
            id: 'a-team',
            label: 'A team',
            effect: 'Decompose for shared use.',
            recommended: false,
          },
        ],
      },
    }),
  );
  const settled = await settledTaskDecompositionRun(
    fixture.project,
    started.runId,
  );
  assert.equal(settled.status, 'clarification', settled.error ?? undefined);
  await assertGolden('clarification', await captureGraphState(fixture.project));
});
