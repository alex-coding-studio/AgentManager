import { randomUUID } from 'node:crypto';
import {
  readdir,
  mkdir,
  writeFile,
  rename,
  realpath,
  lstat,
} from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from './project-registry.ts';
import {
  startLocalAgentRun,
  type LocalAgentRun,
  type LocalAgentUsage,
} from './local-agent-transport.ts';
import {
  assertCardUuid,
  createCardHarnessRequest,
  buildCardHarnessPrompt,
  parseCardHarnessResult,
  type ExecutionPlan,
  type ActionContract,
  type CardHarnessContext,
  type CardHarnessRequest,
} from './just-do-it-harness.ts';
import {
  appendCardWorkRecord,
  readCardWorklog,
  readCardWorkDocument,
  type CardWorkRecord,
} from './just-do-it-worklog.ts';
import {
  listPlanningSources,
  snapshotPlanningSource,
  readPlanningFile,
  type PlanningSource,
} from './just-do-it-planning-sources.ts';

export type PlanningProfile = {
  agent: 'codex' | 'claude';
  model: string;
  effort: '' | 'low' | 'medium' | 'high' | 'xhigh';
};
export type PlanningResource = { name: string; ref: string };
export type PlanningRun = {
  feedback?: string;
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  targetId: string | null;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  agentSessionId: string | null;
  usage: LocalAgentUsage | null;
  hostPid: number;
  profile: PlanningProfile;
};
export type PlanningCard = {
  schemaVersion: 1;
  id: string;
  revision: number;
  source: PlanningSource;
  sourceRef: string;
  requirements: string;
  resources: PlanningResource[];
  plan: ExecutionPlan | null;
  planRef?: string;
  actions: ActionContract[];
  run: PlanningRun | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};
export type StartPlanningInput = {
  cardId: string;
  expectedRevision: number;
  feedback: string;
  targetId: string | null;
  requirements: string;
  profile: PlanningProfile;
  files: Array<{ name: string; content: string }>;
  contextRefs: string[];
  retainRefs: string[];
};
type Running = {
  id: string;
  handle: LocalAgentRun | null;
  timer: ReturnType<typeof setTimeout> | null;
};
type Transport = typeof startLocalAgentRun;
const runtimeGlobal = globalThis as typeof globalThis & {
  jdiPlanningActive?: Map<string, Running>;
};
const defaultActive = (runtimeGlobal.jdiPlanningActive ??= new Map());

function root(project: RegisteredProject) {
  return path.join(project.planningPath, 'implementation', 'cards');
}

async function checkStorageRoot(project: RegisteredProject, create = false) {
  let directory = await realpath(project.planningPath);
  for (const part of ['implementation', 'cards']) {
    directory = path.join(directory, part);
    if (create)
      await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('Invalid Planning storage directory.');
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
function revisionRef(cardId: string, revision: number, name: string) {
  return `implementation/cards/${cardId}/${String(revision).padStart(8, '0')}/${name}`;
}
function key(project: RegisteredProject, cardId: string) {
  return `${project.planningPath}:${cardId}`;
}
function assertRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid expected revision.');
}

export function validatePlanningProfile(profile: PlanningProfile) {
  if (
    !profile ||
    !['codex', 'claude'].includes(profile.agent) ||
    typeof profile.model !== 'string' ||
    (profile.model &&
      !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(profile.model)) ||
    !['', 'low', 'medium', 'high', 'xhigh'].includes(profile.effort)
  )
    throw new Error('Invalid Agent configuration.');
}

export function createPlanningService(
  transport: Transport = startLocalAgentRun,
  active = defaultActive,
  timeoutMs = 600_000,
) {
  async function load(project: RegisteredProject, cardId: string) {
    await checkStorageRoot(project);
    const log = await readCardWorklog(root(project), cardId);
    if (!log.revision) throw new Error('Planning Card not found.');
    const card = JSON.parse(
      await readCardWorkDocument(
        root(project),
        cardId,
        log.revision,
        'planning-state.json',
      ),
    ) as PlanningCard;
    if (
      card.schemaVersion !== 1 ||
      card.id !== cardId ||
      card.revision !== log.revision ||
      !card.source ||
      !Array.isArray(card.actions) ||
      !Array.isArray(card.resources)
    )
      throw new Error('Invalid Planning Card state.');
    return { card, log };
  }

  async function commit(
    project: RegisteredProject,
    previous: number,
    card: PlanningCard,
    record: CardWorkRecord,
    files: Record<string, string> = {},
  ) {
    await checkStorageRoot(project, true);
    const next = {
      ...card,
      revision: previous + 1,
      updatedAt: new Date().toISOString(),
    };
    await appendCardWorkRecord(root(project), card.id, previous, record, {
      ...files,
      'planning-state.json': JSON.stringify(next),
    });
    return next;
  }

  async function read(
    project: RegisteredProject,
    cardId: string,
  ): Promise<PlanningCard> {
    const { card } = await load(project, cardId);
    if (
      card.run?.status === 'running' &&
      active.get(key(project, cardId))?.id !== card.run.id
    ) {
      if (card.run.hostPid !== process.pid) {
        try {
          process.kill(card.run.hostPid, 0);
          return card;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
      const next = {
        ...card,
        run: {
          ...card.run,
          status: 'failed' as const,
          endedAt: new Date().toISOString(),
          error:
            'Planning was interrupted. Your previous plan and input are retained; retry when ready.',
        },
      };
      try {
        return await commit(project, card.revision, next, {
          kind: 'system-event',
          stage: 'planning',
          actionId: null,
          event: 'run-ended',
          text: next.run.error!,
          refs: [],
        });
      } catch (error) {
        if (/revision conflict/.test(String(error)))
          return (await load(project, cardId)).card;
        throw error;
      }
    }
    return card;
  }

  async function list(project: RegisteredProject) {
    await checkStorageRoot(project);
    const names = await readdir(root(project)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    const cards: PlanningCard[] = [];
    for (const name of names) {
      try {
        assertCardUuid(name);
      } catch {
        continue;
      }
      cards.push(await read(project, name));
    }
    return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function importSource(
    project: RegisteredProject,
    module: string,
    uid: string,
  ) {
    if (!['whats-next', 'task-graph'].includes(module))
      throw new Error('Unknown source module.');
    assertCardUuid(uid);
    await checkStorageRoot(project);
    const existing = await readCardWorklog(root(project), uid);
    if (existing.revision) return read(project, uid);
    const { source, markdown } = await snapshotPlanningSource(
      project,
      module,
      uid,
    );
    const now = new Date().toISOString();
    const card: PlanningCard = {
      schemaVersion: 1,
      id: uid,
      revision: 0,
      source,
      sourceRef: revisionRef(uid, 1, 'source.md'),
      requirements: '',
      resources: [],
      plan: null,
      actions: [],
      run: null,
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
    };
    try {
      return await commit(
        project,
        0,
        card,
        {
          kind: 'user-input',
          stage: 'planning',
          actionId: null,
          text: `Imported goal: ${source.title}\nSource: ${source.module}/${source.id}`,
        },
        { 'source.md': markdown },
      );
    } catch (error) {
      if (/revision conflict/.test(String(error))) return read(project, uid);
      throw error;
    }
  }

  async function finish(
    project: RegisteredProject,
    request: CardHarnessRequest,
    outcome: Awaited<LocalAgentRun['completion']> | Error,
  ) {
    const cardKey = key(project, request.context.cardId);
    try {
      const { card, log } = await load(project, request.context.cardId);
      if (
        card.run?.id !== request.requestId ||
        card.run.status !== 'running' ||
        log.revision !== request.context.contextRevision
      )
        return;
      let raw = '';
      try {
        if (outcome instanceof Error) throw outcome;
        raw = outcome.finalOutput;
        const result = parseCardHarnessResult(raw, request, log.revision);
        if (result.stage !== 'planning')
          throw new Error('Expected a Planning response.');
        const next: PlanningCard = {
          ...card,
          planRef: revisionRef(card.id, card.revision + 1, 'plan.md'),
          plan: {
            status: 'draft',
            overview: result.overview,
            steps: result.steps,
          },
          actions: [],
          run: {
            ...card.run,
            status: 'succeeded',
            endedAt: new Date().toISOString(),
            error: null,
            agentSessionId: outcome.agentSessionId,
            usage: outcome.usage,
          },
        };
        await commit(
          project,
          card.revision,
          next,
          {
            kind: 'agent-note',
            stage: 'planning',
            actionId: request.actionId,
            basedOnRevision: log.revision,
            summary: result.handoffSummary.slice(0, 600),
            currentState:
              `Goal: ${card.source.title}\nPlan: draft, not finalized.\nPlan document: ../${String(card.revision + 1).padStart(8, '0')}/plan.md\n${result.handoffSummary}\nNext: user reviews the current Plan. No Action has executed.`.slice(
                0,
                6000,
              ),
          },
          {
            'result.json': JSON.stringify(result),
            'raw-response.txt': raw,
            'plan.md': renderPlan(next.plan!),
          },
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Planning failed.';
        const next: PlanningCard = {
          ...card,
          run: {
            ...card.run,
            status: 'failed',
            endedAt: new Date().toISOString(),
            error: message,
            agentSessionId:
              outcome instanceof Error ? null : outcome.agentSessionId,
            usage: outcome instanceof Error ? null : outcome.usage,
          },
        };
        await commit(
          project,
          card.revision,
          next,
          {
            kind: 'system-event',
            stage: 'planning',
            actionId: request.actionId,
            event: 'run-ended',
            text: message,
            refs: [],
          },
          raw ? { 'raw-response.txt': raw.slice(0, 500_000) } : {},
        );
      }
    } finally {
      const running = active.get(cardKey);
      if (running?.id === request.requestId) {
        if (running.timer) clearTimeout(running.timer);
        active.delete(cardKey);
      }
    }
  }

  async function start(project: RegisteredProject, input: StartPlanningInput) {
    assertCardUuid(input.cardId);
    assertRevision(input.expectedRevision);
    validatePlanningProfile(input.profile);
    if (
      typeof input.feedback !== 'string' ||
      input.feedback.length > 20_000 ||
      typeof input.requirements !== 'string' ||
      input.requirements.length > 20_000 ||
      !Array.isArray(input.files) ||
      !Array.isArray(input.contextRefs) ||
      !Array.isArray(input.retainRefs) ||
      (input.targetId !== null && typeof input.targetId !== 'string')
    )
      throw new Error('Invalid planning input.');
    const card = await read(project, input.cardId);
    if (card.revision !== input.expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    if (card.run?.status === 'running')
      throw new Error('This Card already has a running Agent.');
    if (card.plan?.status === 'finalized')
      throw new Error('Reopen the Plan before adjusting it.');
    const { log } = await load(project, input.cardId);
    if (
      input.targetId &&
      (input.requirements !== card.requirements ||
        input.files.length ||
        input.contextRefs.length ||
        input.retainRefs.length !== card.resources.length ||
        card.resources.some((item) => !input.retainRefs.includes(item.ref)))
    ) {
      throw new Error(
        'Single-step feedback cannot change shared requirements or resources.',
      );
    }
    const retained = card.resources.filter((item) =>
      input.retainRefs.includes(item.ref),
    );
    if (
      input.retainRefs.some(
        (ref) => !card.resources.some((item) => item.ref === ref),
      )
    )
      throw new Error('Unknown retained resource.');
    if (retained.length + input.files.length + input.contextRefs.length > 5)
      throw new Error('Attach no more than five resources.');
    const uploads = input.files.map((file) => {
      if (
        !file ||
        typeof file.name !== 'string' ||
        !/^[^/\\]{1,160}\.(md|markdown|txt)$/i.test(file.name) ||
        typeof file.content !== 'string' ||
        Buffer.byteLength(file.content) > 262_144
      )
        throw new Error('Invalid resource; use text/Markdown up to 256 KB.');
      return { ...file };
    });
    for (const ref of new Set(input.contextRefs)) {
      if (
        typeof ref !== 'string' ||
        !/^context\/[a-zA-Z0-9/_.-]+\.(md|markdown)$/i.test(ref)
      )
        throw new Error('Invalid library resource.');
      uploads.push({
        name: path.basename(ref),
        content: await readPlanningFile(project, ref),
      });
    }
    let size = uploads.reduce(
      (total, file) => total + Buffer.byteLength(file.content),
      0,
    );
    for (const resource of retained)
      size += Buffer.byteLength(await readPlanningFile(project, resource.ref));
    if (size > 1_048_576) throw new Error('Resources exceed 1 MB.');
    const files: Record<string, string> = {};
    const resources = [...retained];
    for (const file of uploads) {
      const name = `resource-${randomUUID()}.md`;
      files[name] = file.content;
      resources.push({
        name: file.name,
        ref: revisionRef(card.id, card.revision + 1, name),
      });
    }
    const instructions = await readPlanningInstructions(project);
    const context: CardHarnessContext = {
      cardId: card.id,
      contextRevision: card.revision + 1,
      goal: `${card.source.title}\n${card.source.summary}\nUser requirements: ${input.requirements}\nPrerequisites (not yet verified): ${card.source.dependsOn.join(', ') || 'none'}`,
      moduleInstructions: instructions,
      skills: [],
      resources: [
        {
          ref: path.join(project.planningPath, card.sourceRef),
          description: 'Retained source output; read before planning.',
        },
        ...resources.map((item) => ({
          ref: path.join(project.planningPath, item.ref),
          description: item.name,
        })),
        ...(log.handoffPath
          ? [
              {
                ref: log.handoffPath,
                description:
                  'Card handoff: read references relative to this file as needed.',
              },
            ]
          : []),
      ],
      handoffMarkdown: log.handoffMarkdown,
      plan: card.plan,
      acceptedActionIds: [],
      currentOutput: null,
      execution: {
        running: false,
        hasOutput: false,
        effects: 'clean',
        rollbackConfirmed: false,
        consumedByCardIds: [],
      },
    };
    const request = createCardHarnessRequest(
      context,
      'planning',
      input.feedback ||
        input.requirements ||
        'Create the initial execution Plan.',
      input.targetId,
    );
    const now = new Date().toISOString();
    const next: PlanningCard = {
      ...card,
      requirements: input.requirements,
      resources,
      run: {
        id: request.requestId,
        feedback: input.feedback,
        status: 'running',
        targetId: input.targetId,
        startedAt: now,
        endedAt: null,
        error: null,
        agentSessionId: null,
        usage: null,
        hostPid: process.pid,
        profile: input.profile,
      },
    };
    const prompt = `${buildCardHarnessPrompt(request)}\nPlanning-only runtime: read relevant source and selected resources. Never write project files, run implementation, create Issues/PRs, or execute shell commands with external side effects. Return all user-facing plan text in the language of the user's goal and feedback. The host persists the Plan. Use UUID-form step IDs. Project directory: ${project.rootPath}`;
    const runKey = key(project, card.id);
    if (active.has(runKey))
      throw new Error('This Card already has a running Agent.');
    active.set(runKey, { id: request.requestId, handle: null, timer: null });
    let saved: PlanningCard;
    try {
      saved = await commit(
        project,
        card.revision,
        next,
        {
          kind: 'user-input',
          stage: 'planning',
          actionId: input.targetId,
          text: JSON.stringify({
            requirements: input.requirements,
            feedback: input.feedback,
            profile: input.profile,
            targetId: input.targetId,
            resourceNames: resources.map((item) => item.name),
          }),
        },
        {
          ...files,
          'request.json': JSON.stringify(request),
          'prompt.txt': prompt,
        },
      );
    } catch (error) {
      if (active.get(runKey)?.id === request.requestId) active.delete(runKey);
      throw error;
    }
    if (active.get(runKey)?.id !== request.requestId)
      return (await load(project, card.id)).card;
    let handle: LocalAgentRun;
    try {
      handle = transport(input.profile.agent, {
        workingDirectory: project.rootPath,
        prompt,
        model: input.profile.model || undefined,
        effort: input.profile.effort || undefined,
      });
    } catch (error) {
      await finish(
        project,
        request,
        error instanceof Error ? error : new Error('Could not start Agent.'),
      );
      return (await load(project, card.id)).card;
    }
    const timer = setTimeout(() => {
      handle.cancel();
      void finish(
        project,
        request,
        new Error(
          'Planning timed out. Your input and previous Plan are retained.',
        ),
      ).catch(() => undefined);
    }, timeoutMs);
    timer.unref();
    active.set(key(project, card.id), { id: request.requestId, handle, timer });
    void handle.completion
      .then(
        (result) => finish(project, request, result),
        (error) =>
          finish(
            project,
            request,
            error instanceof Error ? error : new Error(String(error)),
          ),
      )
      .catch(() => undefined);
    return saved;
  }

  async function update(
    project: RegisteredProject,
    cardId: string,
    expectedRevision: number,
    action: 'finalize' | 'reopen' | 'cancel',
  ) {
    if (!['finalize', 'reopen', 'cancel'].includes(action))
      throw new Error('Unknown Planning operation.');
    assertRevision(expectedRevision);
    const card = await read(project, cardId);
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    if (action === 'cancel') {
      if (card.run?.status !== 'running') return card;
      const running = active.get(key(project, cardId));
      if (running?.id !== card.run.id)
        throw new Error('This run is owned by another server process.');
      const next = {
        ...card,
        run: {
          ...card.run,
          status: 'canceled' as const,
          endedAt: new Date().toISOString(),
          error: null,
        },
      };
      const saved = await commit(project, card.revision, next, {
        kind: 'system-event',
        stage: 'planning',
        actionId: card.run.targetId,
        event: 'run-ended',
        text: 'User canceled planning; previous draft retained.',
        refs: [],
      });
      if (running.timer) clearTimeout(running.timer);
      running.handle?.cancel();
      active.delete(key(project, cardId));
      return saved;
    }
    if (card.run?.status === 'running')
      throw new Error('Stop the current Agent before changing Plan state.');
    if (!card.plan) throw new Error('Generate a Plan first.');
    if (action === 'finalize') {
      if (card.run?.status !== 'succeeded')
        throw new Error('Only a successful current Plan can be finalized.');
      return commit(
        project,
        card.revision,
        {
          ...card,
          plan: { ...card.plan, status: 'finalized' },
          actions: structuredClone(card.plan.steps),
          finalizedAt: new Date().toISOString(),
        },
        {
          kind: 'system-event',
          stage: 'planning',
          actionId: null,
          event: 'plan-finalized',
          text: 'User confirmed the entire Plan. Actions are ready; execution is not connected.',
          refs: [],
        },
      );
    }
    return commit(
      project,
      card.revision,
      {
        ...card,
        plan: { ...card.plan, status: 'draft' },
        actions: [],
        finalizedAt: null,
      },
      {
        kind: 'user-input',
        stage: 'planning',
        actionId: null,
        text: 'User reopened the Plan before any Action execution or output.',
      },
    );
  }
  return {
    list,
    read,
    importSource,
    start,
    update,
    sources: listPlanningSources,
  };
}

export const planningService = createPlanningService();

export async function readPlanningInstructions(project: RegisteredProject) {
  try {
    const value = await readPlanningFile(
      project,
      'implementation/instructions.md',
      80_000,
    );
    if (value.length > 20_000)
      throw new Error('Instructions exceed 20000 characters.');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

export async function savePlanningInstructions(
  project: RegisteredProject,
  value: string,
) {
  if (typeof value !== 'string' || value.length > 20_000)
    throw new Error('Instructions must contain at most 20000 characters.');
  const directory = path.join(project.planningPath, 'implementation');
  await mkdir(directory, { recursive: true });
  const actual = await realpath(directory);
  if (!actual.startsWith((await realpath(project.planningPath)) + path.sep))
    throw new Error('Instructions directory escapes the project.');
  const temp = path.join(directory, `instructions-${randomUUID()}.tmp`);
  await writeFile(temp, value, { flag: 'wx' });
  await rename(temp, path.join(directory, 'instructions.md'));
}

function renderPlan(plan: ExecutionPlan) {
  return `# Plan\n\n${plan.overview}\n\n${plan.steps.map((step) => `## ${step.title}\n\nID: ${step.id}\n\n### Input\n${step.input}\n\n### Output\n${step.output}\n\n### Validation\n${step.validation}`).join('\n\n')}\n`;
}
