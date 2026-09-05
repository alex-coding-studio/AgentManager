import {
  classifyGraphReference,
  siblingCandidateIds,
  toGraphProposalCandidate,
} from '../../graph/proposal/classify.ts';
import { MaterializationError } from '../../materialization/receipt.ts';
import type {
  CandidateReference,
  ProposalReference,
} from '../../graph/proposal/reference.ts';
import type {
  ScopeDecompositionRecomposeEffect,
  ScopeDecompositionResult,
} from './contract.ts';
import type { TaskDecompositionHarnessResult } from './harness.ts';

function candidateOrProposalReference(
  value: string,
  siblings: ReadonlySet<string>,
): CandidateReference | ProposalReference {
  const reference = classifyGraphReference(value, siblings);
  if (reference.kind === 'node')
    throw new MaterializationError(
      'validation',
      `Recompose effect ${value} must reference a Candidate.`,
    );
  return reference;
}

function selectedCandidateReference(value: string): CandidateReference {
  if (!value.startsWith('CANDIDATE-'))
    throw new MaterializationError(
      'validation',
      `Recompose effect ${value} must reference a Candidate.`,
    );
  return { kind: 'candidate', id: value };
}

export function toScopeDecompositionSemanticResult(
  envelope: TaskDecompositionHarnessResult,
): ScopeDecompositionResult {
  if (envelope.outcome === 'clarification')
    return { outcome: 'clarification', clarification: envelope.clarification };
  if (envelope.outcome === 'insufficient-evidence')
    return {
      outcome: 'insufficient-evidence',
      missingEvidence: envelope.missingEvidence,
    };
  if (envelope.outcome === 'no-change')
    return { outcome: 'no-change', reason: envelope.reason };
  const siblings = siblingCandidateIds(envelope.candidates);
  const candidates = envelope.candidates.map((candidate) =>
    toGraphProposalCandidate(candidate, siblings),
  );
  if (!envelope.recomposition) return { outcome: 'proposal', candidates };
  const effects: ScopeDecompositionRecomposeEffect[] =
    envelope.recomposition.effects.map((effect) => ({
      kind: effect.kind,
      from: effect.from.map(selectedCandidateReference),
      to: effect.to.map((value) =>
        candidateOrProposalReference(value, siblings),
      ),
    }));
  return { outcome: 'proposal', candidates, recomposition: { effects } };
}
