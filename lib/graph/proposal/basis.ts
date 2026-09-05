import type { MaterializationBasisCore } from '../../materialization/basis.ts';
import { semanticResultHash } from '../../materialization/hash.ts';
import type { GraphProposalRevision } from './contract.ts';

export type GraphProposalScope = 'task-graph' | 'whats-next';

export type GraphProposalCurrentCandidate = {
  candidateId: string;
  revision: number;
  dependsOn: string[];
};

export type GraphProposalBasis = MaterializationBasisCore & {
  scope: GraphProposalScope;
  knownNodeIds: string[];
  acceptedCandidateIds: string[];
  knownResourcePaths: string[];
  reservedCandidateIds: string[];
  currentCandidates: GraphProposalCurrentCandidate[];
  revisionTarget: GraphProposalRevision | null;
  identityFingerprint: string;
};

export function graphProposalBasisFingerprint(
  input: Omit<GraphProposalBasis, keyof MaterializationBasisCore>,
) {
  return semanticResultHash({
    scope: input.scope,
    knownNodeIds: [...input.knownNodeIds].sort(),
    acceptedCandidateIds: [...input.acceptedCandidateIds].sort(),
    knownResourcePaths: [...input.knownResourcePaths].sort(),
    reservedCandidateIds: [...input.reservedCandidateIds].sort(),
    currentCandidates: [...input.currentCandidates]
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        revision: candidate.revision,
        dependsOn: [...candidate.dependsOn].sort(),
      }))
      .sort((left, right) =>
        left.candidateId.localeCompare(right.candidateId, 'en'),
      ),
    revisionTarget: input.revisionTarget,
    identityFingerprint: input.identityFingerprint,
  });
}
