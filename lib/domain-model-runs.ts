import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
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
import { readDomainModelInstructions } from './domain-model-context.ts';
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
  redactRecord,
  type LocalAgentActivity,
} from './local-agent-activity.ts';
import type { RegisteredProject } from './project-registry.ts';
import { readTaskGraphMarkdownResource } from './task-graph.ts';
import {
  agentGraphContentPacket,
  userInputWorkspaceInput,
  writeAgentGraphContextWorkspace,
  type ContextWorkspaceInput,
} from './agent-graph-context-workspace.ts';

export type DomainModelRunRecord = {
  schemaVersion: 1;
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  instruction?: string;
  userInputPath?: string | null;
  selectedIds: string[];
  contextRefs?: string[];
  attachmentNames?: string[];
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
  agentOutput: string | null;
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
    contextRefs?: string[];
    files?: File[];
  },
  transport = startLocalAgentRun,
) {
  validateAgentProfile(input.profile);
  const instruction = input.instruction.trim();
  if (!instruction)
    throw new PublicApiError('A Domain Model User Input is required.', 400);
  if (input.selectedIds.length > 20)
    throw new PublicApiError('Select no more than 20 Domain elements.', 400);
  const contextRefs = [...new Set(input.contextRefs ?? [])];
  const files = input.files ?? [];
  if (contextRefs.length > 50)
    throw new PublicApiError('Select no more than 50 Context documents.', 400);
  if (files.length > 20)
    throw new PublicApiError('Attach no more than 20 Markdown files.', 400);
  const key = project.planningPath;
  if (activeRuns.has(key))
    throw new PublicApiError(
      'A Domain Model Agent Run is already active.',
      409,
    );
  const runId = `RUN-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const activity: ActiveRun['activity'] = [
    { at: startedAt, summary: 'Generating the Domain Model.' },
  ];
  const active: ActiveRun = {
    runId,
    cancel: () => undefined,
    canceled: false,
    settling: false,
    terminal: null,
    agentOutput: null,
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
    const previousSummary = await latestSummary(project);
    const savedInstructions = await readDomainModelInstructions(project);
    const contextPath = path.join(await runPath(project, runId), 'context');
    try {
      const userInput = userInputWorkspaceInput(
        `domain-model/runs/${runId}/context/input/user-input.md`,
        instruction,
      );
      const moduleInstructions: ContextWorkspaceInput | null =
        savedInstructions.trim()
          ? {
              role: 'related',
              kind: 'module-instructions',
              logicalPath: 'domain-model/instructions.md',
              content: savedInstructions,
            }
          : null;
      const workspace = await writeAgentGraphContextWorkspace(
        await runPath(project, runId),
        [
          ...(userInput ? [userInput] : []),
          ...(moduleInstructions ? [moduleInstructions] : []),
          ...(await domainModelContextInputs(
            project,
            runId,
            contextRefs,
            files,
          )),
        ],
      );
      const content = agentGraphContentPacket(workspace.manifest);
      const request = createDomainModelRequest({
        requestId: runId,
        content,
        selectedIds,
        model,
        previousSummary,
        contextRoot: await relativeContextRoot(project, contextPath),
      });
      const run: DomainModelRunRecord = {
        schemaVersion: 1,
        id: runId,
        status: 'running',
        userInputPath: content.input?.workspacePath ?? null,
        selectedIds,
        contextRefs,
        attachmentNames: files.map((file) => file.name),
        profile: structuredClone(input.profile),
        baseVersion: model.stateVersion,
        startedAt,
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
          if (!active.canceled && activeRuns.get(key) === active)
            activeRuns.delete(key);
        });
      return run;
    } catch (error) {
      await rm(await runPath(project, runId, false), {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      throw error;
    }
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
  if (activeRuns.get(project.planningPath) === active)
    activeRuns.delete(project.planningPath);
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
  if (active?.runId === run.id && active.settling)
    return {
      ...run,
      status: 'running' as const,
      endedAt: null,
      result: null,
      change: null,
      error: null,
      activity: [...active.activity],
    };
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
  active.agentOutput = agent.finalOutput;
  let result = parseDomainModelResult(agent.finalOutput, request);
  let change: DomainChange | null = null;
  if (result.outcome === 'applied') {
    const applied = await applyProposedDomainModel(project, {
      baseVersion: request.baseVersion,
      runId: original.id,
      userInputPath: original.userInputPath ?? null,
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
    'agent-output.txt': redactRecord(agent.finalOutput).slice(0, 1_500_000),
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
  const files: Record<string, string> = {
    'activity.jsonl': activityJsonl(run.activity),
    'failure.txt': redactActivity(String(error)).slice(0, 100_000),
    'summary.md': `# Failed\n\n${run.error}\n`,
  };
  if (active.agentOutput)
    files['agent-output.txt'] = redactRecord(active.agentOutput).slice(
      0,
      1_500_000,
    );
  await writeRun(project, run, files).catch(() => undefined);
}

async function domainModelContextInputs(
  project: RegisteredProject,
  runId: string,
  contextRefs: string[],
  files: File[],
): Promise<ContextWorkspaceInput[]> {
  const references = await Promise.all(
    contextRefs.map(async (resourcePath) => {
      const resource = await readTaskGraphMarkdownResource(
        project,
        resourcePath,
      );
      return {
        role: 'primary' as const,
        kind: 'context',
        logicalPath: resource.path,
        content: resource.markdown,
      };
    }),
  );
  const uploads = await Promise.all(
    files.map(async (file, index) => {
      if (!/\.(md|markdown)$/i.test(file.name))
        throw new PublicApiError(
          'Only Markdown files can be attached to a Domain Model Run.',
          400,
        );
      if (file.size > 2 * 1024 * 1024)
        throw new PublicApiError(
          'Each Domain Model attachment must be 2 MB or smaller.',
          400,
        );
      return {
        role: 'primary' as const,
        kind: 'run-attachment',
        logicalPath: path.posix.join(
          'domain-model',
          'runs',
          runId,
          'attachments',
          `${String(index + 1).padStart(3, '0')}-${file.name}`,
        ),
        content: await file.text(),
      };
    }),
  );
  return [...references, ...uploads];
}

async function relativeContextRoot(
  project: RegisteredProject,
  contextPath: string,
) {
  const relative = path.relative(await realpath(project.rootPath), contextPath);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new PublicApiError(
      'Domain Model Context must remain inside the project.',
      400,
    );
  return relative.split(path.sep).join('/');
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
