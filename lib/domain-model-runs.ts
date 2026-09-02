import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AgentProfile } from './agent-profile.ts';
import { validateAgentProfile } from './agent-profile.ts';
import { PublicApiError } from './api-errors.ts';
import {
  applyProposedDomainModel,
  readDomainModelCommitReceipt,
  readDomainModel,
  type DomainChange,
} from './domain-model.ts';
import {
  domainModelDirectory,
  domainModelFile,
} from './domain-model-storage.ts';
import {
  createDomainModelRequest,
  domainModelPrompt,
  parseDomainModelResult,
  type DomainModelAgentResult,
  type DomainModelRequest,
} from './domain-model-harness.ts';
import {
  startLocalAgentRun,
  type LocalAgentUsage,
} from './local-agent-transport.ts';
import {
  redactActivity,
  type LocalAgentActivity,
} from './local-agent-activity.ts';
import type { RegisteredProject } from './project-registry.ts';

export type DomainModelRunRecord = {
  schemaVersion: 1;
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  instruction: string;
  selectedIds: string[];
  profile: AgentProfile;
  baseVersion: number;
  startedAt: string;
  endedAt: string | null;
  agentSessionId: string | null;
  usage: LocalAgentUsage | null;
  activity: Array<{ at: string; summary: string }>;
  result: DomainModelAgentResult | null;
  change: DomainChange | null;
  error: string | null;
};
type ActiveRun = {
  runId: string;
  cancel: () => void;
  canceled: boolean;
  settling: boolean;
  terminal: DomainModelRunRecord | null;
  activity: Array<{ at: string; summary: string }>;
};
const runtime = globalThis as typeof globalThis & {
  domainModelRuns?: Map<string, ActiveRun>;
};
const activeRuns = (runtime.domainModelRuns ??= new Map());

export async function startDomainModelRun(
  project: RegisteredProject,
  input: {
    instruction: string;
    selectedIds: string[];
    profile: AgentProfile;
  },
  transport = startLocalAgentRun,
) {
  validateAgentProfile(input.profile);
  const instruction = input.instruction.trim();
  if (!instruction || Buffer.byteLength(instruction) > 20_000)
    throw new PublicApiError(
      'A bounded Domain Model instruction is required.',
      400,
    );
  if (input.selectedIds.length > 20)
    throw new PublicApiError('Select no more than 20 Domain elements.', 400);
  const key = project.planningPath;
  if (activeRuns.has(key))
    throw new PublicApiError(
      'A Domain Model Agent Run is already active.',
      409,
    );
  const runId = `RUN-${randomUUID()}`;
  const activity: ActiveRun['activity'] = [];
  const active: ActiveRun = {
    runId,
    cancel: () => undefined,
    canceled: false,
    settling: false,
    terminal: null,
    activity,
  };
  activeRuns.set(key, active);
  try {
    const model = await readDomainModel(project);
    const available = new Set([
      ...model.entities.map((item) => item.id),
      ...model.relationships.map((item) => item.id),
    ]);
    const selectedIds = [...new Set(input.selectedIds)];
    if (selectedIds.some((id) => !available.has(id)))
      throw new PublicApiError(
        'A selected Domain element is no longer available.',
        409,
      );
    const request = createDomainModelRequest({
      requestId: runId,
      instruction,
      selectedIds,
      model,
      previousSummary: await latestSummary(project),
    });
    const run: DomainModelRunRecord = {
      schemaVersion: 1,
      id: runId,
      status: 'running',
      instruction,
      selectedIds,
      profile: structuredClone(input.profile),
      baseVersion: model.stateVersion,
      startedAt: new Date().toISOString(),
      endedAt: null,
      agentSessionId: null,
      usage: null,
      activity,
      result: null,
      change: null,
      error: null,
    };
    await writeRun(project, run, {
      'request.json': JSON.stringify(request),
      'context/index.json': JSON.stringify(contextIndex(request)),
    });
    const agentRun = transport(input.profile.agent, {
      workingDirectory: project.rootPath,
      protectedPath: project.planningPath,
      prompt: domainModelPrompt(request),
      model: input.profile.model || undefined,
      effort: input.profile.effort || undefined,
      access: 'read-only',
      disableDelegation: true,
      isolatedProcessGroup: true,
      onActivity: (event) => recordActivity(activity, event),
    });
    active.cancel = agentRun.cancel;
    void agentRun.completion
      .then((result) => settle(project, request, run, active, result))
      .catch((error: unknown) => fail(project, run, active, error))
      .finally(() => {
        if (activeRuns.get(key) === active) activeRuns.delete(key);
      });
    return run;
  } catch (error) {
    if (activeRuns.get(key) === active) activeRuns.delete(key);
    throw error;
  }
}

export async function cancelDomainModelRun(
  project: RegisteredProject,
  runId: string,
) {
  const active = activeRuns.get(project.planningPath);
  if (!active || active.runId !== runId)
    throw new PublicApiError('The Domain Model Run is not active.', 400);
  if (active.settling)
    throw new PublicApiError('The Domain Model Run is already finishing.', 409);
  active.canceled = true;
  active.cancel();
  const run = await readDomainModelRun(project, runId);
  const canceled: DomainModelRunRecord = {
    ...run,
    status: 'canceled',
    endedAt: new Date().toISOString(),
    activity: [...active.activity],
    error: null,
  };
  active.terminal = canceled;
  await writeRun(project, canceled, {
    'activity.jsonl': activityJsonl(canceled.activity),
    'summary.md':
      '# Canceled\n\nThe Agent Run was canceled. The Domain Model was not changed.\n',
  });
  return canceled;
}

export async function readDomainModelRun(
  project: RegisteredProject,
  runId: string,
) {
  if (!/^RUN-[0-9a-f-]{36}$/.test(runId))
    throw new PublicApiError('Invalid Domain Model Run.', 400);
  const run = JSON.parse(
    await readFile(
      await domainModelFile(project, ['runs', runId], 'run.json'),
      'utf8',
    ),
  ) as DomainModelRunRecord;
  const active = activeRuns.get(project.planningPath);
  if (active?.runId === run.id && active.terminal) return active.terminal;
  if (run.status === 'running' && active?.runId === run.id)
    return { ...run, activity: [...active.activity] };
  if (run.status === 'running') {
    const receipt = await readDomainModelCommitReceipt(project, run.id);
    if (receipt)
      return {
        ...run,
        status: 'succeeded' as const,
        endedAt: receipt.committedAt,
        error:
          'The Domain Model was updated, but some Run evidence could not be saved.',
      };
    return {
      ...run,
      status: 'failed' as const,
      endedAt: new Date().toISOString(),
      error: 'The Agent Run was interrupted. The Domain Model was not changed.',
    };
  }
  return run;
}

export async function listLatestDomainModelRuns(
  project: RegisteredProject,
  limit = 12,
) {
  const entries = await readdir(await runsRoot(project), {
    withFileTypes: true,
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const runs = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() && /^RUN-[0-9a-f-]{36}$/.test(entry.name),
      )
      .map((entry) => readDomainModelRun(project, entry.name)),
  );
  return runs
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, limit);
}

async function settle(
  project: RegisteredProject,
  request: DomainModelRequest,
  original: DomainModelRunRecord,
  active: ActiveRun,
  agent: {
    agentSessionId: string | null;
    finalOutput: string;
    usage: LocalAgentUsage | null;
  },
) {
  if (active.canceled) return;
  active.settling = true;
  let result = parseDomainModelResult(agent.finalOutput, request);
  let change: DomainChange | null = null;
  if (result.outcome === 'applied') {
    const applied = await applyProposedDomainModel(project, {
      baseVersion: request.baseVersion,
      runId: original.id,
      instruction: original.instruction,
      summary: result.summary,
      proposed: result.model,
    });
    change = applied.change;
    if (!change)
      result = {
        harnessVersion: result.harnessVersion,
        requestId: result.requestId,
        baseVersion: result.baseVersion,
        inputFingerprint: result.inputFingerprint,
        outcome: 'no-change',
        summary: result.summary,
        reason: 'The current Domain Model already represents this request.',
      };
  }
  const run: DomainModelRunRecord = {
    ...original,
    status: 'succeeded',
    endedAt: new Date().toISOString(),
    agentSessionId: agent.agentSessionId,
    usage: agent.usage,
    activity: [...active.activity],
    result,
    change,
    error: null,
  };
  active.terminal = run;
  await writeRun(project, run, {
    'activity.jsonl': activityJsonl(run.activity),
    'agent-output.txt': agent.finalOutput.slice(0, 1_500_000),
    'change.json': JSON.stringify(change),
    'summary.md': summaryMarkdown(result, change),
  });
}

async function fail(
  project: RegisteredProject,
  original: DomainModelRunRecord,
  active: ActiveRun,
  error: unknown,
) {
  if (active.canceled) return;
  active.settling = true;
  if (active.terminal?.status === 'succeeded') {
    const terminal = active.terminal;
    await writeRun(project, active.terminal, {
      'activity.jsonl': activityJsonl(terminal.activity),
      'summary.md': terminal.result
        ? summaryMarkdown(terminal.result, terminal.change)
        : '# Completed\n\nThe Agent Run completed.\n',
    }).catch(() => undefined);
    return;
  }
  const run: DomainModelRunRecord = {
    ...original,
    status: 'failed',
    endedAt: new Date().toISOString(),
    activity: [...active.activity],
    error:
      'The Domain Model Agent did not complete. The current model was not changed.',
  };
  active.terminal = run;
  await writeRun(project, run, {
    'activity.jsonl': activityJsonl(run.activity),
    'failure.txt': redactActivity(String(error)).slice(0, 100_000),
    'summary.md': `# Failed\n\n${run.error}\n`,
  }).catch(() => undefined);
}

function contextIndex(request: DomainModelRequest) {
  return {
    baseVersion: request.baseVersion,
    selectedIds: request.selectedIds,
    entityIndex: request.model.entities.map((item) => ({
      id: item.id,
      name: item.name,
      meaning: item.meaning,
    })),
    relationships: request.model.relationships.map((item) => ({
      id: item.id,
      sourceEntityId: item.sourceEntityId,
      targetEntityId: item.targetEntityId,
      label: item.label,
    })),
    previousSummary: request.previousSummary,
  };
}

function recordActivity(
  target: ActiveRun['activity'],
  event: LocalAgentActivity,
) {
  const summary = event.summary.trim().slice(0, 600);
  if (!summary) return;
  target.push({ at: new Date().toISOString(), summary });
  if (target.length > 300) target.splice(0, target.length - 300);
}

function activityJsonl(activity: DomainModelRunRecord['activity']) {
  return activity.map((item) => JSON.stringify(item)).join('\n') + '\n';
}

function summaryMarkdown(
  result: DomainModelAgentResult,
  change: DomainChange | null,
) {
  const details = change
    ? `\n- Added: ${change.added.length}\n- Updated: ${change.updated.length}\n- Removed: ${change.removed.length}\n`
    : '';
  const attention =
    result.outcome === 'clarification'
      ? `\n## Question\n\n${result.question}\n`
      : result.outcome === 'no-change'
        ? `\n## Reason\n\n${result.reason}\n`
        : '';
  return `# ${result.outcome === 'applied' ? 'Applied' : result.outcome === 'clarification' ? 'Clarification' : 'No change'}\n\n${result.summary}\n${details}${attention}`;
}

async function latestSummary(project: RegisteredProject) {
  const runs = await listLatestDomainModelRuns(project, 20);
  const latest = runs.find((run) => run.status === 'succeeded');
  if (!latest) return '';
  return readFile(
    await domainModelFile(project, ['runs', latest.id], 'summary.md'),
    'utf8',
  ).catch(() => '');
}

async function writeRun(
  project: RegisteredProject,
  run: DomainModelRunRecord,
  files: Record<string, string>,
) {
  const directory = await runPath(project, run.id);
  await atomicText(
    path.join(directory, 'run.json'),
    `${JSON.stringify(run, null, 2)}\n`,
  );
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await atomicText(target, content.endsWith('\n') ? content : `${content}\n`);
  }
}

async function atomicText(file: string, content: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: 'wx' });
  await rename(temporary, file);
}

function runsRoot(project: RegisteredProject) {
  return domainModelDirectory(project, ['runs']);
}
function runPath(project: RegisteredProject, runId: string, create = true) {
  return domainModelDirectory(project, ['runs', runId], create);
}
