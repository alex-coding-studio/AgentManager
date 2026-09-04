import path from 'node:path';
import general from '../../responsibilities/general.json' with { type: 'json' };
import mechanical from '../../responsibilities/mechanical.json' with { type: 'json' };
import iosDevelopment from '../../responsibilities/ios-development.json' with { type: 'json' };

export type ResponsibilityRule = { id: string; instruction: string };
export type ResponsibilityDefinition = {
  id?: string;
  inherits: { id: string; path: string } | string | null;
  assignment: string;
  overrides: string[];
  rules: ResponsibilityRule[];
};

const sourceDefinitions = [general, mechanical, iosDevelopment] as const;
export type ExecutionResponsibility = (typeof sourceDefinitions)[number]['id'];

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
      (id === 'general'
        ? definition.inherits !== null
        : !definition.inherits ||
          typeof definition.inherits !== 'object' ||
          definition.inherits.id !== 'general' ||
          definition.inherits.path !== './general.json') ||
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

const definitions = Object.fromEntries(
  sourceDefinitions.map((definition) => [definition.id, definition]),
) as Record<ExecutionResponsibility, ResponsibilityDefinition>;
assertDefinitions(definitions);

export const EXECUTION_RESPONSIBILITY_LIBRARY = path.join(
  process.cwd(),
  'lib/responsibilities',
);

export const EXECUTION_RESPONSIBILITY_IDS = Object.freeze(
  Object.keys(definitions) as ExecutionResponsibility[],
);

export const EXECUTION_RESPONSIBILITY_SELECTION = `Assign responsibilities from the Worker task. General is the inherited default. ${EXECUTION_RESPONSIBILITY_IDS.map((id) => `${id}: ${definitions[id].assignment}`).join(' ')} Responsibilities compose when one packet needs multiple boundaries. Return general alone for ordinary work; do not return general beside a specialized responsibility. The Coordinator selects responsibilities; the Worker must not choose or change them.`;

export function executionResponsibilitySource(
  responsibility: ExecutionResponsibility,
) {
  return path.join(EXECUTION_RESPONSIBILITY_LIBRARY, `${responsibility}.json`);
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
  return compileResponsibilityInstructions(definitions, responsibilities);
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
