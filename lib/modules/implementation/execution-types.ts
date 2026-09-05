import type {
  CoordinationSettings,
  CoordinationTrace,
} from './coordination.ts';
import type { CoordinationProgress } from './coordination-runner.ts';
import type { AcceptanceChecklist, CheckOverride } from './checklist.ts';
import type { CardWorkspace } from './worktree.ts';
import type { AgentProfile } from '../../agents/profile.ts';
import type { CardHarnessResult } from './harness.ts';
import type { ExecutionAccess } from '../../agents/skills.ts';
import type { LocalAgentUsage } from '../../agents/transport.ts';
import type { GitHubDelivery } from '../../github-delivery.ts';
import type { CardEnvironmentManifest } from '../../card-host-operations.ts';

import type {
  JobLogReference,
  ResponseClassification,
} from '../../execution-observability/types.ts';

export type ActionOutput = Extract<CardHarnessResult, { stage: 'execution' }>;
export type ActionRun = {
  id: string;
  actionId: string;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  input: string;
  profile: AgentProfile;
  startedAt: string;
  endedAt: string | null;
  hostPid: number;
  agentSessionId: string | null;
  usage: LocalAgentUsage | null;
  executionAccess?: ExecutionAccess;
  result: ActionOutput | null;
  error: string | null;
  observedRefs: string[];
  outputRef: string | null;
  acceptanceChecklist?: AcceptanceChecklist;
  coordination?: CoordinationTrace;
  verificationBasis?: string;
  progress?: CoordinationProgress;
  activityRef?: string;
  evidenceErrors?: string[];
  remainingScopeNotes?: string[];
  unverifiedCheckRefs?: string[];
  verifiedExternalRefs?: string[];
  verifiedVersionRefs?: string[];
  commit?: string;
  parentCommit?: string;
  github?: GitHubDelivery | null;
  baselineRef?: string;
  logRef?: string;
  jobs?: JobLogReference[];
  cancelRequestedAt?: string;
  stopResult?: 'confirmed' | 'unconfirmed';
  response?: ResponseClassification;
};
export type CardExecution = {
  runs: ActionRun[];
  profile?: AgentProfile;
  coordinationSettings?: CoordinationSettings;
  workspace?: CardWorkspace;
  workspaceBackups?: CardWorkspace[];
  acceptedActionIds: string[];
  acceptanceOverrides?: Record<string, Record<string, CheckOverride>>;
  verification?: Record<string, 'manual' | 'github-merge'>;
  git?: { baseline: string; head: string; firstTrackedRunId: string };
  environment?: CardEnvironmentManifest;
  retryInputs?: Record<string, string>;
  lastOperation?: CardHostOperation;
};
export type CardHostOperation = {
  id: string;
  kind: string;
  label: string;
  status: 'completed' | 'fail';
  logUrlPath: string;
  endedAt: string;
};
export type ExecuteActionInput = {
  cardId: string;
  actionId: string;
  expectedRevision: number;
  instruction: string;
  profile: AgentProfile;
  contextRefs?: string[];
  files?: Array<{ name: string; content: string }>;
  initializeRepository?: boolean;
  coordination?: CoordinationSettings;
};
