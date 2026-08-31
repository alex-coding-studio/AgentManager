import type {
  CoordinationSettings,
  CoordinationTrace,
} from './just-do-it-coordination.ts';
import type { CoordinationProgress } from './just-do-it-coordination-runner.ts';
import type {
  AcceptanceChecklist,
  CheckOverride,
} from './just-do-it-checklist.ts';
import type { CardWorkspace } from './just-do-it-worktree.ts';
import type { AgentProfile } from './agent-profile.ts';
import type { CardHarnessResult } from './just-do-it-harness.ts';
import type { ExecutionAccess } from './local-agent-skills.ts';
import type { LocalAgentUsage } from './local-agent-transport.ts';
import type { GitHubDelivery } from './github-delivery.ts';

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
};
export type ExecuteActionInput = {
  cardId: string;
  actionId: string;
  expectedRevision: number;
  instruction: string;
  profile: AgentProfile;
  initializeRepository?: boolean;
  coordination?: CoordinationSettings;
};
