import type { AgentProfile } from './agent-profile.ts';
import type { LocalAgentUsage } from './local-agent-transport.ts';

export type AgentRuntimeProvider = 'codex' | 'claude';
export type AgentRuntimeCapabilities = {
  persistentThreads: boolean;
  pushToolResults: boolean;
  turnResume: boolean;
  turnInterrupt: boolean;
};
export type AgentRuntimeThread = {
  provider: AgentRuntimeProvider;
  threadId: string;
  profile: AgentProfile;
  workingDirectory: string;
  access: 'read-only' | 'workspace-write' | 'full-access';
};
export type AgentRuntimeEvent =
  | { type: 'turn-started'; threadId: string; turnId: string; at: string }
  | {
      type: 'activity';
      threadId: string;
      turnId: string;
      summary: string;
      at: string;
    }
  | {
      type: 'job-started';
      threadId: string;
      turnId: string;
      jobId: string;
      label: string;
      at: string;
    }
  | {
      type: 'job-completed';
      threadId: string;
      turnId: string;
      jobId: string;
      exitCode: number | null;
      at: string;
    }
  | { type: 'turn-completed'; threadId: string; turnId: string; at: string };
export type AgentRuntimeTurnResult = {
  threadId: string;
  turnId: string;
  finalOutput: string;
  usage: LocalAgentUsage | null;
};
export type AgentRuntimeTurn = {
  completion: Promise<AgentRuntimeTurnResult>;
  interrupt: () => void;
};
export type AgentRuntimeThreadInput = {
  profile: AgentProfile;
  workingDirectory: string;
  access: 'read-only' | 'workspace-write' | 'full-access';
};
export type AgentRuntimeTurnInput = {
  prompt: string;
  onEvent?: (event: AgentRuntimeEvent) => void;
};
export interface AgentSessionDriver {
  readonly provider: AgentRuntimeProvider;
  readonly capabilities: AgentRuntimeCapabilities;
  startThread(input: AgentRuntimeThreadInput): Promise<AgentRuntimeThread>;
  resumeThread(thread: AgentRuntimeThread): Promise<AgentRuntimeThread>;
  startTurn(
    thread: AgentRuntimeThread,
    input: AgentRuntimeTurnInput,
  ): AgentRuntimeTurn;
  close(): Promise<void>;
}
