import {
  isModelId,
  reasoningEfforts,
  type ReasoningEffort,
} from './local-agent-model-types.ts';

export type AgentProfile = {
  agent: 'codex' | 'claude';
  model: string;
  effort: '' | ReasoningEffort;
};

export function validateAgentProfile(profile: AgentProfile) {
  if (
    !profile ||
    !['codex', 'claude'].includes(profile.agent) ||
    typeof profile.model !== 'string' ||
    (profile.model && !isModelId(profile.model)) ||
    !['', ...reasoningEfforts].includes(profile.effort)
  )
    throw new Error('Invalid Agent configuration.');
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

export function sameModelSelection(
  previous: Pick<AgentProfile, 'model' | 'effort'> | undefined,
  current: Pick<AgentProfile, 'model' | 'effort'>,
) {
  return (
    (previous?.model ?? '') === current.model &&
    (previous?.effort ?? '') === current.effort
  );
}
