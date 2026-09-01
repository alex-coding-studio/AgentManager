import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import type { RegisteredProject } from '../lib/project-registry.ts';

const realFs = await import('node:fs/promises');
const { mkdtemp, readFile, readdir, rm, stat, writeFile } = realFs;

type Arrival = {
  kind: string;
  target: string;
  source: string;
  release: () => void;
  settled: Promise<void>;
};

let arrivals: Arrival[] | null = null;
let gate: ((kind: string, target: string, source: string) => boolean) | null =
  null;
let announce: (() => void) | null = null;
let calls: Array<{ kind: string; target: string }> = [];

async function pass<T>(
  kind: string,
  target: string,
  source: string,
  run: () => Promise<T>,
): Promise<T> {
  calls.push({ kind, target });
  if (!arrivals || !gate?.(kind, target, source)) return run();
  let release: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markSettled: () => void;
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  arrivals.push({ kind, target, source, release: release!, settled });
  announce?.();
  await held;
  try {
    return await run();
  } finally {
    markSettled!();
  }
}

mock.module('node:fs/promises', {
  namedExports: {
    ...realFs,
    rename: (from: string, to: string) =>
      pass('rename', String(to), String(from), () => realFs.rename(from, to)),
    mkdir: (target: string, ...rest: unknown[]) =>
      pass('mkdir', String(target), String(target), () =>
        (realFs.mkdir as (...args: unknown[]) => Promise<unknown>)(
          target,
          ...rest,
        ),
      ),
  },
});

mock.module('trash', {
  defaultExport: (target: string | string[]) => {
    const first = Array.isArray(target) ? target[0]! : target;
    return pass('trash', first, first, () =>
      rm(first, { recursive: true, force: true }),
    );
  },
});

const {
  createStartNode,
  deleteTaskGraphNode,
  listTaskGraphNodes,
  updateStartNode,
} = await import('../lib/task-graph.ts');
const { PublicApiError } = await import('../lib/api-errors.ts');

const managerHome = await mkdtemp(path.join(os.tmpdir(), 'am-tgc-home-'));
process.env.AGENT_MANAGER_HOME = managerHome;

function armBarrier(
  match: (kind: string, target: string, source: string) => boolean,
) {
  arrivals = [];
  gate = match;
  return {
    waitFor(count: number) {
      if ((arrivals?.length ?? 0) >= count) return Promise.resolve();
      return new Promise<void>((resolve) => {
        announce = () => {
          if ((arrivals?.length ?? 0) >= count) {
            announce = null;
            resolve();
          }
        };
      });
    },
    at(index: number) {
      const arrival = arrivals?.[index];
      assert.ok(arrival, `expected an arrival at index ${index}`);
      return arrival;
    },
    count() {
      return arrivals?.length ?? 0;
    },
    disarm() {
      for (const arrival of arrivals ?? []) arrival.release();
      arrivals = null;
      gate = null;
      announce = null;
    },
  };
}

function resetCalls() {
  calls = [];
}

function isCanvasPublication(kind: string, target: string) {
  return (
    kind === 'rename' &&
    /nodes[\\/]NODE-[0-9a-f]{8,32}$/.test(target) &&
    !target.includes('.tmp')
  );
}

function isRecordPublication(kind: string, target: string) {
  return kind === 'rename' && target.endsWith(`${path.sep}node.json`);
}

async function stagedTitle(arrival: Arrival) {
  const direct = await readFile(arrival.source, 'utf8').catch(() => null);
  const text =
    direct ?? (await readFile(path.join(arrival.source, 'node.json'), 'utf8'));
  return (JSON.parse(text) as { title: string }).title;
}

async function releaseFirstArrival(barrier: ReturnType<typeof armBarrier>) {
  const arrival = barrier.at(0);
  const title = await stagedTitle(arrival);
  arrival.release();
  await arrival.settled;
  return title;
}

let projectSequence = 0;

async function makeProject() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), 'am-tgc-'));
  projectSequence += 1;
  const project: RegisteredProject = {
    id: `PROJECT-${String(projectSequence).padStart(4, '0')}`,
    kind: 'standalone',
    name: 'Task Graph Concurrency Fixture',
    description: 'Deterministic Task Graph concurrency fixture.',
    rootPath,
    codePath: null,
    planningPath: path.join(rootPath, 'planning'),
    createdAt: new Date(0).toISOString(),
  };
  return {
    project,
    cleanup: () => rm(rootPath, { recursive: true, force: true }),
  };
}

function markdown(name: string, body: string) {
  return new File([body], name, { type: 'text/markdown' });
}

function nodesPath(project: RegisteredProject, graphRoot = 'task-graph') {
  return path.join(project.planningPath, graphRoot, 'nodes');
}

async function canvasEntries(
  project: RegisteredProject,
  graphRoot = 'task-graph',
) {
  const entries = await readdir(nodesPath(project, graphRoot)).catch(
    () => [] as string[],
  );
  return {
    published: entries.filter((entry) => entry.startsWith('NODE-')).sort(),
    temporary: entries.filter((entry) => entry.startsWith('.')).sort(),
  };
}

async function temporaryRecords(project: RegisteredProject, nodeId: string) {
  const entries = await readdir(path.join(nodesPath(project), nodeId)).catch(
    () => [] as string[],
  );
  return entries.filter((entry) => entry.endsWith('.tmp')).sort();
}

async function exists(target: string) {
  return stat(target).then(
    () => true,
    () => false,
  );
}

async function seedStartNode(project: RegisteredProject) {
  const created = await createStartNode(project, {
    title: 'Seed',
    contextRefs: [],
    files: [markdown('seed.md', '# seed\n')],
    idea: 'The seeded idea.',
  });
  const attachment = created.node.resources.find(
    (resource) => resource.kind === 'attachment',
  );
  assert.ok(attachment, 'the seed must publish one attachment');
  return { node: created.node, attachmentRef: attachment.path };
}

async function registerProject(project: RegisteredProject) {
  await writeFile(
    path.join(managerHome, 'config.json'),
    `${JSON.stringify({ schemaVersion: 1, projects: [project] }, null, 2)}\n`,
  );
  return import('../app/api/projects/[projectId]/nodes/route.ts');
}

function createForm(title: string, idea: string) {
  const form = new FormData();
  form.set('title', title);
  form.set('idea', idea);
  return new Request('http://localhost:3000/api/projects/PROJECT-0001/nodes', {
    method: 'POST',
    body: form,
    headers: { host: 'localhost:3000' },
  });
}

void test('two concurrent creates in one Canvas leave exactly one Start Node', async () => {
  const { project, cleanup } = await makeProject();
  const barrier = armBarrier(isCanvasPublication);
  try {
    const first = createStartNode(project, {
      title: 'Alpha',
      contextRefs: [],
      files: [],
      idea: 'The alpha idea.',
    });
    const second = createStartNode(project, {
      title: 'Beta',
      contextRefs: [],
      files: [],
      idea: 'The beta idea.',
    });
    await barrier.waitFor(1);
    const committedTitle = await releaseFirstArrival(barrier);
    const arrivalsBeforeCompletion = barrier.count();
    barrier.disarm();
    const outcomes = await Promise.allSettled([first, second]);

    assert.equal(
      arrivalsBeforeCompletion,
      1,
      'a serialized second create must never reach the publication rename',
    );
    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ['fulfilled', 'rejected'],
      'one create must win and the other must be refused',
    );
    assert.equal(
      committedTitle,
      'Alpha',
      'invocation order must decide which create commits',
    );
    const refusal = (outcomes[1] as PromiseRejectedResult).reason;
    assert.ok(
      refusal instanceof PublicApiError,
      'the losing create must fail with a public conflict, not a filesystem error',
    );
    assert.equal(refusal.message, 'This Canvas already has a Start node.');
    assert.equal(refusal.status, 409);

    const nodes = await listTaskGraphNodes(project);
    assert.equal(
      nodes.filter((node) => node.role === 'start').length,
      1,
      'one Canvas holds exactly one Start Node',
    );
    assert.equal(nodes[0]?.title, 'Alpha');
    const state = await canvasEntries(project);
    assert.equal(state.published.length, 1);
    assert.deepEqual(
      state.temporary,
      [],
      'no temporary node directory may remain',
    );
    const identities = JSON.parse(
      await readFile(
        path.join(project.planningPath, 'task-graph', 'identities.json'),
        'utf8',
      ),
    ) as { aliases: Record<string, string>; formalAliases: string[] };
    assert.deepEqual(identities.formalAliases, state.published);
  } finally {
    barrier.disarm();
    await cleanup();
  }
});

void test('independent Canvases and independent projects reach publication concurrently', async () => {
  for (const scenario of [
    {
      label: 'two graph roots in one project',
      async start() {
        const { project, cleanup } = await makeProject();
        return {
          cleanup,
          calls: [
            createStartNode(
              project,
              {
                title: 'Alpha',
                contextRefs: [],
                files: [],
                idea: 'The alpha idea.',
              },
              'task-graph',
            ),
            createStartNode(
              project,
              {
                title: 'Beta',
                contextRefs: [],
                files: [],
                idea: 'The beta idea.',
              },
              'whats-next',
            ),
          ],
        };
      },
    },
    {
      label: 'two projects on one graph root',
      async start() {
        const left = await makeProject();
        const right = await makeProject();
        return {
          cleanup: async () => {
            await left.cleanup();
            await right.cleanup();
          },
          calls: [
            createStartNode(left.project, {
              title: 'Alpha',
              contextRefs: [],
              files: [],
              idea: 'The alpha idea.',
            }),
            createStartNode(right.project, {
              title: 'Beta',
              contextRefs: [],
              files: [],
              idea: 'The beta idea.',
            }),
          ],
        };
      },
    },
  ]) {
    const barrier = armBarrier(isCanvasPublication);
    const started = await scenario.start();
    try {
      await barrier.waitFor(2);
      assert.equal(
        barrier.count(),
        2,
        `${scenario.label}: both operations must reach publication concurrently`,
      );
      barrier.disarm();
      const outcomes = await Promise.allSettled(started.calls);
      assert.deepEqual(
        outcomes.map((outcome) => outcome.status),
        ['fulfilled', 'fulfilled'],
        `${scenario.label}: independent work must not be refused`,
      );
    } finally {
      barrier.disarm();
      await Promise.allSettled(started.calls);
      await started.cleanup();
    }
  }
});

void test('two concurrent updates to one node settle into one legal invocation order', async () => {
  for (const scenario of [
    {
      label: 'both requests replace the idea',
      idea: { first: 'The alpha idea.', second: 'The beta idea.' },
      committedIdea: /The beta idea\./,
    },
    {
      label: 'both requests only restage attachments',
      idea: { first: undefined, second: undefined },
      committedIdea: /The seeded idea\./,
    },
  ]) {
    const { project, cleanup } = await makeProject();
    const barrier = armBarrier(isRecordPublication);
    try {
      const seed = await seedStartNode(project);
      const first = updateStartNode(project, {
        id: seed.node.id,
        title: 'Alpha',
        contextRefs: [],
        retainedAttachmentRefs: [seed.attachmentRef],
        files: [markdown('alpha.md', '# alpha\n')],
        idea: scenario.idea.first,
      });
      const second = updateStartNode(project, {
        id: seed.node.id,
        title: 'Beta',
        contextRefs: [],
        retainedAttachmentRefs: [],
        files: [markdown('beta.md', '# beta\n')],
        idea: scenario.idea.second,
      });
      await barrier.waitFor(1);
      const arrivalsBeforeFirstCommit = barrier.count();
      const committedFirst = await releaseFirstArrival(barrier);
      barrier.disarm();
      const outcomes = await Promise.allSettled([first, second]);

      assert.equal(
        arrivalsBeforeFirstCommit,
        1,
        `${scenario.label}: a serialized second update must not stage a record against the same read`,
      );
      assert.equal(
        committedFirst,
        'Alpha',
        `${scenario.label}: invocation order must decide which update commits first`,
      );
      assert.deepEqual(
        outcomes.map((outcome) => outcome.status),
        ['fulfilled', 'fulfilled'],
        `${scenario.label}: neither update may fail on the other's staged state`,
      );

      const nodes = await listTaskGraphNodes(project);
      assert.equal(nodes.length, 1);
      const committed = nodes[0]!;
      assert.equal(
        committed.title,
        'Beta',
        `${scenario.label}: the second invocation applies its full request last`,
      );
      const idea = committed.resources.find(
        (resource) => resource.kind === 'idea',
      );
      assert.ok(idea);
      assert.match(
        await readFile(path.join(project.planningPath, idea.path), 'utf8'),
        scenario.committedIdea,
      );
      assert.deepEqual(
        committed.resources
          .filter((resource) => resource.kind === 'attachment')
          .map((resource) => path.basename(resource.path)),
        ['beta.md'],
        `${scenario.label}: the final record carries exactly the second request`,
      );
      for (const resource of committed.resources) {
        assert.ok(
          await exists(path.join(project.planningPath, resource.path)),
          `${scenario.label}: ${resource.path} must exist for the committed record`,
        );
      }
      assert.deepEqual(await temporaryRecords(project, seed.node.id), []);
    } finally {
      barrier.disarm();
      await cleanup();
    }
  }
});

void test('a concurrent update and delete settle into one legal invocation order', async () => {
  for (const scenario of ['update first', 'delete first'] as const) {
    const { project, cleanup } = await makeProject();
    const setup = armBarrier(() => false);
    try {
      const seed = await seedStartNode(project);
      setup.disarm();
      resetCalls();

      if (scenario === 'update first') {
        const barrier = armBarrier(
          (kind, target) =>
            kind === 'mkdir' &&
            target.endsWith(path.join(seed.node.id, 'resources')),
        );
        const update = updateStartNode(project, {
          id: seed.node.id,
          title: 'Alpha',
          contextRefs: [],
          retainedAttachmentRefs: [seed.attachmentRef],
          files: [],
          idea: 'The alpha idea.',
        });
        await barrier.waitFor(1);
        const remove = deleteTaskGraphNode(project, seed.node.id);
        assert.equal(
          calls.some((call) => call.kind === 'trash'),
          false,
          'a serialized delete must not remove the node while an update holds the Canvas',
        );
        barrier.at(0).release();
        barrier.disarm();
        const [updated, removed] = await Promise.allSettled([update, remove]);
        assert.equal(updated.status, 'fulfilled');
        assert.equal(removed.status, 'fulfilled');
        assert.deepEqual(await listTaskGraphNodes(project), []);
        assert.deepEqual((await canvasEntries(project)).published, []);
      } else {
        const barrier = armBarrier((kind) => kind === 'trash');
        const remove = deleteTaskGraphNode(project, seed.node.id);
        await barrier.waitFor(1);
        const update = updateStartNode(project, {
          id: seed.node.id,
          title: 'Alpha',
          contextRefs: [],
          retainedAttachmentRefs: [seed.attachmentRef],
          files: [],
          idea: 'The alpha idea.',
        });
        barrier.at(0).release();
        await barrier.at(0).settled;
        barrier.disarm();
        const [removed, updated] = await Promise.allSettled([remove, update]);
        assert.equal(removed.status, 'fulfilled');
        assert.equal(updated.status, 'rejected');
        const refusal = (updated as PromiseRejectedResult).reason;
        assert.ok(
          refusal instanceof PublicApiError,
          'an update against a removed node must be an actionable state error',
        );
        assert.equal(refusal.message, 'The node could not be found.');
        assert.equal(refusal.status, 400);
        assert.deepEqual(await listTaskGraphNodes(project), []);
        assert.deepEqual((await canvasEntries(project)).published, []);
      }
    } finally {
      setup.disarm();
      await cleanup();
    }
  }
});

void test('a rejected mutation releases the Canvas for the next caller', async () => {
  const { project, cleanup } = await makeProject();
  try {
    const rejected = createStartNode(project, {
      title: 'Rejected',
      contextRefs: ['context/library/missing.md'],
      files: [],
      idea: 'The rejected idea.',
    });
    const accepted = createStartNode(project, {
      title: 'Accepted',
      contextRefs: [],
      files: [],
      idea: 'The accepted idea.',
    });
    const outcomes = await Promise.allSettled([rejected, accepted]);
    assert.equal(outcomes[0]!.status, 'rejected');
    assert.equal(
      outcomes[1]!.status,
      'fulfilled',
      'a rejection must not leave the Canvas queue held',
    );

    const nodes = await listTaskGraphNodes(project);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]?.title, 'Accepted');

    const again = await createStartNode(project, {
      title: 'Third',
      contextRefs: [],
      files: [],
      idea: 'The third idea.',
    }).then(
      () => null,
      (error: unknown) => error,
    );
    assert.ok(again instanceof PublicApiError);
    assert.equal(again.message, 'This Canvas already has a Start node.');
    assert.deepEqual((await canvasEntries(project)).temporary, []);
  } finally {
    await cleanup();
  }
});

void test('the losing create is answered as a public conflict through the Route', async () => {
  const { project, cleanup } = await makeProject();
  const barrier = armBarrier(isCanvasPublication);
  try {
    const route = await registerProject(project);
    const first = route.POST(createForm('Alpha', 'The alpha idea.'), {
      params: Promise.resolve({ projectId: project.id }),
    });
    const second = route.POST(createForm('Beta', 'The beta idea.'), {
      params: Promise.resolve({ projectId: project.id }),
    });
    await barrier.waitFor(1);
    await releaseFirstArrival(barrier);
    barrier.disarm();
    const responses = await Promise.all([first, second]);
    assert.deepEqual(
      responses.map((response) => response.status).sort((a, b) => a - b),
      [201, 409],
      'exactly one Route call commits and the other meets the Canvas rule',
    );

    const conflict = responses.find((response) => response.status === 409)!;
    const body = (await conflict.json()) as { error: string };
    assert.equal(body.error, 'This Canvas already has a Start node.');
    assert.equal(
      JSON.stringify(body).includes(project.planningPath),
      false,
      'no absolute path may reach the client',
    );

    const state = await canvasEntries(project);
    assert.equal(state.published.length, 1);
    assert.deepEqual(state.temporary, []);
  } finally {
    barrier.disarm();
    await cleanup();
  }
});
