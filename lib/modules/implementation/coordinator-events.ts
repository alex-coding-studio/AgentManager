import type { CardHarnessResult } from './harness.ts';
import {
  coordinationSchema,
  type CoordinationDecision,
  type CoordinationRequest,
} from './coordination.ts';

export type ExecutionReport = Extract<
  CardHarnessResult,
  { stage: 'execution' }
>;
export type WorkerSettlement =
  | { kind: 'completed'; report: ExecutionReport }
  | { kind: 'attention-required'; report: ExecutionReport }
  | { kind: 'failed'; reason: string };
export type WorkerSettlementEvent =
  | 'WORKER_COMPLETED'
  | 'WORKER_ATTENTION_REQUIRED'
  | 'WORKER_FAILED';

export const dispatchWorkerToolName = 'dispatch_worker';
export const dispatchWorkerTool = {
  name: dispatchWorkerToolName,
  description:
    'Dispatch or continue one bounded worker assignment through the Host. Pass your complete JSON coordination decision (decision dispatch, extend or repair) as the decision argument. The Host validates it, starts or resumes the worker, suspends this coordination turn and resumes this same thread with a WORKER_COMPLETED, WORKER_ATTENTION_REQUIRED or WORKER_FAILED event once the worker settles. Never poll, wait or start another agent yourself.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision'],
    properties: { decision: { type: 'object' } },
  },
};
export const coordinatorThreadInstructions =
  'You are the read-only coordination Agent for one Action. When your decision is dispatch, extend or repair, call the Host dispatch_worker tool with the complete JSON decision instead of returning it; the Host suspends this turn and resumes this thread when the worker settles. Return the JSON decision directly only for ready, needs-user or blocked. Do not create, delegate to, poll or wait for other agents yourself.';

export function classifyWorkerSettlement(
  report: ExecutionReport,
): WorkerSettlement {
  return report.outcome === 'delivered'
    ? { kind: 'completed', report }
    : { kind: 'attention-required', report };
}

export function workerSettlementEvent(
  settlement: WorkerSettlement,
): WorkerSettlementEvent {
  return settlement.kind === 'completed'
    ? 'WORKER_COMPLETED'
    : settlement.kind === 'attention-required'
      ? 'WORKER_ATTENTION_REQUIRED'
      : 'WORKER_FAILED';
}

export function allowedDecisionsAfter(
  settlement: WorkerSettlement,
  repairsRemaining: number,
): Array<CoordinationDecision['decision']> {
  const terminal: Array<CoordinationDecision['decision']> = [
    'ready',
    'needs-user',
    'blocked',
  ];
  if (settlement.kind === 'failed') return ['needs-user', 'blocked'];
  if (settlement.report.responsibilityGap?.trim())
    return ['extend', ...terminal];
  return repairsRemaining > 0 ? ['repair', ...terminal] : terminal;
}

export function workerSettlementPrompt(
  settlement: WorkerSettlement,
  request: CoordinationRequest,
  allowed: Array<CoordinationDecision['decision']>,
) {
  const event = workerSettlementEvent(settlement);
  const { task: _task, priorEvidence: _evidence, ...dynamic } = request;
  const guidance =
    settlement.kind === 'failed'
      ? `The worker did not return a valid execution report: ${settlement.reason}. The Host performs no automatic full-task replay. Return needs-user or blocked with one checks entry per required criterion, marking unverified items not-run.`
      : settlement.kind === 'attention-required'
        ? settlement.report.responsibilityGap?.trim()
          ? `The worker stopped at its assigned responsibility boundary. If one available responsibility or Skill closes that exact gap, extend the assignment without consuming repair; otherwise return needs-user or blocked.`
          : `The worker stopped with outcome ${settlement.report.outcome} and needs attention. Arrange actionable technical recovery within the current authorization. If every required check passed but publication or branch delivery is incomplete, use repair with an empty repairAssessment.criterionIds list and a concrete delivery-only approach; preserve existing evidence and do not invent a failed criterion. Routine GitHub synchronization, publication and unambiguous conflict resolution are technical work, not user decisions. Return needs-user only for an actual missing product choice, destructive tradeoff or external access. An unresolved technical failure alone is not a request for user authorization.`
        : 'The Worker has handed off its result. Preserve passed checks and verify the current assignment was addressed. For GitHub delivery, use finalize_delivery to verify the exact Draft HEAD and complete Ready, then return ready. If checks failed or were contradicted, arrange bounded repair. Worker completion alone is not Action Delivered.';
  return `${event}\n${JSON.stringify({ ...dynamic, settlement: settlement.kind, allowedDecisions: allowed })}\n${guidance} The Host resumed this coordination thread; the task, plan, checklist and prior evidence you already received are unchanged. Return only JSON matching the coordination schema with requestId ${request.requestId} and phase-appropriate decision from ${JSON.stringify(allowed)}. To dispatch, extend or repair Worker execution, call ${dispatchWorkerToolName} with the complete JSON decision as its decision argument instead of returning it. Schema: ${JSON.stringify(coordinationSchema)}`;
}
