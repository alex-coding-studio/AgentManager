import type { AgentProfile } from './agent-profile.ts';
import type { CardHarnessResult } from './just-do-it-harness.ts';
import type { LocalAgentUsage } from './local-agent-transport.ts';

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
  result: ActionOutput | null;
  error: string | null;
  observedRefs: string[];
  outputRef: string | null;
  commit?: string;
  parentCommit?: string;
};
export type CardExecution = {
  runs: ActionRun[];
  acceptedActionIds: string[];
  git?: { baseline: string; head: string; firstTrackedRunId: string };
};
export type ExecuteActionInput = {
  cardId: string;
  actionId: string;
  expectedRevision: number;
  instruction: string;
  profile: AgentProfile;
};
