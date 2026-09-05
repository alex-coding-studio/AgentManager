import type {
  LogLevel,
  LogPhase,
  RunLogInput,
} from '../execution-observability/log-types.ts';

export const MATERIALIZATION_LOG_EVENTS = {
  'materialization.basis.prepared': 'PREPARE',
  'materialization.validated': 'VERIFY',
  'materialization.rejected': 'VERIFY',
  'materialization.identities.allocated': 'PUBLISH',
  'materialization.staged': 'PUBLISH',
  'materialization.stale': 'PUBLISH',
  'materialization.published': 'PUBLISH',
  'materialization.publication.failed': 'PUBLISH',
} as const satisfies Record<string, LogPhase>;

export type MaterializationLogEvent = keyof typeof MATERIALIZATION_LOG_EVENTS;

export function materializationLogEntry(
  event: MaterializationLogEvent,
  message: string,
  level: LogLevel = 'INFO',
): RunLogInput {
  return {
    level,
    actor: 'HOST',
    phase: MATERIALIZATION_LOG_EVENTS[event],
    event,
    message,
  };
}
