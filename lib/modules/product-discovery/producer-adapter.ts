import {
  siblingCandidateIds,
  toGraphProposalCandidate,
} from '../../graph/proposal/classify.ts';
import type { ProductExplorationResult } from './contract.ts';
import type { WhatsNextHarnessResult } from './harness.ts';

export function toProductExplorationSemanticResult(
  envelope: WhatsNextHarnessResult,
): ProductExplorationResult {
  if (envelope.outcome === 'clarification')
    return { outcome: 'clarification', clarification: envelope.clarification };
  if (envelope.outcome === 'no-change')
    return { outcome: 'no-change', reason: envelope.reason };
  const siblings = siblingCandidateIds(envelope.candidates);
  return {
    outcome: 'proposal',
    candidates: envelope.candidates.map((candidate) => ({
      ...toGraphProposalCandidate(candidate, siblings),
      outputMarkdown: candidate.outputMarkdown,
      layer: candidate.layer,
      artifactKind: candidate.artifactKind,
    })),
  };
}
