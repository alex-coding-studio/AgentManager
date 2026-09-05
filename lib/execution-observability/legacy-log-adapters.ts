import { runLogEntry } from './run-log.ts';
import type { LogActor, LogLevel, LogPhase, RunLogEntry } from './types.ts';

type LegacyGraphRun = {
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  error?: string | null;
  activity: Array<{ at: string; summary: string }>;
};

type LegacyExecutionRun = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'running' | 'succeeded' | 'failed' | 'canceled';
  error: string | null;
};

type LegacyProgress = {
  phase: string;
  summary: string;
  updatedAt: string;
  attempts: number;
};

type LegacyAttempt = {
  id: string;
  role: 'coordinator' | 'worker';
  phase: string;
  startedAt: string;
  endedAt: string | null;
  summary: string;
  error?: string;
};

type LegacyDecision = {
  decision: string;
  summary: string;
};

type LegacyTrace = {
  attempts: LegacyAttempt[];
  decisions: LegacyDecision[];
};

function entry(
  sequence: number,
  at: string,
  level: LogLevel,
  actor: LogActor,
  phase: LogPhase,
  event: string,
  message: string,
) {
  return runLogEntry(sequence, { at, level, actor, phase, event, message });
}

function terminalEvent(status: string, error?: string | null) {
  switch (status) {
    case 'running':
    case 'validating':
      return null;
    case 'failed':
      return {
        level: 'ERROR' as const,
        event: 'run.failed',
        message: error?.trim() || 'Fail response published',
      };
    case 'canceled':
      return {
        level: 'WARN' as const,
        event: 'run.canceled',
        message: 'The Run was canceled',
      };
    case 'clarification':
    case 'insufficient-evidence':
      return {
        level: 'WARN' as const,
        event: 'run.warning',
        message: 'Warning response published',
      };
    default:
      return {
        level: 'INFO' as const,
        event: 'run.completed',
        message: 'Completed response published',
      };
  }
}

export function adaptAgentGraphActivity(run: LegacyGraphRun): RunLogEntry[] {
  const entries: RunLogEntry[] = [];
  let sequence = 0;
  entries.push(
    entry(
      ++sequence,
      run.startedAt,
      'INFO',
      'HOST',
      'RUN',
      'run.started',
      `Run ${run.runId} started`,
    ),
  );
  for (const item of run.activity) {
    const tool = /^(?:Running|Finished)(?:\s|:)/.test(item.summary);
    entries.push(
      entry(
        ++sequence,
        item.at,
        'INFO',
        'AGENT',
        'EXECUTE',
        tool ? 'tool.activity' : 'agent.message',
        item.summary,
      ),
    );
  }
  const terminal = terminalEvent(run.status, run.error);
  if (terminal)
    entries.push(
      entry(
        ++sequence,
        run.endedAt ?? run.activity.at(-1)?.at ?? run.startedAt,
        terminal.level,
        'HOST',
        'RUN',
        terminal.event,
        terminal.message,
      ),
    );
  return entries;
}

const progressMapping: Record<
  string,
  { actor: LogActor; phase: LogPhase; event: string }
> = {
  prepare: {
    actor: 'COORDINATOR',
    phase: 'PREPARE',
    event: 'assignment.progress',
  },
  dispatch: {
    actor: 'COORDINATOR',
    phase: 'PREPARE',
    event: 'assignment.dispatched',
  },
  qualify: {
    actor: 'COORDINATOR',
    phase: 'FINALIZE',
    event: 'qualification.progress',
  },
  execute: { actor: 'WORKER', phase: 'EXECUTE', event: 'worker.progress' },
  extend: { actor: 'WORKER', phase: 'EXECUTE', event: 'worker.progress' },
  repair: { actor: 'WORKER', phase: 'EXECUTE', event: 'worker.progress' },
  complete: { actor: 'HOST', phase: 'FINALIZE', event: 'result.recorded' },
};

export function adaptExecutionActivity(
  run: LegacyExecutionRun,
  activity: LegacyProgress[],
): RunLogEntry[] {
  const entries: RunLogEntry[] = [];
  let sequence = 0;
  entries.push(
    entry(
      ++sequence,
      run.startedAt,
      'INFO',
      'HOST',
      'RUN',
      'run.started',
      `Action Run ${run.id} started`,
    ),
  );
  for (const item of activity) {
    const running = /^Running job: /.exec(item.summary);
    const finished = /^Finished: ([\s\S]+) \(exit (\S+)\)$/.exec(item.summary);
    if (running) {
      entries.push(
        entry(
          ++sequence,
          item.updatedAt,
          'INFO',
          'JOB',
          'VERIFY',
          item.summary.includes(' — ') ? 'job.progress' : 'job.started',
          item.summary.replace(/^Running job: /, ''),
        ),
      );
      continue;
    }
    if (finished) {
      const exitCode = finished[2];
      entries.push(
        entry(
          ++sequence,
          item.updatedAt,
          exitCode === '0' ? 'INFO' : 'ERROR',
          'JOB',
          'VERIFY',
          'job.finished',
          `${finished[1]} exited ${exitCode}`,
        ),
      );
      continue;
    }
    const mapping = progressMapping[item.phase] ?? {
      actor: 'HOST' as const,
      phase: 'RUN' as const,
      event: 'run.progress',
    };
    entries.push(
      entry(
        ++sequence,
        item.updatedAt,
        'INFO',
        mapping.actor,
        mapping.phase,
        mapping.event,
        item.summary,
      ),
    );
  }
  const terminal = terminalEvent(
    run.status === 'succeeded' ? 'succeeded' : run.status,
    run.error,
  );
  if (terminal)
    entries.push(
      entry(
        ++sequence,
        run.endedAt ?? activity.at(-1)?.updatedAt ?? run.startedAt,
        terminal.level,
        'HOST',
        'RUN',
        terminal.event,
        terminal.message,
      ),
    );
  return entries;
}

export function adaptCoordinationTrace(trace: LegacyTrace): RunLogEntry[] {
  const entries: RunLogEntry[] = [];
  let sequence = 0;
  for (const attempt of trace.attempts) {
    const actor: LogActor =
      attempt.role === 'coordinator' ? 'COORDINATOR' : 'WORKER';
    const phase: LogPhase =
      attempt.role === 'coordinator'
        ? attempt.phase === 'qualify'
          ? 'FINALIZE'
          : 'PREPARE'
        : 'EXECUTE';
    entries.push(
      entry(
        ++sequence,
        attempt.startedAt,
        'INFO',
        actor,
        phase,
        `${attempt.role}.started`,
        `${attempt.phase} attempt ${attempt.id}`,
      ),
    );
    entries.push(
      entry(
        ++sequence,
        attempt.endedAt ?? attempt.startedAt,
        attempt.error ? 'ERROR' : 'INFO',
        actor,
        phase,
        `${attempt.role}.finished`,
        attempt.error
          ? `${attempt.summary}\n${attempt.error}`
          : attempt.summary,
      ),
    );
  }
  const last = trace.attempts.at(-1);
  for (const decision of trace.decisions)
    entries.push(
      entry(
        ++sequence,
        last?.endedAt ?? last?.startedAt ?? new Date(0).toISOString(),
        decision.decision === 'blocked' || decision.decision === 'needs-user'
          ? 'WARN'
          : 'INFO',
        'COORDINATOR',
        'FINALIZE',
        'decision.recorded',
        `${decision.decision}: ${decision.summary}`,
      ),
    );
  return entries;
}
