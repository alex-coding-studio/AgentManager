import type { MaterializationBasisCore } from '../../materialization/basis.ts';
import { contractIdentity } from '../../materialization/contract.ts';
import {
  graphProposalBasisFingerprint,
  type GraphProposalBasis,
  type GraphProposalCurrentCandidate,
} from '../../graph/proposal/basis.ts';
import type { GraphProposalRevision } from '../../graph/proposal/contract.ts';
import { identitiesFingerprint } from '../../graph/identity-store.ts';
import { MaterializationError } from '../../materialization/receipt.ts';
import {
  PRODUCT_EXPLORATION_RESULT_CONTRACT,
  type ProductExplorationCandidate,
} from './contract.ts';
import type { WhatsNextIntention, WhatsNextMotion } from './intention.ts';
import type { RegisteredProject } from '../../project-registry.ts';

export type ProductExplorationOperation = 'explore' | 'refine-candidate';

type GraphProposalState = Omit<
  GraphProposalBasis,
  keyof MaterializationBasisCore
>;

export type ProductExplorationMaterializationBasis = MaterializationBasisCore &
  GraphProposalState & {
    operation: ProductExplorationOperation;
    intention: WhatsNextIntention;
    motion: WhatsNextMotion;
    productSourceNodeId: string | null;
    revisionSource: ProductExplorationCandidate | null;
  };

type ProductExplorationBasisSubject = {
  intention: WhatsNextIntention;
  motion: WhatsNextMotion;
  sourceNodeIds: readonly string[];
  knownNodeIds: readonly string[];
  acceptedCandidateIds: readonly string[];
  knownResourcePaths: readonly string[];
  reservedCandidateIds: readonly string[];
  currentCandidates: readonly GraphProposalCurrentCandidate[];
};

export type ProductExplorationBasisInput = ProductExplorationBasisSubject &
  (
    | { operation: 'explore'; revisionTarget?: never; revisionSource?: never }
    | {
        operation: 'refine-candidate';
        revisionTarget: GraphProposalRevision;
        revisionSource: ProductExplorationCandidate;
      }
  );

function frozenState(
  input: ProductExplorationBasisInput,
  identityFingerprint: string,
): GraphProposalState {
  return {
    scope: 'whats-next',
    knownNodeIds: [...input.knownNodeIds],
    acceptedCandidateIds: [...input.acceptedCandidateIds],
    knownResourcePaths: [...input.knownResourcePaths],
    reservedCandidateIds: [...input.reservedCandidateIds],
    currentCandidates: input.currentCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      revision: candidate.revision,
      dependsOn: [...candidate.dependsOn],
    })),
    revisionTarget: input.revisionTarget ? { ...input.revisionTarget } : null,
    identityFingerprint,
  };
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    return Object.freeze(value);
  }
  return value;
}

export async function prepareProductExplorationMaterializationBasis(
  project: RegisteredProject,
  input: ProductExplorationBasisInput,
  now: () => string = () => new Date().toISOString(),
): Promise<ProductExplorationMaterializationBasis> {
  if (
    input.operation === 'refine-candidate' &&
    input.revisionSource.localKey !== input.revisionTarget.candidateId
  ) {
    throw new MaterializationError(
      'validation',
      'A refine basis must carry the Candidate it is revising.',
    );
  }
  const identityFingerprint = await identitiesFingerprint(
    project.planningPath,
    'whats-next',
  );
  const state = frozenState(input, identityFingerprint);
  const basis: ProductExplorationMaterializationBasis = {
    ...state,
    project: { id: project.id, planningPath: project.planningPath },
    module: 'whats-next',
    operation: input.operation,
    contract: contractIdentity(PRODUCT_EXPLORATION_RESULT_CONTRACT),
    fingerprint: graphProposalBasisFingerprint(state),
    preparedAt: now(),
    intention: input.intention,
    motion: input.motion,
    productSourceNodeId:
      input.intention === 'product-design-completion'
        ? (input.sourceNodeIds[0] ?? null)
        : null,
    revisionSource: input.revisionSource
      ? structuredClone(input.revisionSource)
      : null,
  };
  return deepFreeze(basis);
}
