import { PublicApiError } from '../api-errors.ts';
import {
  isModelId,
  reasoningEfforts,
  type ReasoningEffort,
} from './model-types.ts';

export type AgentProfile = {
  agent: 'codex' | 'claude' | 'deepseek';
  model: string;
  effort: '' | ReasoningEffort;
};

export function validateAgentProfile(profile: AgentProfile) {
  if (
    !profile ||
    !['codex', 'claude', 'deepseek'].includes(profile.agent) ||
    typeof profile.model !== 'string' ||
    (profile.model && !isModelId(profile.model)) ||
    !['', ...reasoningEfforts].includes(profile.effort)
  )
    throw new PublicApiError('Invalid Agent configuration.', 400);
}

export function readAgentProfile(form: FormData): AgentProfile {
  const profile = {
    agent: form.get('agent'),
    model: form.get('model') ?? '',
    effort: form.get('effort') ?? '',
  } as AgentProfile;
  validateAgentProfile(profile);
  return profile;
}

export function assertExecutionWorkerAgent(
  agent: AgentProfile['agent'],
): 'codex' | 'claude' {
  if (agent === 'deepseek')
    throw new PublicApiError(
      'DeepSeek is not available as an execution worker.',
      400,
    );
  return agent;
}

export function sameModelSelection(
  previous: Pick<AgentProfile, 'model' | 'effort'> | undefined,
  current: Pick<AgentProfile, 'model' | 'effort'>,
) {
  return (
    (previous?.model ?? '') === current.model &&
    (previous?.effort ?? '') === current.effort
  );
}
