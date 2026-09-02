import type { CardHarnessResult } from './just-do-it-harness.ts';
import {
  coordinationSchema,
  type CoordinationDecision,
  type CoordinationRequest,
} from './just-do-it-coordination.ts';

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
    'Dispatch one bounded worker assignment through the Host. Pass your complete JSON coordination decision (decision dispatch or repair) as the decision argument. The Host validates it, starts the worker, suspends this coordination turn and resumes this same thread with a WORKER_COMPLETED, WORKER_ATTENTION_REQUIRED or WORKER_FAILED event once the worker settles. Never poll, wait or start another agent yourself.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision'],
    properties: { decision: { type: 'object' } },
  },
};
export const coordinatorThreadInstructions =
  'You are the read-only coordination Agent for one Action. When your decision is dispatch or repair, call the Host dispatch_worker tool with the complete JSON decision instead of returning it; the Host suspends this turn and resumes this thread when the worker settles. Return the JSON decision directly only for ready, needs-user or blocked. Do not create, delegate to, poll or wait for other agents yourself.';

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
        ? `The worker stopped with outcome ${settlement.report.outcome} and needs attention. Decide whether an authorized, actionable worker repair can change the result; otherwise return needs-user with the exact decision or blocked with the specific blocker.`
        : 'The worker delivered, but required items are failed, not-run or contradicted by machine-observed evidence. Preserve every passed worker check unchanged and resolve only the unresolved items.';
  return `${event}\n${JSON.stringify({ ...dynamic, settlement: settlement.kind, allowedDecisions: allowed })}\n${guidance} The Host resumed this coordination thread; the task, plan, checklist and prior evidence you already received are unchanged. Return only JSON matching the coordination schema with requestId ${request.requestId} and phase-appropriate decision from ${JSON.stringify(allowed)}. To dispatch a repair, call ${dispatchWorkerToolName} with the complete JSON decision as its decision argument instead of returning it. Schema: ${JSON.stringify(coordinationSchema)}`;
}
