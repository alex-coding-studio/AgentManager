import { randomUUID } from 'node:crypto';
import type {
  AgentRuntimeCapabilities,
  AgentRuntimeProvider,
  AgentRuntimeThread,
  AgentRuntimeThreadInput,
  AgentRuntimeTurn,
  AgentRuntimeTurnInput,
  AgentSessionDriver,
} from './runtime-driver.ts';
import { startLocalAgentRun, type LocalAgentRunInput } from './transport.ts';

export class LegacyAgentSessionDriver implements AgentSessionDriver {
  readonly capabilities: AgentRuntimeCapabilities = {
    persistentThreads: false,
    pushToolResults: false,
    turnResume: false,
    turnInterrupt: true,
  };
  readonly provider: AgentRuntimeProvider;
  private transport: typeof startLocalAgentRun;
  constructor(
    provider: AgentRuntimeProvider,
    transport: typeof startLocalAgentRun = startLocalAgentRun,
  ) {
    this.provider = provider;
    this.transport = transport;
  }
  async startThread(input: AgentRuntimeThreadInput) {
    return {
      provider: this.provider,
      threadId: randomUUID(),
      profile: input.profile,
      workingDirectory: input.workingDirectory,
      access: input.access,
    };
  }
  async resumeThread(thread: AgentRuntimeThread) {
    return thread;
  }
  startTurn(
    thread: AgentRuntimeThread,
    input: AgentRuntimeTurnInput,
  ): AgentRuntimeTurn {
    const options: LocalAgentRunInput = {
      workingDirectory: thread.workingDirectory,
      prompt: input.prompt,
      model: thread.profile.model || undefined,
      effort: thread.profile.effort || undefined,
      access:
        thread.access === 'full-access' ? 'workspace-write' : thread.access,
      onActivity: (activity) =>
        input.onEvent?.({
          type: 'activity',
          threadId: thread.threadId,
          turnId: thread.threadId,
          summary: activity.summary,
          at: new Date().toISOString(),
        }),
    };
    const run = this.transport(this.provider, options);
    return {
      completion: run.completion.then((result) => ({
        threadId: thread.threadId,
        turnId: result.agentSessionId ?? thread.threadId,
        finalOutput: result.finalOutput,
        usage: result.usage,
      })),
      interrupt: run.cancel,
    };
  }
  async close() {}
}
