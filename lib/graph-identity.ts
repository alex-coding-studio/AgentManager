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
  nextNodeNumber: number;
  formalAliases: string[];
};

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
  if (!/^(NODE|CANDIDATE)-\d{4,}$/.test(alias)) {
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
  if (alias.startsWith('NODE-')) {
    index.nextNodeNumber = Math.max(
      index.nextNodeNumber,
      Number(alias.slice(5)) + 1,
    );
  }
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
