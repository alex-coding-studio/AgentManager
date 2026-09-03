import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { validateAgentProfile, type AgentProfile } from './agent-profile.ts';
import {
  createAgentGraphActivityRecorder,
  initialAgentGraphActivity,
  initializeAgentGraphActivity,
  writeAgentGraphRunEvidence,
  type AgentGraphActivity,
  type AgentGraphActivityRecorder,
} from './agent-graph-run.ts';
import { PublicApiError } from './api-errors.ts';
import {
  startLocalAgentRun,
  type LocalAgentRun,
  type LocalAgentUsage,
} from './local-agent-transport.ts';
import type { RegisteredProject } from './project-registry.ts';
import {
  prepareWhatToDoContext,
  type WhatToDoRunInput,
} from './what-to-do-context.ts';
import {
  createWhatToDoHarnessRequest,
  parseWhatToDoHarnessResult,
  whatToDoHarnessPrompt,
  type WhatToDoHarnessRequest,
  type WhatToDoHarnessResult,
} from './what-to-do-harness.ts';
import {
  materializeWhatToDoDeliveryMap,
  renderWhatToDoContract,
  whatToDoContractCandidateId,
  whatToDoKnownCandidates,
  whatToDoKnownSourceClaims,
  type WhatToDoDeliveryMap,
} from './what-to-do-map.ts';
import {
  atomicWhatToDoText,
  readWhatToDoCurrentMap,
  whatToDoDirectory,
  whatToDoRunDirectory,
  writeWhatToDoCurrentMap,
  writeWhatToDoRepositorySummary,
} from './what-to-do-storage.ts';
import {
  planningService,
  type PlanningCard,
} from './just-do-it-planning-service.ts';
import { deliveryContractPlanningSource } from './just-do-it-planning-sources.ts';
import { withDeliveryState } from './delivery-state-lock.ts';

export type WhatToDoRunRecord = {
  schemaVersion: 1;
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  sourceUids: string[];
  contextRefs: string[];
  repositoryEvidencePaths: string[];
  focusContractIds: string[];
  attachmentNames: string[];
  profile: AgentProfile;
  startedAt: string;
  endedAt: string | null;
  agentSessionId: string | null;
  usage: LocalAgentUsage | null;
  activity: AgentGraphActivity[];
  request: WhatToDoHarnessRequest;
  result: WhatToDoHarnessResult | null;
  map: WhatToDoDeliveryMap | null;
  error: string | null;
};

type ActiveRun = {
  runId: string;
  cancel: () => void;
  canceled: boolean;
  settling: boolean;
  terminal: WhatToDoRunRecord | null;
  activity: AgentGraphActivity[];
  recorder: AgentGraphActivityRecorder | null;
  agentOutput: string | null;
};

const runtime = globalThis as typeof globalThis & {
  whatToDoRuns?: Map<string, ActiveRun>;
};
const activeRuns = (runtime.whatToDoRuns ??= new Map<string, ActiveRun>());

export async function startWhatToDoRun(
  project: RegisteredProject,
  input: WhatToDoRunInput,
  transport = startLocalAgentRun,
) {
  validateAgentProfile(input.profile);
  const key = project.planningPath;
  if (activeRuns.has(key))
    throw new PublicApiError('A What to Do Agent Run is already active.', 409);
  const runId = `RUN-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const activity = initialAgentGraphActivity(
    'Preparing the What to Do delivery map.',
    startedAt,
  );
  const active: ActiveRun = {
    runId,
    cancel: () => undefined,
    canceled: false,
    settling: false,
    terminal: null,
    activity,
    recorder: null,
    agentOutput: null,
  };
  activeRuns.set(key, active);
  let preparedRun = false;
  try {
    const currentMap = await readWhatToDoCurrentMap(project);
    if (currentMap) {
      const currentMapRun = await readWhatToDoRun(project, currentMap.runId);
      if (
        currentMapRun.status !== 'succeeded' ||
        currentMapRun.map?.runId !== currentMap.runId
      )
        throw new Error('The current What to Do Map has no committed Run.');
    }
    const prepared = await prepareWhatToDoContext(project, runId, {
      ...input,
      currentMap,
    });
    preparedRun = true;
    const contextRoot = await relativeContextRoot(
      project,
      prepared.workspace.root,
    );
    const request = createWhatToDoHarnessRequest({
      sessionId: `SESSION-${randomUUID()}`,
      requestId: runId,
      contextRoot,
      content: prepared.packet,
      operation: currentMap ? 'adjust-map' : 'create-map',
      currentMapPath: currentMap ? 'what-to-do/current-map.json' : null,
      focusCandidateIds: currentMap
        ? (input.focusContractIds ?? []).map((contractId) =>
            whatToDoContractCandidateId(
              currentMap.contracts.find(
                (contract) => contract.id === contractId,
              )!,
            ),
          )
        : [],
      sourceFeatures: prepared.sources,
      repository: {
        factsPath: 'what-to-do/repository-context/facts.json',
        fingerprint: prepared.repositoryFacts.fingerprint,
        reusable: prepared.repositoryFacts.reusable,
        summaryPath: prepared.packet.references.some(
          (entry) => entry.kind === 'repository-summary',
        )
          ? 'what-to-do/repository-context/summary.md'
          : null,
      },
      domain: {
        stateVersion: prepared.domainModel.stateVersion,
        summaryPath: 'domain-model/domain-model-summary.md',
        modelPath: 'domain-model/domain-model.json',
      },
    });
    const run: WhatToDoRunRecord = {
      schemaVersion: 1,
      id: runId,
      status: 'running' as const,
      sourceUids: [...new Set(input.sourceUids)],
      contextRefs: [...new Set(input.contextRefs ?? [])],
      repositoryEvidencePaths: [
        ...new Set(input.repositoryEvidencePaths ?? []),
      ],
      focusContractIds: [...new Set(input.focusContractIds ?? [])],
      attachmentNames: (input.files ?? []).map((file) => file.name),
      profile: structuredClone(input.profile),
      startedAt,
      endedAt: null,
      agentSessionId: null,
      usage: null,
      activity,
      request,
      result: null,
      map: null,
      error: null,
    };
    const runPath = await whatToDoRunDirectory(project, runId);
    await initializeAgentGraphActivity(runPath, activity);
    active.recorder = createAgentGraphActivityRecorder(runPath, activity);
    await writeRunRecord(project, run);
    await atomicWhatToDoText(
      path.join(runPath, 'request.json'),
      `${JSON.stringify(request, null, 2)}\n`,
    );
    const agentRun = transport(input.profile.agent, {
      workingDirectory: project.codePath ?? project.rootPath,
      protectedPath: project.planningPath,
      environment: whatToDoAgentEnvironment(),
      prompt: whatToDoHarnessPrompt(request),
      model: input.profile.model || undefined,
      effort: input.profile.effort || undefined,
      access: 'read-only',
      disableDelegation: true,
      isolatedProcessGroup: true,
      onActivity: active.recorder.onActivity,
    });
    active.cancel = agentRun.cancel;
    settleLater(project, run, active, agentRun, prepared, currentMap);
    return run;
  } catch (error) {
    if (preparedRun)
      await rm(await whatToDoRunDirectory(project, runId), {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    if (activeRuns.get(key) === active) activeRuns.delete(key);
    throw error;
  }
}

function settleLater(
  project: RegisteredProject,
  run: WhatToDoRunRecord,
  active: ActiveRun,
  agentRun: LocalAgentRun,
  prepared: Awaited<ReturnType<typeof prepareWhatToDoContext>>,
  currentMap: WhatToDoDeliveryMap | null,
) {
  void agentRun.completion
    .then(async (agent) => {
      if (active.canceled) return;
      active.settling = true;
      active.agentOutput = agent.finalOutput;
      const result = parseWhatToDoHarnessResult(agent.finalOutput, {
        request: run.request.request,
        operation: run.request.operation,
        knownSources: prepared.knownSources,
        requiredSourcePaths: prepared.requiredSourcePaths,
        userInput: prepared.userInput,
        knownEvidencePaths: prepared.knownEvidencePaths,
        ...(currentMap
          ? {
              knownCandidates: whatToDoKnownCandidates(currentMap),
              knownSourceClaims: whatToDoKnownSourceClaims(currentMap),
              focusCandidateIds: run.request.focusCandidateIds,
            }
          : {}),
      });
      const endedAt = new Date().toISOString();
      const map =
        result.outcome === 'map-proposal'
          ? materializeWhatToDoDeliveryMap({
              runId: run.id,
              updatedAt: endedAt,
              sourceUids: [
                ...(currentMap?.sourceUids ?? []),
                ...run.sourceUids,
              ],
              result,
              currentMap,
              sourceSnapshots: prepared.sourceSnapshots,
            })
          : null;
      const terminal: WhatToDoRunRecord = {
        ...run,
        status: 'succeeded',
        endedAt,
        agentSessionId: agent.agentSessionId,
        usage: agent.usage,
        activity: [...active.activity],
        result,
        map,
        error: null,
      };
      const runPath = await whatToDoRunDirectory(project, run.id);
      await active.recorder?.flush();
      await writeAgentGraphRunEvidence(runPath, {
        activity: terminal.activity,
        agentOutput: agent.finalOutput,
        summary: renderRunSummary(result),
        response: result.responseMarkdown,
      });
      if (map)
        await Promise.all(
          map.contracts
            .filter((contract) =>
              contract.outputPath.startsWith(
                `what-to-do/runs/${run.id}/contracts/`,
              ),
            )
            .map(async (contract) => {
              const directory = path.join(runPath, 'contracts', contract.id);
              await mkdir(directory, { recursive: true });
              await atomicWhatToDoText(
                path.join(directory, 'output.md'),
                renderWhatToDoContract(contract),
              );
            }),
        );
      if (map) {
        await stageTerminalRunRecord(project, terminal);
        await publishDeliveryMap(project, map);
        await publishTerminalRunRecord(project, run.id).catch(() => undefined);
      } else {
        await writeRunRecord(project, terminal);
      }
      active.terminal = terminal;
      await writeWhatToDoRepositorySummary(
        project,
        result.repositorySummary.markdown,
        run.request.repository.fingerprint,
      ).catch(() => undefined);
    })
    .catch(async (error: unknown) => {
      if (active.canceled) return;
      active.settling = true;
      const message =
        error instanceof PublicApiError
          ? error.message
          : 'The What to Do Agent did not complete.';
      const terminal: WhatToDoRunRecord = {
        ...run,
        status: 'failed',
        endedAt: new Date().toISOString(),
        activity: [...active.activity],
        result: null,
        map: null,
        error: message,
      };
      const runPath = await whatToDoRunDirectory(project, run.id);
      await rm(path.join(runPath, 'terminal.json'), { force: true }).catch(
        () => undefined,
      );
      await active.recorder?.flush().catch(() => undefined);
      await writeAgentGraphRunEvidence(runPath, {
        activity: terminal.activity,
        summary: `# Failed\n\n${message}\n`,
        response: `# Failed\n\n${message}\n`,
        agentOutput: active.agentOutput ?? String(error),
      }).catch(() => undefined);
      await writeRunRecord(project, terminal).catch(() => undefined);
      active.terminal = terminal;
    })
    .finally(() => {
      if (activeRuns.get(project.planningPath) === active)
        activeRuns.delete(project.planningPath);
    });
}

async function publishDeliveryMap(
  project: RegisteredProject,
  map: WhatToDoDeliveryMap,
) {
  await withDeliveryState(project, async () => {
    const nextSources = new Map(
      map.contracts.map((contract) => {
        const source = deliveryContractPlanningSource(contract);
        return [source.uid, source] as const;
      }),
    );
    const superseded = (await planningService.list(project)).filter((card) => {
      if (card.source.module !== 'what-to-do') return false;
      const source = nextSources.get(card.source.uid);
      return (
        !source ||
        source.id !== card.source.id ||
        source.version !== card.source.version
      );
    });
    const protectedCards = superseded.filter(planningCardProtectsDeliveryMap);
    if (protectedCards.length)
      throw new PublicApiError(
        `The Delivery Map cannot replace Contracts already in progress: ${protectedCards.map((card) => card.source.title).join(', ')}.`,
        409,
      );
    await writeWhatToDoCurrentMap(project, map);
    await Promise.allSettled(
      superseded.map((card) =>
        planningService.deleteCard(project, card.id, card.revision),
      ),
    );
  });
}

function planningCardProtectsDeliveryMap(card: PlanningCard) {
  return Boolean(
    card.run?.status === 'running' ||
    card.plan?.status === 'finalized' ||
    card.actions.length ||
    card.execution?.runs.length,
  );
}

export async function cancelWhatToDoRun(
  project: RegisteredProject,
  runId: string,
) {
  const active = activeRuns.get(project.planningPath);
  if (!active || active.runId !== runId)
    throw new PublicApiError('The What to Do Run is not active.', 400);
  if (active.settling)
    throw new PublicApiError('The What to Do Run is already finishing.', 409);
  active.canceled = true;
  active.cancel();
  await active.recorder?.flush();
  const current = await readWhatToDoRun(project, runId);
  const canceled: WhatToDoRunRecord = {
    ...current,
    status: 'canceled',
    endedAt: new Date().toISOString(),
    activity: [...active.activity],
    error: null,
  };
  active.terminal = canceled;
  await writeAgentGraphRunEvidence(await whatToDoRunDirectory(project, runId), {
    activity: canceled.activity,
    summary: '# Canceled\n\nThe What to Do Agent Run was canceled.\n',
    response: '# Canceled\n\nThe What to Do Agent Run was canceled.\n',
  });
  await writeRunRecord(project, canceled);
  if (activeRuns.get(project.planningPath) === active)
    activeRuns.delete(project.planningPath);
  return canceled;
}

export async function readWhatToDoRun(
  project: RegisteredProject,
  runId: string,
) {
  const currentActive = activeRuns.get(project.planningPath);
  if (!currentActive || currentActive.runId !== runId)
    await reconcileTerminalRunRecord(project, runId);
  const file = path.join(
    await whatToDoRunDirectory(project, runId),
    'run.json',
  );
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
    throw new Error('Invalid What to Do Run record.');
  const stored = JSON.parse(
    await readFile(file, 'utf8'),
  ) as Partial<WhatToDoRunRecord>;
  const run = {
    ...stored,
    focusContractIds: Array.isArray(stored.focusContractIds)
      ? stored.focusContractIds
      : [],
    map: stored.map ?? null,
  } as WhatToDoRunRecord;
  if (
    run.schemaVersion !== 1 ||
    run.id !== runId ||
    !['running', 'succeeded', 'failed', 'canceled'].includes(run.status)
  )
    throw new Error('Invalid What to Do Run record.');
  const active = currentActive;
  if (active?.runId === run.id && active.terminal) return active.terminal;
  if (active?.runId === run.id && active.settling)
    return {
      ...run,
      status: 'running' as const,
      endedAt: null,
      result: null,
      map: null,
    };
  if (run.status === 'running' && active?.runId === run.id)
    return { ...run, activity: [...active.activity] };
  if (run.status === 'running') {
    const interrupted: WhatToDoRunRecord = {
      ...run,
      status: 'failed' as const,
      endedAt: info.mtime.toISOString(),
      error: 'The What to Do Agent Run was interrupted.',
    };
    await writeAgentGraphRunEvidence(
      await whatToDoRunDirectory(project, runId),
      {
        activity: interrupted.activity,
        summary:
          '# Interrupted\n\nThe What to Do Agent Run was interrupted before completion.\n',
        response:
          '# Interrupted\n\nThe What to Do Agent Run was interrupted before completion.\n',
      },
    );
    await writeRunRecord(project, interrupted);
    return interrupted;
  }
  return run;
}

export async function listLatestWhatToDoRuns(
  project: RegisteredProject,
  limit = 12,
) {
  const root = await whatToDoDirectory(project, ['runs']);
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const runs = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() && /^RUN-[0-9a-f-]{36}$/.test(entry.name),
      )
      .map((entry) => readWhatToDoRun(project, entry.name)),
  );
  return runs
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, limit);
}

async function relativeContextRoot(
  project: RegisteredProject,
  contextPath: string,
) {
  const relative = path.relative(
    await realpath(project.codePath ?? project.rootPath),
    contextPath,
  );
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`))
    throw new Error('What to Do Context is outside the project.');
  return relative.split(path.sep).join('/');
}

async function writeRunRecord(
  project: RegisteredProject,
  run: WhatToDoRunRecord,
) {
  await atomicWhatToDoText(
    path.join(await whatToDoRunDirectory(project, run.id), 'run.json'),
    `${JSON.stringify(run, null, 2)}\n`,
  );
}

async function stageTerminalRunRecord(
  project: RegisteredProject,
  run: WhatToDoRunRecord,
) {
  await atomicWhatToDoText(
    path.join(await whatToDoRunDirectory(project, run.id), 'terminal.json'),
    `${JSON.stringify(run, null, 2)}\n`,
  );
}

async function publishTerminalRunRecord(
  project: RegisteredProject,
  runId: string,
) {
  const directory = await whatToDoRunDirectory(project, runId);
  await rename(
    path.join(directory, 'terminal.json'),
    path.join(directory, 'run.json'),
  );
}

async function reconcileTerminalRunRecord(
  project: RegisteredProject,
  runId: string,
) {
  const directory = await whatToDoRunDirectory(project, runId);
  const terminalFile = path.join(directory, 'terminal.json');
  try {
    const info = await lstat(terminalFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024)
      throw new Error('Invalid What to Do terminal Run record.');
    const terminal = JSON.parse(
      await readFile(terminalFile, 'utf8'),
    ) as WhatToDoRunRecord;
    const currentMap = await readWhatToDoCurrentMap(project);
    if (
      terminal.schemaVersion === 1 &&
      terminal.id === runId &&
      terminal.status === 'succeeded' &&
      terminal.map?.runId === runId &&
      currentMap?.runId === runId
    ) {
      await publishTerminalRunRecord(project, runId);
      return;
    }
    await rm(terminalFile, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

function renderRunSummary(result: WhatToDoHarnessResult) {
  if (result.outcome === 'map-proposal')
    return `# Delivery Map\n\nApplied ${result.candidates.length} Contract boundaries.\n`;
  if (result.outcome === 'clarification')
    return `# Clarification\n\n${result.clarification.question}\n`;
  if (result.outcome === 'insufficient-evidence')
    return `# More evidence needed\n\n${result.missingEvidence.map((item) => `- ${item}`).join('\n')}\n`;
  return `# No change\n\n${result.reason}\n`;
}

export function whatToDoAgentEnvironment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TERM',
    'COLORTERM',
    'NODE_ENV',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
    'CODEX_HOME',
    'CLAUDE_CONFIG_DIR',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
  ];
  return Object.fromEntries(
    allowed.flatMap((key) =>
      source[key] === undefined ? [] : [[key, source[key]]],
    ),
  ) as NodeJS.ProcessEnv;
}
