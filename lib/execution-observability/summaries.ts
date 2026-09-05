import type { LogActor, RetainedEffects, RunPhase } from './types.ts';

export type HostSummaryKind =
  | 'canceled'
  | 'timed-out'
  | 'ownership-lost'
  | 'termination-unconfirmed'
  | 'transport'
  | 'parse'
  | 'schema'
  | 'persistence'
  | 'publication'
  | 'host-verification'
  | 'unknown';

export type HostSummaryContext = {
  interruptedPhase?: RunPhase | null;
  interruptedActor?: LogActor | null;
  retained?: RetainedEffects | null;
};

export const COORDINATOR_FALLBACK = {
  title: 'Execution failed',
  detail:
    'Praxis preserved the original error and current effects but could not produce a reliable summary.',
};

const phaseDescriptions: Record<RunPhase, string> = {
  coordinating: 'Coordinator preparation',
  executing: 'Worker execution',
  verifying: 'verification',
  publishing: 'publishing',
  finalizing: 'finalization',
  stopping: 'stopping',
};

export function retainedEffectsSentence(
  retained: RetainedEffects | null | undefined,
) {
  if (!retained) return 'Retained effects were not recorded.';
  const parts: string[] = [];
  parts.push(
    retained.changedFiles === 0
      ? 'No modified files'
      : retained.changedFiles === 1
        ? 'One modified file'
        : `${retained.changedFiles} modified files`,
  );
  if (retained.commits.length)
    parts.push(
      retained.commits.length === 1
        ? 'one commit'
        : `${retained.commits.length} commits`,
    );
  if (retained.checkpoint)
    parts.push(`checkpoint ${retained.checkpoint.slice(0, 12)}`);
  if (retained.pullRequests.length)
    parts.push(
      retained.pullRequests.map((url) => pullRequestLabel(url)).join(', '),
    );
  const preserved = `${joinList(parts)} were preserved`;
  const checks = retained.checksStarted
    ? 'required checks had started.'
    : 'required checks had not started.';
  return `${preserved}; ${checks}`;
}

function pullRequestLabel(url: string) {
  const match = /\/pull\/(\d+)$/.exec(url);
  return match ? `PR #${match[1]}` : url;
}

function joinList(parts: string[]) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export function hostSummary(
  kind: HostSummaryKind,
  context: HostSummaryContext = {},
) {
  const phase = context.interruptedPhase
    ? phaseDescriptions[context.interruptedPhase]
    : null;
  switch (kind) {
    case 'canceled':
      return {
        title: 'Canceled',
        detail: `You canceled this Run${phase ? ` during ${phase}` : ''}. ${retainedEffectsSentence(context.retained)}`,
      };
    case 'timed-out':
      return {
        title: 'Execution timed out',
        detail: `The Run exceeded its time limit${phase ? ` during ${phase}` : ''} and was stopped. ${retainedEffectsSentence(context.retained)}`,
      };
    case 'ownership-lost':
      return {
        title: 'Execution ownership lost',
        detail:
          'The process that owned this Run is no longer running, so Praxis cannot confirm its result. Inspect the Run Log and workspace before starting a new Run.',
      };
    case 'termination-unconfirmed':
      return {
        title: 'Execution could not be stopped',
        detail: `Praxis sent cancellation but could not confirm that the ${context.interruptedActor === 'AGENT' ? 'Agent' : context.interruptedActor === 'COORDINATOR' ? 'Coordinator' : 'Worker'} exited. Inspect the Run Log and workspace before continuing.`,
      };
    case 'transport':
      return {
        title: 'Agent could not be reached',
        detail:
          'The Agent process failed before returning a result. The original error is preserved in the Run Log.',
      };
    case 'parse':
    case 'schema':
      return {
        title: 'Saved result could not be verified',
        detail:
          'The Agent finished, but its saved result did not match the expected shape. The original output is preserved in the Run Log; Re-read result checks it again without starting the Agent.',
      };
    case 'persistence':
      return {
        title: 'Result could not be saved',
        detail:
          'The Agent produced a result, but Praxis could not persist it. The original error is preserved in the Run Log.',
      };
    case 'publication':
      return {
        title: 'Response could not be published',
        detail:
          'The Run finished, but its response could not be written. The original error is preserved in the Run Log.',
      };
    case 'host-verification':
      return {
        title: 'Host verification failed',
        detail:
          'Praxis could not verify the references the Agent reported. The original findings are preserved in the Run Log.',
      };
    default:
      return COORDINATOR_FALLBACK;
  }
}
