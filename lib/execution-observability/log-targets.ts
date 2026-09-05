import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PublicApiError } from '../api-errors.ts';
import type { AgentProfile } from '../agents/profile.ts';
import { assertCardUuid } from '../modules/implementation/harness.ts';
import { planningService } from '../modules/implementation/planning-service.ts';
import type { ActionRun } from '../modules/implementation/execution-types.ts';
import type { RegisteredProject } from '../project-registry.ts';
import { getActiveRun } from './active-runs.ts';
import {
  HOST_OPERATION_ID_PATTERN,
  hostOperationPaths,
  type HostOperationRecord,
} from './host-operations.ts';
import { readLatestResponse } from './latest-response-store.ts';
import {
  adaptAgentGraphActivity,
  adaptExecutionActivity,
} from './legacy-log-adapters.ts';
import { renderRunLogText } from './run-log-format.ts';
import { RUN_LOG_READ_LIMIT, readRunLogTail } from './run-log.ts';
import { classifyResponse, type ClassificationFacts } from './status.ts';
import {
  isResponseModule,
  type JobLogReference,
  type LatestResponseDocument,
  type ResponseClassification,
  type ResponseModule,
  type ResponseOwner,
  type RetainedEffects,
  type SurfaceStatus,
} from './types.ts';

export const RUN_ID_PATTERN = /^RUN-[0-9a-f-]{36}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_OUTPUT_LIMIT = 2_097_152;

export const MODULE_LABELS: Record<ResponseModule, string> = {
  'whats-next': 'Product Exploration and Design',
  'task-decomposition': 'Scope Decomposition',
  'domain-model': 'Domain Modeling',
  'what-to-do': 'Delivery Planning',
};

export type LogTargetMeta = {
  kind: 'module' | 'card' | 'host' | 'job';
  projectId: string;
  projectName: string;
  ownerLabel: string;
  subject: string;
  id: string;
  status: SurfaceStatus | 'unknown';
  agentProfile: AgentProfile | null;
  startedAt: string | null;
  endedAt: string | null;
  title: string | null;
  detail: string | null;
  jobLogs: JobLogReference[];
  retained: RetainedEffects | null;
  pullRequests: string[];
  legacy: boolean;
  logUrlPath: string;
};

export type LogTarget = {
  meta: LogTargetMeta;
  file: string | null;
  legacyText: string | null;
  live: boolean;
};

export type LogChunk = {
  text: string;
  offset: number;
  next: number;
  size: number;
  live: boolean;
  legacy: boolean;
};

type LegacyModuleRun = {
  runId?: string;
  id?: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  error?: string | null;
  profile?: AgentProfile;
  activity?: Array<{ at: string; summary: string }>;
  logRef?: string;
  result?: { outcome?: string } | null;
};

async function exists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function confine(planningPath: string, relative: string) {
  const root = await realpath(planningPath);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep))
    throw new PublicApiError('Invalid log path.', 400);
  return target;
}

function moduleStatus(status: string, outcome?: string): SurfaceStatus {
  if (status === 'running' || status === 'validating') return 'running';
  if (status === 'failed') return 'fail';
  if (
    status === 'canceled' ||
    status === 'clarification' ||
    status === 'insufficient-evidence' ||
    outcome === 'clarification' ||
    outcome === 'insufficient-evidence'
  )
    return 'warning';
  return 'completed';
}

function countChecks(checks: Array<{ status: string }> | undefined) {
  const total = checks?.length ?? 0;
  const passed =
    checks?.filter((check) => check.status === 'passed').length ?? 0;
  const failed =
    checks?.filter((check) => check.status === 'failed').length ?? 0;
  return { total, passed, failed, notRun: total - passed - failed };
}

export function cardRunClassification(
  run: ActionRun,
  accepted = false,
): ResponseClassification | null {
  if (run.status === 'running') return null;
  if (run.response) return run.response;
  const facts: ClassificationFacts = {
    surface: 'card',
    runState: run.status === 'canceled' ? 'canceled' : 'settled',
    summary: run.result?.summary ?? null,
    accepted,
  };
  if (run.result) {
    facts.outcome =
      run.result.outcome === 'delivered'
        ? 'delivered'
        : run.result.outcome === 'blocked'
          ? 'blocked'
          : 'failed';
    facts.requiredChecks = countChecks(run.result.checks);
    facts.additionalFindings = run.result.additionalChecks
      ?.filter((check) => check.status !== 'passed')
      .map((check) => check.summary);
    if (run.status === 'failed' && run.evidenceErrors?.length)
      facts.failure = {
        kind: 'host-verification',
        message: run.evidenceErrors.join('\n'),
      };
  } else if (run.status === 'failed') {
    facts.failure = { kind: 'unknown', message: run.error ?? '' };
  }
  return classifyResponse(facts);
}

function applyDocument(
  meta: LogTargetMeta,
  document: LatestResponseDocument | null,
  runId: string,
) {
  if (!document || document.runId !== runId) return meta;
  return {
    ...meta,
    status: document.status,
    title: document.title,
    detail: document.detail,
    subject: document.subject.label,
    retained: document.retained ?? meta.retained,
    jobLogs: document.jobLogs ?? meta.jobLogs,
    startedAt: document.startedAt,
    endedAt: document.endedAt,
  };
}

async function moduleTarget(
  project: RegisteredProject,
  module: ResponseModule,
  runId: string,
): Promise<LogTarget> {
  if (!RUN_ID_PATTERN.test(runId))
    throw new PublicApiError('The Run identifier is invalid.', 400);
  const runDirectory = await confine(
    project.planningPath,
    path.join(module, 'runs', runId),
  );
  let record: LegacyModuleRun;
  try {
    record = JSON.parse(
      await readFile(path.join(runDirectory, 'run.json'), 'utf8'),
    ) as LegacyModuleRun;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new PublicApiError('Run not found.', 404);
    throw error;
  }
  const owner: ResponseOwner = {
    kind: 'module',
    projectId: project.id,
    planningPath: project.planningPath,
    module,
  };
  const logFile = path.join(runDirectory, 'run.log');
  const hasLog = await exists(logFile);
  const document = await readLatestResponse(owner);
  const meta = applyDocument(
    {
      kind: 'module',
      projectId: project.id,
      projectName: project.name,
      ownerLabel: MODULE_LABELS[module],
      subject: MODULE_LABELS[module],
      id: runId,
      status: moduleStatus(record.status, record.result?.outcome),
      agentProfile: record.profile ?? null,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      title: null,
      detail: record.error?.trim() || null,
      jobLogs: [],
      retained: null,
      pullRequests: [],
      legacy: !hasLog,
      logUrlPath: `/projects/${project.id}/logs/${module}/${runId}`,
    },
    document,
    runId,
  );
  const active = getActiveRun(owner);
  return {
    meta,
    file: hasLog ? logFile : null,
    legacyText: hasLog
      ? null
      : renderRunLogText(
          adaptAgentGraphActivity({
            runId,
            startedAt: record.startedAt,
            endedAt: record.endedAt,
            status: record.status,
            error: record.error,
            activity: record.activity ?? [],
          }),
        ),
    live: hasLog && active?.runId === runId,
  };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function cardTarget(
  project: RegisteredProject,
  cardId: string,
  runId: string,
): Promise<LogTarget> {
  try {
    assertCardUuid(cardId);
    assertCardUuid(runId);
  } catch {
    throw new PublicApiError('The Card or Run identifier is invalid.', 400);
  }
  let card;
  try {
    card = await planningService.read(project, cardId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new PublicApiError('Card not found.', 404);
    throw error;
  }
  const run = card.execution?.runs.find((item) => item.id === runId);
  if (!run) throw new PublicApiError('Run not found.', 404);
  const owner: ResponseOwner = {
    kind: 'card',
    projectId: project.id,
    planningPath: project.planningPath,
    cardId,
  };
  const logFile = await confine(
    project.planningPath,
    run.logRef ??
      path.join('implementation/cards', cardId, 'logs', `${runId}.log`),
  );
  const hasLog = await exists(logFile);
  const action = card.actions.find((item) => item.id === run.actionId);
  const index = card.actions.findIndex((item) => item.id === run.actionId);
  const document = await readLatestResponse(owner);
  const pullRequests = run.github?.pullRequests?.map((item) => item.url) ?? [];
  const classification = cardRunClassification(
    run,
    card.execution?.acceptedActionIds.includes(run.actionId) ?? false,
  );
  const meta = applyDocument(
    {
      kind: 'card',
      projectId: project.id,
      projectName: project.name,
      ownerLabel: `Card ${cardId.slice(0, 8)}`,
      subject: action
        ? `Action ${index + 1}/${card.actions.length} · ${action.title}`
        : `Action ${run.actionId.slice(0, 8)}`,
      id: runId,
      status: classification?.status ?? 'running',
      agentProfile: run.profile,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      title: classification?.title ?? null,
      detail:
        run.error?.trim() ||
        classification?.detail ||
        run.result?.summary?.trim() ||
        null,
      jobLogs: run.jobs ?? [],
      retained: null,
      pullRequests,
      legacy: !hasLog,
      logUrlPath: `/projects/${project.id}/logs/implementation/${cardId}/${runId}`,
    },
    document,
    runId,
  );
  let legacyText: string | null = null;
  if (!hasLog) {
    const activity = run.activityRef
      ? await readJson<
          Array<{
            phase: string;
            summary: string;
            updatedAt: string;
            attempts: number;
          }>
        >(await confine(project.planningPath, run.activityRef))
      : null;
    legacyText = renderRunLogText(
      adaptExecutionActivity(
        {
          id: run.id,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          status: run.status,
          error: run.error,
        },
        Array.isArray(activity) ? activity : [],
      ),
    );
  }
  const active = getActiveRun(owner);
  return {
    meta,
    file: hasLog ? logFile : null,
    legacyText,
    live: hasLog && active?.runId === runId,
  };
}

async function hostTarget(
  project: RegisteredProject,
  operationId: string,
): Promise<LogTarget> {
  if (!HOST_OPERATION_ID_PATTERN.test(operationId))
    throw new PublicApiError('The operation identifier is invalid.', 400);
  const paths = hostOperationPaths(project.planningPath, operationId);
  const record = await readJson<HostOperationRecord>(paths.json);
  if (!record || !(await exists(paths.log)))
    throw new PublicApiError('Operation not found.', 404);
  return {
    meta: {
      kind: 'host',
      projectId: project.id,
      projectName: project.name,
      ownerLabel: 'Host',
      subject: record.label,
      id: operationId,
      status:
        record.status === 'running'
          ? 'running'
          : record.status === 'completed'
            ? 'completed'
            : 'fail',
      agentProfile: null,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      title: record.title,
      detail: record.detail,
      jobLogs: [],
      retained: null,
      pullRequests: [],
      legacy: false,
      logUrlPath: `/projects/${project.id}/logs/host/${operationId}`,
    },
    file: paths.log,
    legacyText: null,
    live: record.status === 'running',
  };
}

async function jobTarget(
  project: RegisteredProject,
  jobId: string,
): Promise<LogTarget> {
  if (!UUID_PATTERN.test(jobId))
    throw new PublicApiError('The job identifier is invalid.', 400);
  const directory = await confine(
    project.planningPath,
    path.join('runtime/jobs', jobId),
  );
  const logFile = path.join(directory, 'output.log');
  const record = await readJson<{
    label?: string;
    command?: string;
    status?: string;
    startedAt?: string;
    endedAt?: string | null;
    exitCode?: number | null;
  }>(path.join(directory, 'job.json'));
  if (!(await exists(logFile)))
    throw new PublicApiError('Job output not found.', 404);
  const metadata = await stat(logFile);
  if (metadata.size > JOB_OUTPUT_LIMIT)
    throw new PublicApiError('Job output is too large to display.', 413);
  return {
    meta: {
      kind: 'job',
      projectId: project.id,
      projectName: project.name,
      ownerLabel: 'Host Job',
      subject: record?.label ?? record?.command ?? jobId,
      id: jobId,
      status:
        record?.status === 'running'
          ? 'running'
          : record?.status === 'completed'
            ? 'completed'
            : record?.status
              ? 'fail'
              : 'unknown',
      agentProfile: null,
      startedAt: record?.startedAt ?? null,
      endedAt: record?.endedAt ?? null,
      title: record?.command ?? null,
      detail:
        typeof record?.exitCode === 'number'
          ? `Exited ${record.exitCode}`
          : null,
      jobLogs: [],
      retained: null,
      pullRequests: [],
      legacy: false,
      logUrlPath: `/projects/${project.id}/logs/jobs/${jobId}`,
    },
    file: logFile,
    legacyText: null,
    live: record?.status === 'running',
  };
}

export async function resolveLogTarget(
  project: RegisteredProject,
  segments: string[],
): Promise<LogTarget> {
  const [first, second, third, ...rest] = segments;
  if (rest.length || !first)
    throw new PublicApiError('Unknown log reference.', 404);
  if (first === 'implementation') {
    if (!second || !third)
      throw new PublicApiError('Unknown log reference.', 404);
    return cardTarget(project, second, third);
  }
  if (first === 'host') {
    if (!second || third)
      throw new PublicApiError('Unknown log reference.', 404);
    return hostTarget(project, second);
  }
  if (first === 'jobs') {
    if (!second || third)
      throw new PublicApiError('Unknown log reference.', 404);
    return jobTarget(project, second);
  }
  if (isResponseModule(first)) {
    if (!second || third)
      throw new PublicApiError('Unknown log reference.', 404);
    return moduleTarget(project, first, second);
  }
  throw new PublicApiError('Unknown log reference.', 404);
}

export async function readLogChunk(
  target: LogTarget,
  offset = 0,
): Promise<LogChunk> {
  if (target.file) {
    const slice = await readRunLogTail(target.file, offset, RUN_LOG_READ_LIMIT);
    return { ...slice, live: target.live, legacy: false };
  }
  const text = target.legacyText ?? '';
  const buffer = Buffer.from(text, 'utf8');
  const start = offset > buffer.length ? 0 : Math.max(0, offset);
  return {
    text: buffer.subarray(start).toString('utf8'),
    offset: start,
    next: buffer.length,
    size: buffer.length,
    live: false,
    legacy: true,
  };
}

export function clampOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
