export type AcceptanceCriterion = {
  id: string;
  criterion: string;
  passCondition: string;
  evidence: string;
};
export type AcceptanceChecklist = {
  version: string;
  items: AcceptanceCriterion[];
};
export type CheckResult = {
  criterionId?: string;
  summary: string;
  status: 'passed' | 'failed' | 'not-run';
  evidenceRefs: string[];
};
export type CheckOverride = {
  note: string;
  recordedAt: string;
  checklistVersion: string;
};

export function validateAcceptanceCriteria(
  items: AcceptanceCriterion[] | undefined,
) {
  if (!Array.isArray(items) || !items.length || items.length > 40)
    throw new Error(
      'Define the required acceptance checklist before executing or confirming the Plan.',
    );
  if (
    new Set(items.map((item) => item?.id)).size !== items.length ||
    items.some(
      (item) =>
        !item ||
        ['id', 'criterion', 'passCondition', 'evidence'].some(
          (key) =>
            typeof item[key as keyof AcceptanceCriterion] !== 'string' ||
            !item[key as keyof AcceptanceCriterion].trim(),
        ),
    )
  )
    throw new Error(
      'Acceptance criteria require unique IDs, conditions and evidence.',
    );
  return items;
}
export function splitChecks(
  checklist: AcceptanceChecklist,
  checks: CheckResult[],
  additional: CheckResult[] = [],
) {
  const ids = new Set(checklist.items.map((item) => item.id));
  const all = [...checks, ...additional];
  return {
    required: all.filter(
      (check) => check.criterionId && ids.has(check.criterionId),
    ),
    additional: all.filter(
      (check) => !check.criterionId || !ids.has(check.criterionId),
    ),
  };
}
export function assessRequiredChecks(
  checklist: AcceptanceChecklist | undefined,
  checks: CheckResult[],
  overrides: Record<string, CheckOverride> = {},
) {
  if (!checklist) return { passed: false, items: [] };
  const items = checklist.items.map((criterion) => {
    const matches = checks.filter(
      (check) => check.criterionId === criterion.id,
    );
    const override =
      overrides[criterion.id]?.checklistVersion === checklist.version
        ? overrides[criterion.id]
        : undefined;
    const observed = matches.length === 1 ? matches[0] : undefined;
    const status = override
      ? 'passed'
      : observed?.status === 'passed' && !observed.evidenceRefs.length
        ? 'not-run'
        : (observed?.status ?? 'not-run');
    return { criterion, observed, override, status };
  });
  return {
    passed: items.length > 0 && items.every((item) => item.status === 'passed'),
    items,
  };
}
