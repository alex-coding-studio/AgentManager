import path from 'node:path';
import type { AgentProfile } from './agent-profile.ts';
import { readCodexSkills, withSkillCatalog } from './local-agent-skills.ts';
import {
  startLocalAgentRun,
  type LocalAgentKind,
  type LocalAgentRun,
  type LocalAgentRunInput,
} from './local-agent-transport.ts';
import { CodexAppServerDriver } from './codex-app-server-driver.ts';
import { HostJobBroker } from './host-job-broker.ts';

export function startEventDrivenWorkerRun(
  agent: LocalAgentKind,
  input: LocalAgentRunInput,
): LocalAgentRun {
  if (agent !== 'codex' || input.access !== 'workspace-write')
    return startLocalAgentRun(agent, input);
  let canceled = false;
  let driver: CodexAppServerDriver | undefined;
  let interrupt: (() => void) | undefined;
  let fallback: LocalAgentRun | undefined;
  const completion = (async () => {
    const catalog = await readCodexSkills(input.workingDirectory);
    if (canceled) throw new Error('Execution canceled before Agent startup.');
    if (catalog.executionAccess !== 'full-access') {
      fallback = startLocalAgentRun(agent, input);
      if (canceled) fallback.cancel();
      return await fallback.completion;
    }
    const recordRoot = path.join(
      input.protectedPath ?? input.workingDirectory,
      'runtime/jobs',
    );
    driver = new CodexAppServerDriver({
      brokerFactory: (thread) =>
        new HostJobBroker(
          thread.workingDirectory,
          recordRoot,
          (event) =>
            input.onActivity?.({
              kind: 'tool',
              phase: event.status === 'running' ? 'started' : 'completed',
              summary:
                event.status === 'running'
                  ? `Running job: ${event.label}`
                  : `Finished job: ${event.label} (${event.status}, exit ${event.exitCode ?? 'none'})`,
            }),
          (progress) =>
            input.onActivity?.({
              kind: 'tool',
              phase: 'started',
              summary: `Running job: ${progress.label} — ${progress.outputTail}`,
            }),
        ),
    });
    const profile: AgentProfile = {
      agent: 'codex' as const,
      model: input.model ?? '',
      effort: input.effort ?? '',
    };
    const thread = await driver.startThread({
      profile,
      workingDirectory: input.workingDirectory,
      access: 'full-access',
    });
    const permissionContext =
      '\n\nExecution permissions: Full Access, selected in local Codex settings. There is no OS filesystem sandbox protecting the primary checkout or planning store. You must still work only in the Card worktree, preserve host-owned records, and follow the explicit PR and acceptance boundaries. Full Access is not authorization for unrelated actions.';
    const hostToolContext =
      '\n\nHost job tool: use run_job for builds, tests and other commands that may run longer than a quick inspection. The Host owns waiting, progress, logs and cancellation. The tool returns only after completion; never poll the process with write_stdin or start an overlapping replacement. Short read-only commands and file edits may use normal tools.';
    const turn = driver.startTurn(thread, {
      prompt:
        withSkillCatalog(input.prompt, catalog) +
        permissionContext +
        hostToolContext,
      onEvent: (event) => {
        if (event.type === 'activity')
          input.onActivity?.({ kind: 'message', summary: event.summary });
      },
    });
    interrupt = turn.interrupt;
    if (canceled) turn.interrupt();
    try {
      const result = await turn.completion;
      return {
        agentSessionId: result.threadId,
        finalOutput: result.finalOutput,
        usage: result.usage,
        executionAccess: catalog.executionAccess,
      };
    } finally {
      await driver.close();
    }
  })();
  return {
    completion,
    cancel: () => {
      canceled = true;
      fallback?.cancel();
      interrupt?.();
      void driver?.close();
    },
  };
}
