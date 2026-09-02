import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RegisteredProject } from '../lib/project-registry.ts';
import {
  TASK_DECOMPOSITION_HARNESS_ID,
  TASK_DECOMPOSITION_HARNESS_REVISION,
  type HarnessCandidate,
} from '../lib/task-decomposition-harness.ts';

const realFs = await import('node:fs/promises');
const { mkdir, mkdtemp, readdir, rm, writeFile } = realFs;

type Arrival = {
  target: string;
  release: () => void;
  settled: Promise<void>;
};

let publishArrivals: Arrival[] | null = null;
let announceArrival: (() => void) | null = null;

function isNodePublication(target: string) {
  return (
    target.includes(`task-graph${path.sep}nodes${path.sep}NODE-`) &&
    !target.endsWith('.tmp')
  );
}

let requestArrivals: Arrival[] | null = null;
let announceRequestArrival: (() => void) | null = null;

let injectedFailure: {
  match: (target: string) => boolean;
  error: NodeJS.ErrnoException;
} | null = null;

function failingOn(
  match: (target: string) => boolean,
  error: NodeJS.ErrnoException,
) {
  injectedFailure = { match, error };
  return { clear: () => (injectedFailure = null) };
}

function fsError(code: string, target: string) {
  const error = new Error(
    `${code}: injected, open '${target}'`,
  ) as NodeJS.ErrnoException;
  error.code = code;
  error.path = target;
  return error;
}

mock.module('../lib/local-agent-transport.ts', {
  namedExports: {
    ...(await import('../lib/local-agent-transport.ts')),
    startLocalAgentRun: () => ({
      completion: new Promise(() => {}),
      cancel: () => {},
    }),
  },
});

mock.module('node:fs/promises', {
  namedExports: {
    ...realFs,
    readFile: async (target: unknown, ...rest: unknown[]) => {
      if (injectedFailure?.match(String(target))) throw injectedFailure.error;
      return (realFs.readFile as (...args: unknown[]) => Promise<unknown>)(
        target,
        ...rest,
      );
    },
    writeFile: async (target: unknown, ...rest: unknown[]) => {
      const name = String(target);
      if (injectedFailure?.match(name)) throw injectedFailure.error;
      if (requestArrivals && name.endsWith(`${path.sep}request.json`)) {
        let release: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let markSettled: () => void;
        const settled = new Promise<void>((resolve) => {
          markSettled = resolve;
        });
        requestArrivals.push({ target: name, release: release!, settled });
        announceRequestArrival?.();
        await gate;
        try {
          return await (
            realFs.writeFile as (...args: unknown[]) => Promise<void>
          )(target, ...rest);
        } finally {
          markSettled!();
        }
      }
      return (realFs.writeFile as (...args: unknown[]) => Promise<void>)(
        target,
        ...rest,
      );
    },
    rename: async (from: string, to: string) => {
      if (!publishArrivals || !isNodePublication(String(to)))
        return realFs.rename(from, to);
      let release: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markSettled: () => void;
      const settled = new Promise<void>((resolve) => {
        markSettled = resolve;
      });
      publishArrivals.push({ target: String(to), release: release!, settled });
      announceArrival?.();
      await gate;
      try {
        return await realFs.rename(from, to);
      } finally {
        markSettled!();
      }
    },
  },
});

const {
  acceptTaskDecompositionCandidate,
  discardTaskDecompositionCandidate,
  readTaskDecompositionRun,
  startTaskDecompositionRun,
} = await import('../lib/task-decomposition-runs.ts');
const { listTaskGraphNodes } = await import('../lib/task-graph.ts');
const { PublicApiError } = await import('../lib/api-errors.ts');

function revisionRequest(runId: string) {
  return {
    sourceNodeId: SOURCE_NODE_ID,
    agent: 'codex',
    instruction: 'Revise the Candidate.',
    contextRefs: [],
    files: [],
    revisionRunId: runId,
    revisionCandidateId: CANDIDATE_A,
  } as Parameters<typeof startTaskDecompositionRun>[1];
}

function clearActiveRuns() {
  const runtime = globalThis as typeof globalThis & {
    __agentManagerRuns?: Map<string, unknown>;
  };
  runtime.__agentManagerRuns?.clear();
}

function armRequestBarrier() {
  requestArrivals = [];
  return {
    waitFor(count: number) {
      if ((requestArrivals?.length ?? 0) >= count) return Promise.resolve();
      return new Promise<void>((resolve) => {
        announceRequestArrival = () => {
          if ((requestArrivals?.length ?? 0) >= count) {
            announceRequestArrival = null;
            resolve();
          }
        };
      });
    },
    count() {
      return requestArrivals?.length ?? 0;
    },
    disarm() {
      for (const arrival of requestArrivals ?? []) arrival.release();
      requestArrivals = null;
      announceRequestArrival = null;
    },
  };
}

function armPublishBarrier() {
  publishArrivals = [];
  return {
    waitFor(count: number) {
      if ((publishArrivals?.length ?? 0) >= count) return Promise.resolve();
      return new Promise<void>((resolve) => {
        announceArrival = () => {
          if ((publishArrivals?.length ?? 0) >= count) {
            announceArrival = null;
            resolve();
          }
        };
      });
    },
    at(index: number) {
      const arrival = publishArrivals?.[index];
      assert.ok(arrival, `expected a publication arrival at index ${index}`);
      return arrival;
    },
    count() {
      return publishArrivals?.length ?? 0;
    },
    disarm() {
      for (const arrival of publishArrivals ?? []) arrival.release();
      publishArrivals = null;
      announceArrival = null;
    },
  };
}

const SOURCE_NODE_ID = 'NODE-00000000';
const CANDIDATE_A = 'CANDIDATE-a1b2c3d4';
const CANDIDATE_B = 'CANDIDATE-b2c3d4e5';

function candidate(
  candidateId: string,
  overrides: Partial<HarnessCandidate> = {},
): HarnessCandidate {
  return {
    candidateId,
    revision: 1,
    type: 'module',
    title: `Title for ${candidateId}`,
    summary: `Summary for ${candidateId}.`,
    derivedFrom: [SOURCE_NODE_ID],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: { acceptance: ['The user can inspect the result.'] },
    presentation: {},
    assumptions: [],
    ...overrides,
  };
}

async function makeProject(candidates: HarnessCandidate[]) {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'am-bid-accept-'));
  const planningPath = path.join(rootPath, 'planning');
  const project: RegisteredProject = {
    id: 'PROJECT-0001',
    kind: 'standalone',
    name: 'Concurrency Fixture',
    description: 'Deterministic acceptance fixture.',
    rootPath,
    codePath: null,
    planningPath,
    createdAt: new Date(0).toISOString(),
  };

  const nodePath = path.join(
    planningPath,
    'task-graph',
    'nodes',
    SOURCE_NODE_ID,
  );
  await mkdir(nodePath, { recursive: true });
  await writeFile(
    path.join(nodePath, 'node.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: SOURCE_NODE_ID,
        role: 'start',
        type: 'product',
        title: 'Source',
        summary: 'The source of the decomposition.',
        resources: [],
      },
      null,
      2,
    )}\n`,
  );

  const runId = `RUN-${randomUUID()}`;
  const runPath = path.join(planningPath, 'task-decomposition', 'runs', runId);
  await mkdir(runPath, { recursive: true });
  await writeFile(
    path.join(runPath, 'run.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        sessionId: `SESSION-${randomUUID()}`,
        requestId: `REQUEST-${randomUUID()}`,
        agentSessionId: null,
        sourceNodeId: SOURCE_NODE_ID,
        operation: 'propose',
        status: 'proposal',
        transport: 'codex-cli',
        harness: {
          id: TASK_DECOMPOSITION_HARNESS_ID,
          revision: TASK_DECOMPOSITION_HARNESS_REVISION,
        },
        inputFingerprint: 'fingerprint',
        startedAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        endedAt: new Date(0).toISOString(),
        usage: null,
        error: null,
        result: {
          schemaVersion: 1,
          harness: {
            id: TASK_DECOMPOSITION_HARNESS_ID,
            revision: TASK_DECOMPOSITION_HARNESS_REVISION,
          },
          request: {
            sessionId: 'SESSION-0001',
            requestId: 'REQUEST-0001',
            inputFingerprint: 'fingerprint',
          },
          impactReview: {
            reviewedNodeIds: [],
            affectedNodeIds: [],
            notes: [],
          },
          outcome: 'proposal',
          candidates,
        },
      },
      null,
      2,
    )}\n`,
  );
  return {
    project,
    runId,
    cleanup: () => rm(rootPath, { recursive: true, force: true }),
  };
}

async function temporaryNodeDirectories(project: RegisteredProject) {
  const nodesPath = path.join(project.planningPath, 'task-graph', 'nodes');
  const entries = await readdir(nodesPath).catch(() => []);
  return entries.filter((entry) => entry.startsWith('.'));
}

void test('the fixture drives the real acceptance path and repeated sequential acceptance is idempotent', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    const run = await readTaskDecompositionRun(project, runId);
    assert.equal(run.result?.outcome, 'proposal');
    const uid = run.result.candidates[0]?.uid;
    assert.ok(uid, 'the run must resolve a stable identity for the Candidate');

    const first = await acceptTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_A,
    );
    const second = await acceptTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_A,
    );

    assert.equal(first.node.uid, uid);
    assert.equal(second.node.id, first.node.id);
    const nodes = await listTaskGraphNodes(project);
    assert.equal(nodes.filter((node) => node.uid === uid).length, 1);
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('two concurrent accepts of one Candidate publish once and both return the same node', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    const run = await readTaskDecompositionRun(project, runId);
    const uid =
      run.result?.outcome === 'proposal'
        ? run.result.candidates[0]?.uid
        : undefined;
    assert.ok(uid);

    const barrier = armPublishBarrier();
    const first = acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A);
    const second = acceptTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_A,
    );
    await barrier.waitFor(1);
    barrier.at(0).release();
    await barrier.at(0).settled;
    const arrivalsBeforeCompletion = barrier.count();
    barrier.disarm();
    const outcomes = await Promise.allSettled([first, second]);
    assert.equal(
      arrivalsBeforeCompletion,
      1,
      'a serialized second caller must never reach the publication rename',
    );

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'fulfilled'],
      'concurrent acceptance must be idempotent, not an internal filesystem conflict',
    );
    const [a, b] = outcomes as Array<
      PromiseFulfilledResult<{ node: { id: string } }>
    >;
    assert.equal(a.value.node.id, b.value.node.id);

    const nodes = await listTaskGraphNodes(project);
    const published = nodes.filter((node) => node.uid === uid);
    assert.equal(
      published.length,
      1,
      'exactly one Formal Node per Candidate UID',
    );
    assert.equal(published[0]?.provenance?.candidateId, CANDIDATE_A);
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('two concurrent accepts of sibling Candidates both publish independently', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
    candidate(CANDIDATE_B),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const outcomes = await Promise.allSettled([
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_B),
    ]);
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'fulfilled'],
    );

    const nodes = await listTaskGraphNodes(project);
    const provenance = nodes
      .map((node) => node.provenance?.candidateId)
      .filter((value): value is string => Boolean(value))
      .sort();
    assert.deepEqual(provenance, [CANDIDATE_A, CANDIDATE_B].sort());
    assert.equal(new Set(nodes.map((node) => node.uid)).size, nodes.length);
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('a concurrent accept and discard settle into one legal ordering', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const { discardTaskDecompositionCandidate } =
      await import('../lib/task-decomposition-runs.ts');
    const [accepted, discarded] = await Promise.allSettled([
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      discardTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);

    assert.equal(
      accepted.status,
      'fulfilled',
      'the first caller in the queue must win',
    );
    assert.equal(discarded.status, 'rejected');
    assert.match(
      (discarded as PromiseRejectedResult).reason.message,
      /An accepted Candidate must be managed as a formal Node\./,
    );

    const nodes = await listTaskGraphNodes(project);
    assert.equal(
      nodes.filter((node) => node.provenance?.candidateId === CANDIDATE_A)
        .length,
      1,
    );
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('discard refreshes response evidence and reports every affected Run', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
    candidate(CANDIDATE_B),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const result = await discardTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_A,
    );
    assert.deepEqual(result.deletedRunIds, []);
    assert.equal(result.runs[0]?.runId, runId);
    assert.deepEqual(
      result.runs[0]?.result?.outcome === 'proposal'
        ? result.runs[0].result.candidates.map(
            (candidate) => candidate.candidateId,
          )
        : [],
      [CANDIDATE_B],
    );
    const response = await realFs.readFile(
      path.join(
        project.planningPath,
        'task-decomposition',
        'runs',
        runId,
        'response.md',
      ),
      'utf8',
    );
    assert.doesNotMatch(response, new RegExp(CANDIDATE_A));
    assert.match(response, new RegExp(CANDIDATE_B));

    const deleted = await discardTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_B,
    );
    assert.deepEqual(deleted.deletedRunIds, [runId]);
    assert.deepEqual(deleted.runs, []);
  } finally {
    await cleanup();
  }
});

void test('retained and revised Recompose members cannot be discarded individually', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    const runsPath = path.join(
      project.planningPath,
      'task-decomposition',
      'runs',
    );
    const original = JSON.parse(
      await realFs.readFile(path.join(runsPath, runId, 'run.json'), 'utf8'),
    );
    const recomposeRunId = `RUN-${randomUUID()}`;
    await mkdir(path.join(runsPath, recomposeRunId), { recursive: true });
    await writeFile(
      path.join(runsPath, recomposeRunId, 'run.json'),
      `${JSON.stringify(
        {
          ...original,
          runId: recomposeRunId,
          operation: 'recompose-candidates',
          recomposeCandidateIds: [CANDIDATE_A],
          result: {
            ...original.result,
            candidates: [],
            recomposition: {
              effects: [
                {
                  kind: 'retain',
                  from: [CANDIDATE_A],
                  to: [CANDIDATE_A],
                },
              ],
            },
          },
        },
        null,
        2,
      )}\n`,
    );
    const revisionRunId = `RUN-${randomUUID()}`;
    await mkdir(path.join(runsPath, revisionRunId), { recursive: true });
    await writeFile(
      path.join(runsPath, revisionRunId, 'run.json'),
      `${JSON.stringify(
        {
          ...original,
          runId: revisionRunId,
          operation: 'revise-candidate',
          revisionOf: CANDIDATE_A,
          result: {
            ...original.result,
            candidates: [candidate(CANDIDATE_A, { revision: 2 })],
          },
        },
        null,
        2,
      )}\n`,
    );

    await assert.rejects(
      () => discardTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      /one atomic working set and cannot be discarded individually/,
    );
    await assert.rejects(
      () =>
        discardTaskDecompositionCandidate(project, revisionRunId, CANDIDATE_A),
      /one atomic working set and cannot be discarded individually/,
    );
  } finally {
    await cleanup();
  }
});

void test('dependency ordering survives overlap and the dependent accepts cleanly on retry', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
    candidate(CANDIDATE_B, { dependsOn: [CANDIDATE_A] }),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const [prerequisite, dependent] = await Promise.allSettled([
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_B),
    ]);
    assert.equal(prerequisite.status, 'fulfilled');

    if (dependent.status === 'rejected') {
      assert.match(
        (dependent.reason as Error).message,
        new RegExp(`Accept ${CANDIDATE_A} before accepting ${CANDIDATE_B}`),
      );
      const retried = await acceptTaskDecompositionCandidate(
        project,
        runId,
        CANDIDATE_B,
      );
      assert.equal(retried.node.provenance?.candidateId, CANDIDATE_B);
    }

    const nodes = await listTaskGraphNodes(project);
    const dependentNode = nodes.find(
      (node) => node.provenance?.candidateId === CANDIDATE_B,
    );
    const prerequisiteNode = nodes.find(
      (node) => node.provenance?.candidateId === CANDIDATE_A,
    );
    assert.ok(prerequisiteNode);
    assert.ok(dependentNode);
    assert.deepEqual(dependentNode.dependsOn, [prerequisiteNode.id]);
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('the serializer is keyed per project and does not block a second project', async () => {
  const one = await makeProject([candidate(CANDIDATE_A)]);
  const two = await makeProject([candidate(CANDIDATE_A)]);
  try {
    await readTaskDecompositionRun(one.project, one.runId);
    await readTaskDecompositionRun(two.project, two.runId);
    const barrier = armPublishBarrier();
    const first = acceptTaskDecompositionCandidate(
      one.project,
      one.runId,
      CANDIDATE_A,
    );
    const second = acceptTaskDecompositionCandidate(
      two.project,
      two.runId,
      CANDIDATE_A,
    );
    await barrier.waitFor(2);
    assert.equal(
      barrier.count(),
      2,
      'independent projects must publish concurrently',
    );
    barrier.at(0).release();
    barrier.at(1).release();
    const outcomes = await Promise.allSettled([first, second]);
    barrier.disarm();
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'fulfilled'],
    );
  } finally {
    await one.cleanup();
    await two.cleanup();
  }
});

void test('a rejected mutation releases the process-local queue for the next caller', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    await assert.rejects(
      () =>
        acceptTaskDecompositionCandidate(project, runId, 'CANDIDATE-ffffffff'),
      /The Candidate could not be found\./,
    );
    const accepted = await acceptTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_A,
    );
    assert.equal(accepted.node.provenance?.candidateId, CANDIDATE_A);
  } finally {
    await cleanup();
  }
});

void test('a Candidate revision keeps its original Intention and Motion', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await assert.rejects(
      () =>
        startTaskDecompositionRun(project, {
          ...revisionRequest(runId),
          intention: 'delivery',
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicApiError);
        assert.equal(error.status, 409);
        assert.equal(
          error.message,
          'A Candidate revision must keep its original Intention Profile.',
        );
        return true;
      },
    );
    await assert.rejects(
      () =>
        startTaskDecompositionRun(project, {
          ...revisionRequest(runId),
          motion: 'diverge',
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicApiError);
        assert.equal(error.status, 409);
        assert.equal(
          error.message,
          'A Candidate revision must keep its original Motion.',
        );
        return true;
      },
    );
  } finally {
    clearActiveRuns();
    await cleanup();
  }
});

void test('a Candidate revision start blocks acceptance until it is registered', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const barrier = armRequestBarrier();
    const revision = startTaskDecompositionRun(project, revisionRequest(runId));
    await barrier.waitFor(1);
    const accepted = Promise.allSettled([
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);
    barrier.disarm();
    const started = await Promise.allSettled([revision]);
    assert.equal(started[0]?.status, 'fulfilled');

    const [outcome] = await accepted;
    assert.equal(
      outcome!.status,
      'rejected',
      'acceptance must not proceed against a Candidate a registered revision is revising',
    );
    assert.match(
      (outcome!.reason as Error).message,
      /Wait for the active Candidate revision to finish\./,
    );
    const nodes = await listTaskGraphNodes(project);
    assert.equal(
      nodes.filter((node) => node.provenance?.candidateId === CANDIDATE_A)
        .length,
      0,
    );
  } finally {
    clearActiveRuns();
    await cleanup();
  }
});

void test('a Candidate revision start blocks discard until it is registered', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const barrier = armRequestBarrier();
    const revision = startTaskDecompositionRun(project, revisionRequest(runId));
    await barrier.waitFor(1);
    const discarded = Promise.allSettled([
      discardTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);
    barrier.disarm();
    const started = await Promise.allSettled([revision]);
    assert.equal(started[0]?.status, 'fulfilled');

    const [outcome] = await discarded;
    assert.equal(
      outcome!.status,
      'rejected',
      'a revision must not start from a Candidate that is concurrently discarded',
    );
    assert.match(
      (outcome!.reason as Error).message,
      /Cancel or finish the active Candidate revision first\./,
    );
    const after = await readTaskDecompositionRun(project, runId);
    assert.equal(after.result?.outcome, 'proposal');
  } finally {
    clearActiveRuns();
    await cleanup();
  }
});

void test('discard invoked before accept settles into the other legal ordering', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const [discarded, accepted] = await Promise.allSettled([
      discardTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);

    assert.equal(
      discarded.status,
      'fulfilled',
      'the first caller in the queue must win',
    );
    assert.equal(accepted.status, 'rejected');
    assert.match(
      (accepted as PromiseRejectedResult).reason.message,
      /The Candidate proposal is unavailable\./,
    );

    const nodes = await listTaskGraphNodes(project);
    assert.equal(
      nodes.filter((node) => node.provenance?.candidateId === CANDIDATE_A)
        .length,
      0,
    );
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('a dependent invoked before its prerequisite is rejected and retries cleanly', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
    candidate(CANDIDATE_B, { dependsOn: [CANDIDATE_A] }),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const [dependent, prerequisite] = await Promise.allSettled([
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_B),
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);

    assert.equal(dependent.status, 'rejected');
    assert.match(
      (dependent.reason as Error).message,
      new RegExp(`Accept ${CANDIDATE_A} before accepting ${CANDIDATE_B}`),
    );
    assert.equal(prerequisite.status, 'fulfilled');

    const retried = await acceptTaskDecompositionCandidate(
      project,
      runId,
      CANDIDATE_B,
    );
    const nodes = await listTaskGraphNodes(project);
    const prerequisiteNode = nodes.find(
      (node) => node.provenance?.candidateId === CANDIDATE_A,
    );
    assert.ok(prerequisiteNode);
    assert.deepEqual(retried.node.dependsOn, [prerequisiteNode.id]);
    assert.deepEqual(await temporaryNodeDirectories(project), []);
  } finally {
    await cleanup();
  }
});

void test('a missing Run record on the loser path becomes the existing public error', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  try {
    await readTaskDecompositionRun(project, runId);
    const [discarded, accepted] = await Promise.allSettled([
      discardTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
    ]);
    assert.equal(discarded.status, 'fulfilled');
    assert.equal(accepted.status, 'rejected');
    const reason = (accepted as PromiseRejectedResult).reason as Error;
    assert.ok(
      reason instanceof PublicApiError,
      'a discarded Run must reach the caller as a public product error',
    );
    assert.equal(reason.message, 'The Candidate proposal is unavailable.');
  } finally {
    await cleanup();
  }
});

void test('an ENOENT from nested Candidate state stays an internal error', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  const nested = path.join(
    project.planningPath,
    'task-decomposition',
    'runs',
    runId,
    'candidates',
    CANDIDATE_A,
    'output.md',
  );
  const injection = failingOn(
    (target) => target === nested,
    fsError('ENOENT', nested),
  );
  try {
    await assert.rejects(
      () => acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      (error: NodeJS.ErrnoException) => {
        assert.equal(error.code, 'ENOENT');
        assert.equal(error.path, nested);
        assert.ok(
          !(error instanceof PublicApiError),
          'a nested filesystem failure must not be relabelled as a missing proposal',
        );
        return true;
      },
    );
  } finally {
    injection.clear();
    await cleanup();
  }
});

void test('a non-ENOENT failure reading the Run record is passed through unchanged', async () => {
  const { project, runId, cleanup } = await makeProject([
    candidate(CANDIDATE_A),
  ]);
  const record = path.join(
    project.planningPath,
    'task-decomposition',
    'runs',
    runId,
    'run.json',
  );
  const injection = failingOn(
    (target) => target === record,
    fsError('EACCES', record),
  );
  try {
    await assert.rejects(
      () => acceptTaskDecompositionCandidate(project, runId, CANDIDATE_A),
      (error: NodeJS.ErrnoException) => {
        assert.equal(error.code, 'EACCES');
        assert.ok(!(error instanceof PublicApiError));
        return true;
      },
    );
  } finally {
    injection.clear();
    await cleanup();
  }
});
