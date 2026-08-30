export type StableRelations = {
  derivedFrom: string[];
  dependsOn: string[];
};

export type GraphIdentityFields = {
  uid?: string;
  relations?: StableRelations;
};

export type IdentityEntity = GraphIdentityFields & {
  id?: string;
  candidateId?: string;
  derivedFrom?: string[];
  dependsOn?: string[];
  provenance?: { candidateId: string };
};

export type GraphIdentityIndex = {
  schemaVersion: 1;
  aliases: Record<string, string>;
  formalAliases: string[];
};

export const GRAPH_ALIAS_SUFFIX = '[0-9a-f]{8,32}';
export const NODE_ALIAS_PATTERN = `^NODE-${GRAPH_ALIAS_SUFFIX}$`;
export const CANDIDATE_ALIAS_PATTERN = `^CANDIDATE-(?:[0-9]{4,}|${GRAPH_ALIAS_SUFFIX})$`;

export function graphCardLabel(alias: string) {
  return (alias.split('-').at(-1) ?? alias).slice(0, 8);
}

export const GRAPH_IDENTITY_PROMPT = `AgentManager owns UUIDs and permanent aliases. For new Candidates, candidateId is only a unique reference within this response; you may reuse CANDIDATE-0001 in another response. A reference to a Candidate declared in this response means that new Candidate, not an existing object with the same label. Use the current packet's aliases for external references. AgentManager assigns CANDIDATE-<UUID suffix> aliases and remaps structured sibling dependencies. previousProposalAliases reports how your preceding response was renamed; use those permanent aliases in later references. Refine/revise must echo the existing target alias exactly, never allocate a new identity. Permanent NODE and CANDIDATE suffixes are 8-32 lowercase hexadecimal characters. Never invent a global sequence, UUID, or permanent alias. Keep identifiers in structured fields rather than embedding local labels in Markdown.`;

export function uuidAlias(
  index: GraphIdentityIndex,
  prefix: 'NODE' | 'CANDIDATE',
  uid: string,
) {
  const compact = uid.replaceAll('-', '');
  for (let length = 8; length <= compact.length; length += 4) {
    const suffix = compact.slice(-length);
    if (
      ['NODE', 'CANDIDATE'].every(
        (kind) =>
          !index.aliases[`${kind}-${suffix}`] ||
          index.aliases[`${kind}-${suffix}`] === uid,
      )
    ) {
      return `${prefix}-${suffix}`;
    }
  }
  throw new Error('Cannot allocate a unique graph alias.');
}

export function candidatePromptView<T extends GraphIdentityFields>(
  candidate: T,
) {
  const value = { ...candidate };
  delete value.uid;
  delete value.relations;
  return value;
}

export function bindIdentity(
  index: GraphIdentityIndex,
  alias: string,
  uid: string,
) {
  if (!new RegExp(`^(NODE|CANDIDATE)-${GRAPH_ALIAS_SUFFIX}$`).test(alias)) {
    throw new Error(`Invalid graph alias: ${alias}.`);
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      uid,
    )
  ) {
    throw new Error('Invalid stable graph UUID.');
  }
  const existing = index.aliases[alias];
  if (existing && existing !== uid) {
    throw new Error(`Graph identity cannot change for ${alias}.`);
  }
  index.aliases[alias] = uid;
}

export function identifyEntity<T extends IdentityEntity>(
  entity: T,
  index: GraphIdentityIndex,
): T & { uid: string; relations: StableRelations } {
  const alias = entity.id ?? entity.candidateId ?? '';
  const uid = index.aliases[alias];
  if (!uid || (entity.uid && entity.uid !== uid)) {
    throw new Error(`Graph identity is missing or inconsistent for ${alias}.`);
  }
  const resolve = (reference: string) => {
    const resolved = index.aliases[reference];
    if (!resolved) throw new Error(`Unknown graph reference: ${reference}.`);
    return resolved;
  };
  const relations = entity.relations ?? {
    derivedFrom: (entity.derivedFrom ?? []).map(resolve),
    dependsOn: (entity.dependsOn ?? []).map(resolve),
  };
  const known = new Set(Object.values(index.aliases));
  if (
    !Array.isArray(relations.derivedFrom) ||
    !Array.isArray(relations.dependsOn)
  ) {
    throw new Error('Invalid stable graph relations.');
  }
  for (const reference of [...relations.derivedFrom, ...relations.dependsOn]) {
    if (!known.has(reference)) {
      throw new Error(`Unknown stable graph reference: ${reference}.`);
    }
  }
  return { ...entity, uid, relations };
}

export function projectDisplayRelations<T extends IdentityEntity>(
  entity: T,
  index: GraphIdentityIndex,
) {
  const identified = identifyEntity(entity, index);
  const labels = new Map<string, string>();
  for (const [alias, uid] of Object.entries(index.aliases)) {
    if (!labels.has(uid)) labels.set(uid, alias);
  }
  for (const alias of index.formalAliases) {
    labels.set(index.aliases[alias]!, alias);
  }
  return {
    ...identified,
    derivedFrom: identified.relations.derivedFrom.map((uid) =>
      labels.get(uid)!,
    ),
    dependsOn: identified.relations.dependsOn.map((uid) => labels.get(uid)!),
  };
}
