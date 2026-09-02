import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PublicApiError } from './api-errors.ts';
import {
  domainModelDirectory,
  domainModelFile,
} from './domain-model-storage.ts';
import type { RegisteredProject } from './project-registry.ts';

export type DomainProvenance = 'explicit' | 'inferred';
export type DomainField = {
  id: string;
  name: string;
  meaning: string;
  valueType: string;
  required: boolean;
  multiple: boolean;
  display: 'primary' | 'secondary' | 'system';
  provenance: DomainProvenance;
};
export type DomainEntity = {
  id: string;
  name: string;
  meaning: string;
  fields: DomainField[];
  provenance: DomainProvenance;
};
export type DomainRelationship = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  label: string;
  meaning: string;
  semanticRole: 'inheritance' | 'containment' | 'association';
  direction: 'directed' | 'undirected';
  sourceCardinality: string;
  targetCardinality: string;
  provenance: DomainProvenance;
};
export type DomainConstraint = {
  id: string;
  target: { kind: 'model' | 'entity' | 'relationship'; id: string | null };
  text: string;
  provenance: DomainProvenance;
};
export type DomainModel = {
  schemaVersion: 1;
  stateVersion: number;
  entities: DomainEntity[];
  relationships: DomainRelationship[];
  constraints: DomainConstraint[];
  lastRunId: string | null;
  updatedAt: string | null;
};
export type ProposedDomainModel = {
  entities: DomainEntity[];
  relationships: DomainRelationship[];
  constraints: DomainConstraint[];
};
export type DomainChange = {
  kind: 'applied' | 'restored';
  runId: string | null;
  baseVersion: number;
  stateVersion: number;
  instruction: string;
  summary: string;
  added: string[];
  updated: string[];
  removed: string[];
  createdAt: string;
};
type DomainSnapshot = Pick<
  DomainModel,
  'entities' | 'relationships' | 'constraints' | 'lastRunId' | 'updatedAt'
>;
type StoredDomainState = {
  schemaVersion: 1;
  model: DomainModel;
  undo: DomainSnapshot | null;
  lastChange: DomainChange | null;
  committedRuns: Array<{
    runId: string;
    stateVersion: number;
    committedAt: string;
  }>;
};
export type DerivedDomainRelationship = Omit<
  DomainRelationship,
  'provenance'
> & {
  provenance: 'derived';
  derivedFrom: string[];
};

const stableId = /^(ENTITY|FIELD|RELATIONSHIP|CONSTRAINT)-[0-9a-f-]{36}$/;
const temporaryId = /^NEW_(ENTITY|FIELD|RELATIONSHIP|CONSTRAINT)_[A-Z0-9_]+$/;
const runtime = globalThis as typeof globalThis & {
  domainModelWrites?: Map<string, Promise<unknown>>;
};
const writes = (runtime.domainModelWrites ??= new Map());

export function emptyDomainModel(): DomainModel {
  return {
    schemaVersion: 1,
    stateVersion: 0,
    entities: [],
    relationships: [],
    constraints: [],
    lastRunId: null,
    updatedAt: null,
  };
}

export async function readDomainModel(project: RegisteredProject) {
  return (await readDomainState(project)).model;
}

export async function readDomainModelView(project: RegisteredProject) {
  const state = await readDomainState(project);
  return {
    model: state.model,
    canUndo: state.undo !== null,
    lastChange: state.lastChange,
  };
}

export async function readDomainModelCommitReceipt(
  project: RegisteredProject,
  runId: string,
) {
  const state = await readDomainState(project);
  return state.committedRuns.find((item) => item.runId === runId) ?? null;
}

async function readDomainState(project: RegisteredProject) {
  try {
    const stored = JSON.parse(
      await readFile(await domainModelFile(project, [], 'state.json'), 'utf8'),
    ) as Omit<StoredDomainState, 'lastChange'> & {
      lastChange?: DomainChange | null;
    };
    if (stored.schemaVersion !== 1 || !('undo' in stored))
      throw new Error('Invalid stored Domain Model state.');
    const committedRuns = Array.isArray(stored.committedRuns)
      ? stored.committedRuns
      : stored.model.lastRunId
        ? [
            {
              runId: stored.model.lastRunId,
              stateVersion: stored.model.stateVersion,
              committedAt: stored.model.updatedAt ?? new Date(0).toISOString(),
            },
          ]
        : [];
    const lastChange =
      stored.lastChange !== undefined
        ? stored.lastChange
        : stored.model.stateVersion > 0 &&
            stored.model.lastRunId === null &&
            stored.undo === null &&
            stored.model.updatedAt
          ? legacyUndoChange(stored.model)
          : null;
    const state = { ...stored, committedRuns, lastChange };
    validateStoredModel(state.model);
    validateCommitReceipts(state.committedRuns);
    validateLastChange(state.lastChange, state.model.stateVersion);
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return {
        schemaVersion: 1,
        model: emptyDomainModel(),
        undo: null,
        lastChange: null,
        committedRuns: [],
      } satisfies StoredDomainState;
    throw error;
  }
}

export async function applyProposedDomainModel(
  project: RegisteredProject,
  input: {
    baseVersion: number;
    runId: string;
    instruction: string;
    summary: string;
    proposed: ProposedDomainModel;
  },
) {
  return serialize(project, async () => {
    const state = await readDomainState(project);
    const current = state.model;
    if (current.stateVersion !== input.baseVersion)
      throw new PublicApiError(
        'The Domain Model changed while the Agent was running.',
        409,
      );
    const nextVersion = current.stateVersion + 1;
    const next = materializeProposedModel(
      current,
      input.proposed,
      nextVersion,
      input.runId,
    );
    const change = changeBetween(current, next, {
      kind: 'applied',
      runId: input.runId,
      instruction: input.instruction,
      summary: input.summary,
    });
    if (
      change.added.length === 0 &&
      change.updated.length === 0 &&
      change.removed.length === 0
    )
      return {
        model: current,
        change: null,
        canUndo: state.undo !== null,
      };
    await writeDomainState(project, {
      schemaVersion: 1,
      model: next,
      undo: snapshot(current),
      lastChange: change,
      committedRuns: [
        ...state.committedRuns,
        {
          runId: input.runId,
          stateVersion: next.stateVersion,
          committedAt: next.updatedAt!,
        },
      ],
    });
    return { model: next, change, canUndo: true };
  });
}

export async function undoLastDomainModelChange(project: RegisteredProject) {
  return serialize(project, async () => {
    const state = await readDomainState(project);
    const current = state.model;
    if (!state.undo)
      throw new PublicApiError('There is no Domain Model change to undo.', 400);
    const next: DomainModel = {
      schemaVersion: 1,
      ...state.undo,
      stateVersion: current.stateVersion + 1,
      lastRunId: null,
      updatedAt: new Date().toISOString(),
    };
    const change = changeBetween(current, next, {
      kind: 'restored',
      runId: null,
      instruction: 'Undo the last Domain Model change.',
      summary: 'Undid the last Domain Model change.',
    });
    await writeDomainState(project, {
      schemaVersion: 1,
      model: next,
      undo: null,
      lastChange: change,
      committedRuns: state.committedRuns,
    });
    return { model: next, change, canUndo: false };
  });
}

function materializeProposedModel(
  current: DomainModel,
  proposed: ProposedDomainModel,
  stateVersion: number,
  runId: string,
): DomainModel {
  if (
    !proposed ||
    !Array.isArray(proposed.entities) ||
    !Array.isArray(proposed.relationships) ||
    !Array.isArray(proposed.constraints) ||
    proposed.entities.length > 100 ||
    proposed.relationships.length > 300 ||
    proposed.constraints.length > 300
  )
    throw new Error('The Agent returned an invalid Domain Model shape.');
  const currentIds = new Set([
    ...current.entities.flatMap((entity) => [
      entity.id,
      ...entity.fields.map((field) => field.id),
    ]),
    ...current.relationships.map((item) => item.id),
    ...current.constraints.map((item) => item.id),
  ]);
  const mapping = new Map<string, string>();
  const allocate = (id: string, prefix: string) => {
    if (stableId.test(id)) {
      if (!id.startsWith(`${prefix}-`))
        throw new Error(
          `A ${prefix.toLowerCase()} used another Domain identifier type.`,
        );
      if (!currentIds.has(id))
        throw new Error(`The Agent invented a stable Domain identifier: ${id}`);
      return id;
    }
    if (!temporaryId.test(id) || !id.startsWith(`NEW_${prefix}_`))
      throw new Error(`Invalid new ${prefix.toLowerCase()} reference: ${id}`);
    if (!mapping.has(id)) mapping.set(id, `${prefix}-${randomUUID()}`);
    return mapping.get(id)!;
  };
  for (const entity of proposed.entities) {
    allocate(entity.id, 'ENTITY');
    for (const field of entity.fields ?? []) allocate(field.id, 'FIELD');
  }
  for (const item of proposed.relationships) allocate(item.id, 'RELATIONSHIP');
  for (const item of proposed.constraints) allocate(item.id, 'CONSTRAINT');
  const ref = (id: string) => mapping.get(id) ?? id;
  const entityIds = new Set(proposed.entities.map((item) => ref(item.id)));
  const entities = proposed.entities.map((entity) => {
    const id = ref(entity.id);
    const fields = (entity.fields ?? []).map((field) => {
      const fieldId = ref(field.id);
      return {
        id: fieldId,
        name: text(field.name, 80, 'Field name'),
        meaning: text(field.meaning, 500, 'Field meaning', true),
        valueType: text(field.valueType, 80, 'Field value type'),
        required: Boolean(field.required),
        multiple: Boolean(field.multiple),
        display: oneOf(field.display, ['primary', 'secondary', 'system']),
        provenance: oneOf(field.provenance, ['explicit', 'inferred']),
      } satisfies DomainField;
    });
    unique(
      fields.map((field) => field.id),
      'Field identifier',
    );
    unique(
      fields.map((field) => field.name.toLocaleLowerCase()),
      'Field name',
    );
    return {
      id,
      name: text(entity.name, 100, 'Entity name'),
      meaning: text(entity.meaning, 1000, 'Entity meaning'),
      fields,
      provenance: oneOf(entity.provenance, ['explicit', 'inferred']),
    } satisfies DomainEntity;
  });
  unique(
    entities.map((item) => item.id),
    'Entity identifier',
  );
  unique(
    entities.flatMap((item) => item.fields.map((field) => field.id)),
    'Field identifier',
  );
  unique(
    entities.map((item) => item.name.toLocaleLowerCase()),
    'Entity name',
  );
  const relationships = proposed.relationships.map((item) => {
    const id = ref(item.id);
    const sourceEntityId = ref(item.sourceEntityId);
    const targetEntityId = ref(item.targetEntityId);
    if (!entityIds.has(sourceEntityId) || !entityIds.has(targetEntityId))
      throw new Error('A Domain relationship references a missing Entity.');
    return {
      id,
      sourceEntityId,
      targetEntityId,
      label: text(item.label, 60, 'Relationship label'),
      meaning: text(item.meaning, 1000, 'Relationship meaning', true),
      semanticRole: oneOf(item.semanticRole, [
        'inheritance',
        'containment',
        'association',
      ]),
      direction: oneOf(item.direction, ['directed', 'undirected']),
      sourceCardinality: text(item.sourceCardinality, 30, 'Source cardinality'),
      targetCardinality: text(item.targetCardinality, 30, 'Target cardinality'),
      provenance: oneOf(item.provenance, ['explicit', 'inferred']),
    } satisfies DomainRelationship;
  });
  unique(
    relationships.map((item) => item.id),
    'Relationship identifier',
  );
  assertNoInheritanceCycle(relationships);
  const relationshipIds = new Set(relationships.map((item) => item.id));
  const constraints = proposed.constraints.map((item) => {
    const id = ref(item.id);
    const targetId = item.target.id ? ref(item.target.id) : null;
    if (
      (item.target.kind === 'model' && targetId !== null) ||
      (item.target.kind === 'entity' &&
        (!targetId || !entityIds.has(targetId))) ||
      (item.target.kind === 'relationship' &&
        (!targetId || !relationshipIds.has(targetId)))
    )
      throw new Error('A Domain constraint has an invalid target.');
    return {
      id,
      target: {
        kind: oneOf(item.target.kind, ['model', 'entity', 'relationship']),
        id: targetId,
      },
      text: text(item.text, 1000, 'Constraint'),
      provenance: oneOf(item.provenance, ['explicit', 'inferred']),
    } satisfies DomainConstraint;
  });
  unique(
    constraints.map((item) => item.id),
    'Constraint identifier',
  );
  const next = {
    schemaVersion: 1,
    stateVersion,
    entities,
    relationships,
    constraints,
    lastRunId: runId,
    updatedAt: new Date().toISOString(),
  } satisfies DomainModel;
  validateStoredModel(next);
  return next;
}

function assertNoInheritanceCycle(relationships: DomainRelationship[]) {
  const graph = new Map<string, string[]>();
  for (const item of relationships)
    if (item.semanticRole === 'inheritance')
      graph.set(item.sourceEntityId, [
        ...(graph.get(item.sourceEntityId) ?? []),
        item.targetEntityId,
      ]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error('Domain inheritance cannot contain a cycle.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

function changeBetween(
  current: DomainModel,
  next: DomainModel,
  input: Pick<DomainChange, 'kind' | 'runId' | 'instruction' | 'summary'>,
): DomainChange {
  const flatten = (model: DomainModel) => [
    ...model.entities,
    ...model.entities.flatMap((entity) => entity.fields),
    ...model.relationships,
    ...model.constraints,
  ];
  const before = new Map(flatten(current).map((item) => [item.id, item]));
  const after = new Map(flatten(next).map((item) => [item.id, item]));
  return {
    ...input,
    baseVersion: current.stateVersion,
    stateVersion: next.stateVersion,
    added: [...after.keys()].filter((id) => !before.has(id)),
    removed: [...before.keys()].filter((id) => !after.has(id)),
    updated: [...after.keys()].filter(
      (id) =>
        before.has(id) &&
        JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
    ),
    createdAt: new Date().toISOString(),
  };
}

async function writeDomainState(
  project: RegisteredProject,
  state: StoredDomainState,
) {
  await atomicJson(
    path.join(await domainModelDirectory(project), 'state.json'),
    state,
  );
}

function validateStoredModel(model: DomainModel) {
  if (
    model.schemaVersion !== 1 ||
    !Number.isSafeInteger(model.stateVersion) ||
    model.stateVersion < 0 ||
    !Array.isArray(model.entities) ||
    !Array.isArray(model.relationships) ||
    !Array.isArray(model.constraints)
  )
    throw new Error('Invalid stored Domain Model.');
  unique(
    model.entities.map((item) => item.id),
    'Entity identifier',
  );
  unique(
    model.entities.flatMap((item) => item.fields.map((field) => field.id)),
    'Field identifier',
  );
  unique(
    model.relationships.map((item) => item.id),
    'Relationship identifier',
  );
  unique(
    model.constraints.map((item) => item.id),
    'Constraint identifier',
  );
  const entities = new Set(model.entities.map((item) => item.id));
  const relationships = new Set(model.relationships.map((item) => item.id));
  if (
    model.relationships.some(
      (item) =>
        !entities.has(item.sourceEntityId) ||
        !entities.has(item.targetEntityId),
    ) ||
    model.constraints.some((item) =>
      item.target.kind === 'model'
        ? item.target.id !== null
        : item.target.kind === 'entity'
          ? !item.target.id || !entities.has(item.target.id)
          : !item.target.id || !relationships.has(item.target.id),
    )
  )
    throw new Error('Stored Domain Model references are invalid.');
  assertNoInheritanceCycle(model.relationships);
}

function validateCommitReceipts(receipts: StoredDomainState['committedRuns']) {
  if (
    receipts.some(
      (item) =>
        !/^RUN-[0-9a-f-]{36}$/.test(item.runId) ||
        !Number.isSafeInteger(item.stateVersion) ||
        item.stateVersion < 1 ||
        typeof item.committedAt !== 'string' ||
        !Number.isFinite(Date.parse(item.committedAt)),
    )
  )
    throw new Error('Invalid Domain Model commit receipt.');
  unique(
    receipts.map((item) => item.runId),
    'Domain Model committed Run identifier',
  );
}

function validateLastChange(
  change: DomainChange | null,
  currentStateVersion: number,
) {
  if (
    change &&
    (!['applied', 'restored'].includes(change.kind) ||
      !Number.isSafeInteger(change.stateVersion) ||
      change.stateVersion < 1 ||
      change.stateVersion > currentStateVersion ||
      typeof change.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(change.createdAt)))
  )
    throw new Error('Invalid last Domain Model change.');
}

function legacyUndoChange(model: DomainModel): DomainChange {
  return {
    kind: 'restored',
    runId: null,
    baseVersion: model.stateVersion - 1,
    stateVersion: model.stateVersion,
    instruction: 'Undo the last Domain Model change.',
    summary: 'Undid the last Domain Model change.',
    added: [],
    updated: [],
    removed: [],
    createdAt: model.updatedAt!,
  };
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
  });
  await rename(temporary, file);
}

function modelRoot(project: RegisteredProject) {
  return path.join(project.planningPath, 'domain-model');
}
function serialize<T>(project: RegisteredProject, work: () => Promise<T>) {
  const key = modelRoot(project);
  const previous = writes.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  writes.set(key, next);
  return next.finally(() => {
    if (writes.get(key) === next) writes.delete(key);
  }) as Promise<T>;
}
function text(
  value: unknown,
  maximum: number,
  label: string,
  allowEmpty = false,
) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || Buffer.byteLength(normalized) > maximum)
    throw new Error(`${label} is invalid.`);
  return normalized;
}
function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T))
    throw new Error('Invalid Domain Model value.');
  return value as T;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} must be unique.`);
}

function snapshot(model: DomainModel): DomainSnapshot {
  return {
    entities: structuredClone(model.entities),
    relationships: structuredClone(model.relationships),
    constraints: structuredClone(model.constraints),
    lastRunId: model.lastRunId,
    updatedAt: model.updatedAt,
  };
}
