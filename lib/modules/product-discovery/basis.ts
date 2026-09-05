import type { TaskGraphNode } from '../../graph/task/nodes.ts';
import type {
  ProductExplorationBasisRecord,
  ProductExplorationCandidateInput,
  ProductExplorationRequestIdentity,
} from './contract.ts';

export type ProductExplorationBasis = {
  request: ProductExplorationRequestIdentity;
  operation?: ProductExplorationBasisRecord['operation'];
  revisionCandidateId?: string;
  revisionTarget?: ProductExplorationCandidateInput;
  knownNodeIds: string[];
  knownResourcePaths: string[];
  previousCandidateRevisions?: Readonly<Record<string, number>>;
  intention?: ProductExplorationBasisRecord['intention'];
  motion?: ProductExplorationBasisRecord['motion'];
  productSourceNodeId?: string;
  reservedCandidateIds: string[];
  acceptedCandidateIds: string[];
  knownCandidates: Array<
    Pick<ProductExplorationCandidateInput, 'candidateId' | 'dependsOn'>
  >;
};

export type ProductExplorationBasisInput = {
  record: ProductExplorationBasisRecord;
  nodes: TaskGraphNode[];
  knownResourcePaths: string[];
  reservedCandidateIds: string[];
  knownCandidates: Array<
    Pick<ProductExplorationCandidateInput, 'candidateId' | 'dependsOn'>
  >;
  revisionTarget?: ProductExplorationCandidateInput;
};

export function prepareProductExplorationBasis(
  input: ProductExplorationBasisInput,
): ProductExplorationBasis {
  const { record, nodes, revisionTarget } = input;
  return {
    request: {
      sessionId: record.sessionId,
      requestId: record.requestId,
      inputFingerprint: record.inputFingerprint,
    },
    operation: record.operation,
    revisionCandidateId: revisionTarget?.candidateId,
    revisionTarget,
    knownNodeIds: nodes.map((node) => node.id),
    knownResourcePaths: input.knownResourcePaths,
    acceptedCandidateIds: nodes.flatMap((node) =>
      node.provenance?.candidateId ? [node.provenance.candidateId] : [],
    ),
    previousCandidateRevisions: revisionTarget
      ? { [revisionTarget.candidateId]: revisionTarget.revision }
      : undefined,
    reservedCandidateIds: input.reservedCandidateIds,
    knownCandidates: input.knownCandidates,
    intention: record.intention,
    motion: record.motion,
    productSourceNodeId:
      record.intention === 'product-design-completion'
        ? record.sourceNodeIds[0]
        : undefined,
  };
}
