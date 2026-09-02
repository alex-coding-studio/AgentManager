export type AgentGraphMotionProfile<Id extends string> = {
  id: Id;
  label: string;
  description: string;
  prompt: string;
};

export type AgentGraphMotionRegistry<
  Module extends string,
  Id extends string,
> = {
  module: Module;
  defaultId: Id;
  profiles: readonly AgentGraphMotionProfile<Id>[];
};

export function defineAgentGraphMotionRegistry<
  const Module extends string,
  const Profiles extends readonly AgentGraphMotionProfile<string>[],
>(input: {
  module: Module;
  defaultId: Profiles[number]['id'];
  profiles: Profiles;
}) {
  const ids = input.profiles.map((profile) => profile.id);
  if (new Set(ids).size !== ids.length || !ids.includes(input.defaultId))
    throw new Error(`Invalid ${input.module} Motion registry.`);
  return input as AgentGraphMotionRegistry<Module, Profiles[number]['id']> & {
    profiles: Profiles;
  };
}

export function motionProfile<Module extends string, Id extends string>(
  registry: AgentGraphMotionRegistry<Module, Id>,
  value: unknown,
) {
  const id = typeof value === 'string' ? value : registry.defaultId;
  const profile = registry.profiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`The ${registry.module} Motion is invalid.`);
  return profile;
}
