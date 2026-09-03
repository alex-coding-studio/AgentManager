export type AgentGraphIntentionProfile<Id extends string> = {
  id: Id;
  label: string;
  description: string;
  prompt: string;
};

export type AgentGraphIntentionRegistry<
  Module extends string,
  Id extends string,
> = {
  module: Module;
  defaultId: Id;
  profiles: readonly AgentGraphIntentionProfile<Id>[];
};

export function defineAgentGraphIntentionRegistry<
  const Module extends string,
  const Profiles extends readonly AgentGraphIntentionProfile<string>[],
>(input: {
  module: Module;
  defaultId: Profiles[number]['id'];
  profiles: Profiles;
}) {
  const ids = input.profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length || !ids.includes(input.defaultId))
    throw new Error(`Invalid ${input.module} Intention Profile registry.`);
  return input as AgentGraphIntentionRegistry<
    Module,
    Profiles[number]['id']
  > & { profiles: Profiles };
}

export function intentionProfile<Module extends string, Id extends string>(
  registry: AgentGraphIntentionRegistry<Module, Id>,
  value: unknown,
) {
  const id = typeof value === 'string' ? value : registry.defaultId;
  const profile = registry.profiles.find((candidate) => candidate.id === id);
  if (!profile)
    throw new Error(`The ${registry.module} Intention Profile is invalid.`);
  return profile;
}
