import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type ResponsibilityRule = { id: string; instruction: string };
export type ExecutionRole = 'coordinator' | 'worker' | 'reviewer';
export type ResponsibilityDefinition = {
  id?: string;
  inherits?: { id: string; path: string } | string | null;
  roles?: ExecutionRole[];
  assignment: string;
  overrides: string[];
  rules: ResponsibilityRule[];
};

export type ExecutionResponsibility = string;

function assertDefinitions(
  value: unknown,
): asserts value is Record<ExecutionResponsibility, ResponsibilityDefinition> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Execution responsibilities must be an object.');
  const entries = Object.entries(value);
  if (!entries.some(([id]) => id === 'general'))
    throw new Error('Execution responsibilities require general.');
  const generalRuleIds = new Set<string>();
  for (const [id, candidate] of entries) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      throw new Error(`Invalid execution responsibility: ${id}`);
    const definition = candidate as Partial<ResponsibilityDefinition>;
    if (
      (definition.inherits !== undefined &&
        (id === 'general'
          ? definition.inherits !== null
          : !definition.inherits ||
            typeof definition.inherits !== 'object' ||
            definition.inherits.id !== 'general' ||
            definition.inherits.path !== './general.json')) ||
      (definition.roles !== undefined &&
        (!Array.isArray(definition.roles) ||
          definition.roles.some(
            (role) => !['coordinator', 'worker', 'reviewer'].includes(role),
          ))) ||
      definition.id !== id ||
      typeof definition.assignment !== 'string' ||
      !definition.assignment.trim() ||
      !Array.isArray(definition.overrides) ||
      !Array.isArray(definition.rules) ||
      definition.rules.length === 0
    )
      throw new Error(`Invalid execution responsibility: ${id}`);
    const ruleIds = new Set<string>();
    for (const rule of definition.rules) {
      if (
        !rule ||
        typeof rule.id !== 'string' ||
        !rule.id.trim() ||
        typeof rule.instruction !== 'string' ||
        !rule.instruction.trim() ||
        ruleIds.has(rule.id)
      )
        throw new Error(`Invalid execution responsibility rule: ${id}`);
      ruleIds.add(rule.id);
      if (id === 'general') generalRuleIds.add(rule.id);
    }
  }
  for (const [id, candidate] of entries) {
    if (id === 'general') continue;
    const definition = candidate as ResponsibilityDefinition;
    if (
      new Set(definition.overrides).size !== definition.overrides.length ||
      definition.overrides.some(
        (ruleId) =>
          !generalRuleIds.has(ruleId) ||
          !definition.rules.some((rule) => rule.id === ruleId),
      )
    )
      throw new Error(`Invalid execution responsibility override: ${id}`);
  }
}

export const EXECUTION_RESPONSIBILITY_LIBRARY = path.join(
  process.cwd(),
  'lib/responsibilities',
);

export function loadExecutionResponsibilities(
  library = EXECUTION_RESPONSIBILITY_LIBRARY,
) {
  const files = readdirSync(library, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.json'))
    .sort((left, right) =>
      left.name === 'general.json'
        ? -1
        : right.name === 'general.json'
          ? 1
          : left.name.localeCompare(right.name),
    );
  const definitions: Record<string, ResponsibilityDefinition> = {};
  for (const file of files) {
    if (!file.isFile() || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file.name))
      throw new Error(`Invalid execution responsibility file: ${file.name}`);
    const id = file.name.slice(0, -'.json'.length);
    const definition = JSON.parse(
      readFileSync(path.join(library, file.name), 'utf8'),
    ) as ResponsibilityDefinition;
    if (Object.hasOwn(definitions, id))
      throw new Error(`Duplicate execution responsibility: ${id}`);
    definitions[id] = definition;
  }
  assertDefinitions(definitions);
  return definitions;
}

const definitions = loadExecutionResponsibilities();

export const EXECUTION_RESPONSIBILITY_IDS = Object.freeze(
  Object.keys(definitions).filter(
    (id) => !definitions[id].roles || definitions[id].roles!.includes('worker'),
  ),
);

export const EXECUTION_RESPONSIBILITY_SELECTION = `Agents have a Role plus composed Responsibilities. General is a shared baseline, applied once; it is not a Role or an inheritance parent. The Worker role always includes draft-publication. Select additional Worker responsibilities for the task: ${EXECUTION_RESPONSIBILITY_IDS.filter(
  (id) => id !== 'general',
)
  .map((id) => `${id}: ${definitions[id].assignment}`)
  .join(
    ' ',
  )} Legacy general alone means no additional duties. Do not assign Coordinator or Reviewer duties to a Worker. The Coordinator selects responsibilities; the Worker reports missing duties instead of changing its role.`;

export function executionRoleSource(role: ExecutionRole) {
  return path.join(process.cwd(), 'lib/roles', `${role}.json`);
}

export function executionRoleResponsibilities(
  role: ExecutionRole,
  selected: string[] = [],
) {
  const definition = JSON.parse(
    readFileSync(executionRoleSource(role), 'utf8'),
  ) as { id: string; responsibilities: string[] };
  if (definition.id !== role || !Array.isArray(definition.responsibilities))
    throw new Error('Invalid execution Role definition.');
  const responsibilities = [
    ...new Set(
      [...definition.responsibilities, ...selected].filter(
        (id) => id !== 'general',
      ),
    ),
  ];
  for (const id of responsibilities)
    if (
      !definitions[id] ||
      !(definitions[id].roles ?? ['worker']).includes(role)
    )
      throw new Error(`Responsibility ${id} is not available to Role ${role}.`);
  return responsibilities;
}

export function executionRoleInstructions(
  role: ExecutionRole,
  selected: string[] = [],
) {
  return `Role: ${role}. Responsibilities are composed, not inherited.\n${compileResponsibilityInstructions(definitions, executionRoleResponsibilities(role, selected))}`;
}

export function executionResponsibilitySource(
  responsibility: ExecutionResponsibility,
) {
  return path.join(EXECUTION_RESPONSIBILITY_LIBRARY, `${responsibility}.json`);
}

export function executionResponsibilityReference(
  responsibility: ExecutionResponsibility,
) {
  return `praxis:responsibility/${responsibility}`;
}

export function resolveExecutionResponsibilities(
  value: unknown,
): ExecutionResponsibility[] {
  const candidates = Array.isArray(value) ? value : [value];
  const responsibilities = candidates.filter(
    (item): item is ExecutionResponsibility =>
      EXECUTION_RESPONSIBILITY_IDS.includes(item as ExecutionResponsibility),
  );
  const unique = [...new Set(responsibilities)];
  const specialized = unique.filter(
    (responsibility) => responsibility !== 'general',
  );
  return specialized.length ? specialized : ['general'];
}

export function executionResponsibilityInstructions(value: unknown) {
  const responsibilities = resolveExecutionResponsibilities(value);
  return executionRoleInstructions('worker', responsibilities);
}

export function compileResponsibilityInstructions(
  source: Record<string, ResponsibilityDefinition>,
  responsibilities: string[],
) {
  const specialized = responsibilities.filter(
    (responsibility) => responsibility !== 'general',
  );
  const overrideOwners = new Map<string, string>();
  for (const responsibility of specialized) {
    for (const ruleId of source[responsibility].overrides) {
      if (overrideOwners.has(ruleId))
        throw new Error(`Conflicting responsibility override: ${ruleId}`);
      overrideOwners.set(ruleId, responsibility);
    }
  }
  const rules = [
    ...source.general.rules.filter((rule) => !overrideOwners.has(rule.id)),
    ...specialized.flatMap((responsibility) => source[responsibility].rules),
  ];
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length)
    throw new Error('Execution responsibilities contain conflicting rules.');
  return rules.map((rule) => rule.instruction).join('\n');
}
