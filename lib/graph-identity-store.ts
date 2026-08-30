import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  bindIdentity,
  identifyEntity,
  projectDisplayRelations,
  type GraphIdentityIndex,
  type IdentityEntity,
} from './graph-identity.ts';

type Scope = 'task-graph' | 'whats-next';
type StoredRun = {
  result?: { outcome: string; candidates?: IdentityEntity[] };
};
const runtime = globalThis as typeof globalThis & {
  graphIdentityState?: {
    pending: Map<string, Promise<unknown>>;
    initialized: Set<string>;
  };
};
const { pending, initialized } = (runtime.graphIdentityState ??= {
  pending: new Map<string, Promise<unknown>>(),
  initialized: new Set<string>(),
});

async function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(work);
  pending.set(key, result);
  try {
    return await result;
  } finally {
    if (pending.get(key) === result) pending.delete(key);
  }
}

function indexPath(planningPath: string, scope: Scope) {
  return path.join(planningPath, scope, 'identities.json');
}

async function readIndex(file: string): Promise<GraphIdentityIndex> {
  try {
    const index = JSON.parse(
      await readFile(file, 'utf8'),
    ) as GraphIdentityIndex;
    if (
      index.schemaVersion !== 1 ||
      !index.aliases ||
      !Number.isInteger(index.nextNodeNumber) ||
      index.nextNodeNumber < 1 ||
      !Array.isArray(index.formalAliases)
    ) {
      throw new Error('Invalid graph identity index.');
    }
    for (const [alias, uid] of Object.entries(index.aliases))
      bindIdentity(index, alias, uid);
    if (
      index.formalAliases.some(
        (alias) => !alias.startsWith('NODE-') || !index.aliases[alias],
      )
    ) {
      throw new Error('Invalid formal identity alias.');
    }
    return index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      schemaVersion: 1,
      aliases: {},
      nextNodeNumber: 1,
      formalAliases: [],
    };
  }
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
  });
  await rename(temporary, file);
}

async function records<T>(root: string, pattern: RegExp, name: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
      .map(async (entry) => {
        const file = path.join(root, entry.name, name);
        const text = await readFile(file, 'utf8');
        return { file, text, value: JSON.parse(text) as T };
      }),
  );
}

export async function ensureGraphIdentities(
  planningPath: string,
  scope: Scope,
  force = false,
) {
  const file = indexPath(planningPath, scope);
  return serialized(file, async () => {
    if (initialized.has(file) && !force) return;
    const index = await readIndex(file);
    const nodes = await records<IdentityEntity>(
      path.join(planningPath, scope, 'nodes'),
      /^NODE-\d{4,}$/,
      'node.json',
    );
    const runRoot =
      scope === 'task-graph' ? 'task-decomposition' : 'whats-next';
    const runs = await records<StoredRun>(
      path.join(planningPath, runRoot, 'runs'),
      /^RUN-/,
      'run.json',
    );
    const candidates = runs.flatMap((run) =>
      run.value.result?.outcome === 'proposal'
        ? (run.value.result.candidates ?? [])
        : [],
    );
    for (const { value: node } of nodes) {
      if (!node.uid) continue;
      bindIdentity(index, node.id!, node.uid);
      if (node.provenance)
        bindIdentity(index, node.provenance.candidateId, node.uid);
    }
    for (const candidate of candidates) {
      if (candidate.uid)
        bindIdentity(index, candidate.candidateId!, candidate.uid);
    }
    for (const candidate of candidates) {
      const alias = candidate.candidateId!;
      bindIdentity(index, alias, index.aliases[alias] ?? randomUUID());
    }
    for (const { value: node } of nodes) {
      const candidateAlias = node.provenance?.candidateId;
      const uid =
        node.uid ??
        (candidateAlias ? index.aliases[candidateAlias] : undefined) ??
        index.aliases[node.id!] ??
        randomUUID();
      bindIdentity(index, node.id!, uid);
      if (candidateAlias) bindIdentity(index, candidateAlias, uid);
    }
    for (const entity of [
      ...nodes.map((record) => record.value),
      ...candidates,
    ]) {
      for (const alias of [
        ...(entity.derivedFrom ?? []),
        ...(entity.dependsOn ?? []),
      ]) {
        if (!index.aliases[alias]) bindIdentity(index, alias, randomUUID());
      }
    }
    for (const record of nodes)
      record.value = identifyEntity(record.value, index);
    index.formalAliases = nodes.map((record) => record.value.id!);
    if (
      new Set(nodes.map((record) => record.value.uid)).size !== nodes.length
    ) {
      throw new Error('Multiple formal Nodes claim the same stable identity.');
    }
    for (const record of runs) {
      if (record.value.result?.outcome === 'proposal') {
        record.value.result.candidates = record.value.result.candidates?.map(
          (candidate) => identifyEntity(candidate, index),
        );
      }
    }
    await atomicJson(file, index);
    for (const record of [...nodes, ...runs]) {
      if (
        JSON.stringify(JSON.parse(record.text)) === JSON.stringify(record.value)
      )
        continue;
      const backup = path.join(
        planningPath,
        scope,
        'identity-migration-backup',
        path.relative(planningPath, record.file),
      );
      await mkdir(path.dirname(backup), { recursive: true });
      await copyFile(record.file, backup, constants.COPYFILE_EXCL).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        },
      );
      await atomicJson(record.file, record.value);
    }
    initialized.add(file);
  });
}

export async function reserveNodeIdentity(
  planningPath: string,
  scope: Scope,
  existingUid?: string,
) {
  await ensureGraphIdentities(planningPath, scope);
  const file = indexPath(planningPath, scope);
  return serialized(file, async () => {
    const index = await readIndex(file);
    const uid = existingUid ?? randomUUID();
    const existing = Object.entries(index.aliases).find(
      ([alias, value]) => alias.startsWith('NODE-') && value === uid,
    );
    if (existing) return { id: existing[0], uid };
    const id = `NODE-${String(index.nextNodeNumber).padStart(4, '0')}`;
    bindIdentity(index, id, uid);
    await atomicJson(file, index);
    return { id, uid };
  });
}

export async function identifyCandidates<T extends IdentityEntity>(
  planningPath: string,
  scope: Scope,
  candidates: T[],
  revisionTarget?: IdentityEntity,
) {
  await ensureGraphIdentities(planningPath, scope);
  const file = indexPath(planningPath, scope);
  return serialized(file, async () => {
    const index = await readIndex(file);
    for (const candidate of candidates) {
      const alias = candidate.candidateId!;
      if (index.aliases[alias] && revisionTarget?.candidateId !== alias) {
        throw new Error(`Candidate alias ${alias} has already been allocated.`);
      }
      bindIdentity(
        index,
        alias,
        revisionTarget?.candidateId === alias
          ? (revisionTarget.uid ?? index.aliases[alias] ?? randomUUID())
          : randomUUID(),
      );
    }
    const result = candidates.map((candidate) =>
      identifyEntity(candidate, index),
    );
    await atomicJson(file, index);
    return result;
  });
}

export async function readIdentifiedEntities<T extends IdentityEntity>(
  planningPath: string,
  scope: Scope,
  entities: T[],
  formal = false,
) {
  await ensureGraphIdentities(
    planningPath,
    scope,
    entities.some((entity) => !entity.uid),
  );
  const file = indexPath(planningPath, scope);
  return serialized(file, async () => {
    const index = await readIndex(file);
    if (formal) {
      const aliases = entities.map((entity) => entity.id!).sort();
      if (
        JSON.stringify(aliases) !==
        JSON.stringify([...index.formalAliases].sort())
      ) {
        index.formalAliases = aliases;
        await atomicJson(file, index);
      }
    }
    return entities.map((entity) => projectDisplayRelations(entity, index));
  });
}

export async function reservedCandidateAliases(
  planningPath: string,
  scope: Scope,
) {
  await ensureGraphIdentities(planningPath, scope);
  const index = await readIndex(indexPath(planningPath, scope));
  return Object.keys(index.aliases).filter((alias) =>
    alias.startsWith('CANDIDATE-'),
  );
}
