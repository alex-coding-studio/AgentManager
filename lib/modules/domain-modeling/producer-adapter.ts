import { MaterializationError } from '../../materialization/receipt.ts';
import type { DomainModelResult } from './contract.ts';
import type { DomainModelEnvelope } from './harness.ts';

export function toDomainModelSemanticResult(
  envelope: DomainModelEnvelope,
): DomainModelResult {
  if (envelope.outcome === 'clarification')
    return {
      outcome: 'clarification',
      summary: envelope.summary,
      question: envelope.question,
    };
  if (envelope.outcome === 'no-change')
    return {
      outcome: 'no-change',
      summary: envelope.summary,
      reason: envelope.reason,
    };
  if (envelope.patch)
    return {
      outcome: 'model-change',
      summary: envelope.summary,
      change: { kind: 'patch', patch: envelope.patch },
    };
  if (envelope.model)
    return {
      outcome: 'model-change',
      summary: envelope.summary,
      change: { kind: 'model', model: envelope.model },
    };
  throw new MaterializationError(
    'validation',
    'An applied Domain Model response requires exactly one model or patch.',
  );
}
