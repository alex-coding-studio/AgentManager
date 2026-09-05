import type { AgentProfile } from '../agents/profile.ts';
import type { LogActor, RunLogEntry } from './log-types.ts';

export const RESPONSE_MODULES = [
  'whats-next',
  'task-decomposition',
  'domain-model',
  'what-to-do',
] as const;
export type ResponseModule = (typeof RESPONSE_MODULES)[number];

export function isResponseModule(value: unknown): value is ResponseModule {
  return (
    typeof value === 'string' &&
    (RESPONSE_MODULES as readonly string[]).includes(value)
  );
}

export type ResponseOwner =
  | {
      kind: 'module';
      projectId: string;
      planningPath: string;
      module: ResponseModule;
    }
  | { kind: 'card'; projectId: string; planningPath: string; cardId: string };

export type StoredResponseOwner =
  | { kind: 'module'; module: ResponseModule }
  | { kind: 'card'; cardId: string };

export function ownerKey(owner: ResponseOwner) {
  return owner.kind === 'module'
    ? `module:${owner.planningPath}:${owner.module}`
    : `card:${owner.planningPath}:${owner.cardId}`;
}

export function storedOwner(owner: ResponseOwner): StoredResponseOwner {
  return owner.kind === 'module'
    ? { kind: 'module', module: owner.module }
    : { kind: 'card', cardId: owner.cardId };
}

export function sameOwner(
  left: StoredResponseOwner,
  right: StoredResponseOwner,
) {
  return left.kind === 'module'
    ? right.kind === 'module' && left.module === right.module
    : right.kind === 'card' && left.cardId === right.cardId;
}

export function ownerLogUrlPath(owner: ResponseOwner, runId: string) {
  return owner.kind === 'module'
    ? `/projects/${owner.projectId}/logs/${owner.module}/${runId}`
    : `/projects/${owner.projectId}/logs/implementation/${owner.cardId}/${runId}`;
}

export function hostOperationLogUrlPath(
  projectId: string,
  operationId: string,
) {
  return `/projects/${projectId}/logs/host/${operationId}`;
}

export type ResponseStatus = 'completed' | 'warning' | 'fail';
export type SurfaceStatus = 'running' | ResponseStatus;

export const RUN_PHASES = [
  'coordinating',
  'executing',
  'verifying',
  'publishing',
  'finalizing',
  'stopping',
] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

export { LOG_ACTORS, LOG_LEVELS, LOG_PHASES } from './log-types.ts';
export type {
  LogActor,
  LogLevel,
  LogPhase,
  RunLogEntry,
  RunLogInput,
} from './log-types.ts';

export type RecoveryAction =
  | 'log'
  | 'continue'
  | 'answer'
  | 'undo'
  | 'reread'
  | 'refresh-external'
  | 'inspect-workspace'
  | 'pass';

export type RetainedEffects = {
  changedFiles: number;
  commits: string[];
  checkpoint: string | null;
  pullRequests: string[];
  checksStarted: boolean;
};

export type LatestResponseSubject = {
  kind: 'module' | 'layer' | 'node' | 'entity' | 'contract' | 'card' | 'action';
  label: string;
  id?: string;
};

export type ResponseClassification = {
  status: ResponseStatus;
  title: string;
  detail: string;
  supplementaryWarnings: string[];
  recovery: RecoveryAction[];
};

export type JobLogReference = { jobId: string; label: string; ref: string };

export type LatestResponseDocument = {
  schemaVersion: 1;
  owner: StoredResponseOwner;
  projectId: string;
  runId: string;
  revision: number;
  status: SurfaceStatus;
  phase?: RunPhase;
  actor?: LogActor;
  title: string;
  detail: string;
  subject: LatestResponseSubject;
  supplementaryWarnings: string[];
  recovery: RecoveryAction[];
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  logRef: string;
  logUrlPath: string;
  hostPid: number;
  agentProfile?: AgentProfile;
  layer?: 'discovery' | 'product-design';
  actionId?: string;
  retained?: RetainedEffects;
  jobLogs?: JobLogReference[];
  recentActivity: RunLogEntry[];
  accepted?: boolean;
  reconstructed?: boolean;
};

export function isTerminalStatus(
  status: SurfaceStatus,
): status is ResponseStatus {
  return status !== 'running';
}
