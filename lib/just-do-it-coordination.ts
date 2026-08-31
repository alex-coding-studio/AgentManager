import { randomUUID } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  assessRequiredChecks,
  type CheckResult,
} from './just-do-it-checklist.ts';
import type { AgentProfile } from './agent-profile.ts';
import type { CardHarnessRequest } from './just-do-it-harness.ts';
import type { LocalAgentUsage } from './local-agent-transport.ts';

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
  summary: string;
  instructions: string;
  verificationPlan: VerificationPlanItem[];
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
    checks: CheckResult[];
    artifactRefs: string[];
    summary: string;
    additionalChecks?: CheckResult[];
  } | null;
  previousDecision: CoordinationDecision | null;
  repairsRemaining: number;
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
const validate = new Ajv2020({ allErrors: true }).compile(coordinationSchema);

export function coordinationPrompt(request: CoordinationRequest) {
  const { task, priorEvidence, ...dynamic } = request;
  return `You are the read-only coordination Agent for one Action in a larger confirmed Plan. Own task continuity, bounded dispatch and result qualification. Do not implement code, run broad builds/tests, create or modify PRs, merge, accept Actions, alter host records, or start another Agent yourself. The host dispatches workers from your structured result. Read only the relevant referenced evidence and logs. Use the previous context as a navigation aid, not authority over current facts. Never add required criteria. The user's current input may clarify the task; honor clear simulator-only scope when applicable, but do not fabricate human observations or invent user waivers. If an explicit decision needs recording and is not in acceptanceOverrides, return needs-user with that exact decision, mark its verificationPlan mode needs-user-decision and keep the observed check not-run; the UI can ask the user to confirm that interpretation without dispatching coding work.\n\nReturn dispatch (prepare only) or repair (qualify only) only for necessary bounded work; instructions must state the delta, non-goals, applicable prior lessons, verification order and stop conditions. Do not repeat valid checks solely to replay a whole checklist. Return ready without a worker when read-only reference inspection or existing valid evidence suffices. For every required criterion supply a verificationPlan item: worker for work requiring execution, reuse with priorEvidence IDs and applicability rationale, coordinator for lightweight read-only inspection, or user-decision for an already recorded override. Reuse requires matching basis and source evidence. If inputs changed, rerun affected work. Existing required repository hooks cannot be bypassed.\n\nOn ready/needs-user/blocked, include one checks entry per required criterion. Ready requires every criterion passed with evidence or an existing explicit user override. Do not change a worker's current failed required check into passed without correction or an explicit recorded override. Older passing evidence cannot erase a current failure. Never silently waive one. Additional findings must indicate resolved and needsAttention; only unresolved decision-relevant findings are displayed. Resolved failures and future scope remain historical context, not acceptance blockers. No extra Remaining work checklist. Preserve honest observed failures.\n\nUse the user's language for summaries. Keep contextSummary short: current facts, applicable verified lessons, remaining constraints and next-step guidance with evidence pointers. Return only JSON matching this schema: ${JSON.stringify(coordinationSchema)}\n\nCOORDINATION REQUEST:\n${JSON.stringify({ task, priorEvidence, ...dynamic })}`;
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
    if (value.decision === 'repair' && request.repairsRemaining < 1)
      throw new Error('Coordinator repair budget exhausted.');
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
