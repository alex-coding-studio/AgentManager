import { randomUUID } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import { assessRequiredChecks, type CheckResult } from './checklist.ts';
import type { AgentProfile } from '../../agents/profile.ts';
import type { CardHarnessRequest } from './harness.ts';
import type { LocalAgentUsage } from '../../agents/transport.ts';
import type { CardEnvironmentManifest } from '../../card-host-operations.ts';
import {
  EXECUTION_RESPONSIBILITY_IDS,
  EXECUTION_RESPONSIBILITY_SELECTION,
  type ExecutionResponsibility,
} from './execution-responsibilities.ts';

export type CoordinationSettings = { profile: AgentProfile };
export type PriorEvidence = {
  id: string;
  actionId: string;
  criterionId: string;
  summary: string;
  evidenceRefs: string[];
  basis: string;
};
export type VerificationPlanItem = {
  criterionId: string;
  mode:
    | 'worker'
    | 'reuse'
    | 'coordinator'
    | 'user-decision'
    | 'needs-user-decision';
  evidenceIds: string[];
  rationale: string;
};
export type CoordinationDecision = {
  version: 1;
  requestId: string;
  cardId: string;
  actionId: string;
  contextRevision: number;
  checklistVersion: string;
  decision: 'dispatch' | 'repair' | 'ready' | 'needs-user' | 'blocked';
  responsibilities: ExecutionResponsibility[];
  summary: string;
  instructions: string;
  verificationPlan: VerificationPlanItem[];
  repairAssessment?: {
    fixability: 'actionable' | 'unavailable' | 'uncertain';
    criterionIds: string[];
    cause: string;
    changedApproach: string;
    expectedEvidence: string;
  };
  checks: CheckResult[];
  artifactRefs: string[];
  additionalFindings: Array<
    CheckResult & { resolved: boolean; needsAttention: boolean }
  >;
  scopeNotes: string[];
  contextSummary: string;
};
export type CoordinationAttempt = {
  id: string;
  role: 'coordinator' | 'worker';
  phase: 'prepare' | 'execute' | 'qualify' | 'repair';
  startedAt: string;
  endedAt: string | null;
  profile: AgentProfile;
  sessionId: string | null;
  usage: LocalAgentUsage | null;
  summary: string;
  error?: string;
};
export type CoordinationTrace = {
  profile: AgentProfile;
  attempts: CoordinationAttempt[];
  decisions: CoordinationDecision[];
  contextSummary: string;
  logRef?: string;
};
export type CoordinationRequest = {
  version: 1;
  requestId: string;
  phase: 'prepare' | 'qualify';
  task: CardHarnessRequest;
  basis: string;
  priorEvidence: PriorEvidence[];
  previousContext: string;
  workerReport: {
    outcome?: 'delivered' | 'blocked' | 'error';
    checks: CheckResult[];
    artifactRefs: string[];
    summary: string;
    additionalChecks?: CheckResult[];
    remaining?: string[];
    scopeNotes?: string[];
  } | null;
  previousDecision: CoordinationDecision | null;
  repairsRemaining: number;
  environment?: CardEnvironmentManifest;
};

const text = { type: 'string', minLength: 1, maxLength: 8000, pattern: '\\S' };
const strings = { type: 'array', maxItems: 80, items: text };
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const checkProperties = {
  criterionId: { type: 'string' },
  summary: text,
  status: { enum: ['passed', 'failed', 'not-run'] },
  evidenceRefs: strings,
};
export const coordinationSchema = object({
  version: { const: 1 },
  requestId: text,
  cardId: text,
  actionId: text,
  contextRevision: { type: 'integer' },
  checklistVersion: text,
  decision: { enum: ['dispatch', 'repair', 'ready', 'needs-user', 'blocked'] },
  responsibilities: {
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: { enum: EXECUTION_RESPONSIBILITY_IDS },
  },
  summary: text,
  instructions: { type: 'string', maxLength: 16000 },
  verificationPlan: {
    type: 'array',
    maxItems: 40,
    items: object({
      criterionId: text,
      mode: {
        enum: [
          'worker',
          'reuse',
          'coordinator',
          'user-decision',
          'needs-user-decision',
        ],
      },
      evidenceIds: strings,
      rationale: text,
    }),
  },
  checks: { type: 'array', maxItems: 40, items: object(checkProperties) },
  artifactRefs: strings,
  additionalFindings: {
    type: 'array',
    maxItems: 30,
    items: object({
      ...checkProperties,
      resolved: { type: 'boolean' },
      needsAttention: { type: 'boolean' },
    }),
  },
  scopeNotes: strings,
  contextSummary: { type: 'string', maxLength: 6000 },
});
Object.assign(coordinationSchema.properties, {
  repairAssessment: object({
    fixability: { enum: ['actionable', 'unavailable', 'uncertain'] },
    criterionIds: {
      type: 'array',
      minItems: 1,
      maxItems: 40,
      uniqueItems: true,
      items: text,
    },
    cause: text,
    changedApproach: text,
    expectedEvidence: text,
  }),
});
const validate = new Ajv2020({ allErrors: true }).compile(coordinationSchema);

export function coordinationPrompt(request: CoordinationRequest) {
  const { task, priorEvidence, ...dynamic } = request;
  return `You are the read-only coordination Agent for one Action in a larger confirmed Plan. Own task continuity, bounded dispatch and recovery of unresolved work. You are not the code or product Reviewer. The execution Agent owns implementation and self-check results; the host sends you a qualification request only when required items are failed, not-run or contradicted by machine-observed facts. Trust passed worker self-checks and do not inspect their implementation or test coverage. Do not implement code, run broad builds/tests, create or modify PRs, merge, accept Actions, alter host records, or start another Agent yourself. The host dispatches workers from your structured result. The optional environment field is a Host-verified Environment Manifest. Treat its workspace, branch, base/head, repository, author and role facts as authoritative; do not spend Agent calls rediscovering them or ask the Worker to repeat those checks unless it reports a concrete contradiction. Read only references needed for the current delta or unresolved items. Use previous context as a navigation aid, not authority over current facts. Never add required criteria. The user's current input may clarify the task; honor clear simulator-only scope when applicable, but do not fabricate human observations or invent user waivers. If an explicit decision needs recording and is not in acceptanceOverrides, return needs-user with that exact decision, mark its verificationPlan mode needs-user-decision and keep the observed check not-run.\n\nDuring prepare, first form a concise, high-level understanding of the task from the packet summary and hard requirements. Then create the Worker assignment and choose at least one responsibility. The frozen Action, checklist, Environment Manifest and relevant Skill summary define the task. Read only the applicable SKILL.md entrypoint; do not open its references, scripts, broad Memory, worklogs, repository history or unrelated Skills. If that entrypoint or the packet assigns the result to a script or repository entrypoint, add mechanical and name the applicable Skill in the assignment. The Worker rereads that SKILL.md and follows its reference routing for the documented command and inputs. Treat that tool as the black-box execution and error boundary: do not request a separate preflight, inspect its implementation, expand its internal commands, audit generated files, or recheck a successful run. Add ios-development for iOS product-code work. Combine mechanical and ios-development when one packet needs both; general remains the inherited default. After dispatch, suspend completely: do not poll, inspect implementation, plan repairs, or consume more context until the Host supplies an explicit Worker result. If the Worker reports that its assigned roles cannot complete part of the packet, reassess only that gap after the result arrives; a repair may replace a responsibility or append another specialized responsibility while the finalized Action, packet, checklist and acceptance criteria remain unchanged. Its changedApproach must explain how the added role boundary enables the same work. The Worker never expands its own roles.\n\n${EXECUTION_RESPONSIBILITY_SELECTION}\n\nReturn dispatch (prepare only) or repair (qualify only) for necessary bounded work. A normal prepare instruction names the exact delta or command, output boundary and genuine stop condition without copying Skill text, checklist prose or resource history. On qualify, preserve every passed worker check unchanged and investigate only failed/not-run checks supplied by the host. Before repair, diagnose whether an authorized worker action can change the result. Include repairAssessment with fixability, affected unresolved criterionIds, evidence-grounded cause, changedApproach and expectedEvidence. Repeating the same commands without a changed condition is not a repair plan. Missing capability/permission outside the assignment is unavailable; unknown causality is uncertain. Do not repeat valid checks solely to replay a checklist. A tool or host that does not support .app inspection cannot be fixed by repeating the inspection or expanding this Action to implement host support. Return ready without a worker during preparation only when existing valid evidence suffices. For every required criterion supply a verificationPlan item; passed worker criteria remain worker mode. Reuse requires matching basis and source evidence. Existing required repository hooks cannot be bypassed.\n\nOn needs-user/blocked, include one checks entry per required criterion, copying trusted passed items without reinterpretation. Do not change a failed required check into passed without correction or an explicit recorded override. Never silently waive one. Classify additional findings only when the host asks you to triage unresolved diagnostics. Unsupported diagnostic capabilities are not failed builds, tests or required criteria. Do not dispatch repair solely for additional diagnostics. No extra Remaining work checklist.\n\nUse the user's language for summaries. Keep contextSummary short: current facts, applicable verified lessons, unresolved constraints and next-step guidance with evidence pointers. Return only JSON matching this schema: ${JSON.stringify(coordinationSchema)}\n\nCOORDINATION REQUEST:\n${JSON.stringify({ task, priorEvidence, ...dynamic })}`;
}

export function createCoordinationRequest(
  input: Omit<CoordinationRequest, 'version' | 'requestId'>,
): CoordinationRequest {
  return { version: 1, requestId: randomUUID(), ...input };
}

export function parseCoordinationDecision(
  raw: string,
  request: CoordinationRequest,
): CoordinationDecision {
  if (Buffer.byteLength(raw) > 200000)
    throw new Error('Coordinator response exceeds the limit.');
  const value: CoordinationDecision = JSON.parse(raw);
  if (!validate(value))
    throw new Error('Coordinator response does not match its contract.');
  if (
    value.responsibilities.length > 1 &&
    value.responsibilities.includes('general')
  )
    throw new Error(
      'General is inherited and cannot be combined explicitly with specialized responsibilities.',
    );
  const checklist = request.task.context.acceptanceChecklist!;
  if (
    value.requestId !== request.requestId ||
    value.cardId !== request.task.context.cardId ||
    value.actionId !== request.task.actionId ||
    value.contextRevision !== request.task.context.contextRevision ||
    value.checklistVersion !== checklist.version
  )
    throw new Error(
      'Coordinator response belongs to another task or revision.',
    );
  if (
    (request.phase === 'prepare' && value.decision === 'repair') ||
    (request.phase === 'qualify' && value.decision === 'dispatch')
  )
    throw new Error('Coordinator decision does not match the current phase.');
  const ids = checklist.items.map((item) => item.id);
  const planIds = value.verificationPlan.map((item) => item.criterionId);
  if (
    new Set(planIds).size !== ids.length ||
    planIds.length !== ids.length ||
    planIds.some((id) => !ids.includes(id))
  )
    throw new Error(
      'Coordinator verification plan must cover the exact required criteria.',
    );
  for (const item of value.verificationPlan) {
    if (
      item.mode === 'needs-user-decision' &&
      (value.decision !== 'needs-user' ||
        !request.task.userInput.trim() ||
        value.checks.find((check) => check.criterionId === item.criterionId)
          ?.status !== 'not-run')
    )
      throw new Error(
        'A proposed user decision requires a needs-user result and source input.',
      );
    if (item.mode === 'reuse') {
      if (
        !item.evidenceIds.length ||
        item.evidenceIds.some(
          (id) =>
            !request.priorEvidence.some(
              (e) => e.id === id && e.basis === request.basis,
            ),
        )
      )
        throw new Error(
          'Coordinator attempted to reuse stale or unknown evidence.',
        );
    }
    if (
      item.mode === 'user-decision' &&
      request.task.context.acceptanceOverrides?.[item.criterionId]
        ?.checklistVersion !== checklist.version
    )
      throw new Error('Coordinator cannot invent a user decision.');
  }
  if (value.decision === 'dispatch' || value.decision === 'repair') {
    if (!value.instructions.trim())
      throw new Error('Worker dispatch requires concrete instructions.');
    if (value.decision === 'repair') {
      if (request.repairsRemaining < 1)
        throw new Error('Coordinator repair budget exhausted.');
      const assessment = value.repairAssessment;
      if (!assessment || assessment.fixability !== 'actionable')
        throw new Error(
          'Repair requires an actionable diagnosis and changed approach.',
        );
      const gaps = assessRequiredChecks(
        checklist,
        request.workerReport?.checks ?? [],
        request.task.context.acceptanceOverrides,
      )
        .items.filter((item) => item.status !== 'passed')
        .map((item) => item.criterion.id);
      if (assessment.criterionIds.some((id) => !gaps.includes(id)))
        throw new Error(
          'Repair must target an unmet required criterion, not additional diagnostics.',
        );
    }
    return value;
  }
  const checkIds = value.checks.map((check) => check.criterionId);
  if (
    checkIds.length !== ids.length ||
    new Set(checkIds).size !== ids.length ||
    checkIds.some((id) => !id || !ids.includes(id))
  )
    throw new Error(
      'Coordinator result must cover every required criterion exactly once.',
    );
  for (const observed of request.workerReport?.checks ?? []) {
    if (
      observed.status === 'passed' &&
      value.checks.find((check) => check.criterionId === observed.criterionId)
        ?.status !== 'passed'
    )
      throw new Error(
        'Coordinator cannot reinterpret a passed worker self-check.',
      );
  }
  if (value.decision === 'ready') {
    if (
      !assessRequiredChecks(
        checklist,
        value.checks,
        request.task.context.acceptanceOverrides,
      ).passed
    )
      throw new Error(
        'Coordinator ready verdict has incomplete required checks.',
      );
    for (const item of value.verificationPlan) {
      const observed = request.workerReport?.checks.find(
        (check) => check.criterionId === item.criterionId,
      );
      if (
        observed?.status === 'failed' &&
        request.task.context.acceptanceOverrides?.[item.criterionId]
          ?.checklistVersion !== checklist.version
      )
        throw new Error(
          'A current required failure cannot be replaced by older evidence.',
        );
      if (
        item.mode === 'worker' &&
        observed?.status !== 'passed' &&
        request.task.context.acceptanceOverrides?.[item.criterionId]
          ?.checklistVersion !== checklist.version
      )
        throw new Error(
          'Coordinator cannot declare an unpassed worker check complete.',
        );
      if (
        observed &&
        observed.status !== 'passed' &&
        item.mode === 'coordinator' &&
        request.task.context.acceptanceOverrides?.[item.criterionId]
          ?.checklistVersion !== checklist.version
      )
        throw new Error(
          'A worker failure requires correction, valid evidence reuse or a user decision.',
        );
    }
  }
  return value;
}
