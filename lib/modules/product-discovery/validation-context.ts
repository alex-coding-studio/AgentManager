import type { TaskGraphNode } from '../../graph/task/nodes.ts';
import type {
  WhatsNextCandidate,
  WhatsNextValidationContext,
} from './harness.ts';

export type WhatsNextValidationContextRecord = {
  sessionId: string;
  requestId: string;
  inputFingerprint: string;
  operation: WhatsNextValidationContext['operation'];
  intention: WhatsNextValidationContext['intention'];
  motion: WhatsNextValidationContext['motion'];
  sourceNodeIds: string[];
};

export type WhatsNextValidationContextInput = {
  record: WhatsNextValidationContextRecord;
  nodes: TaskGraphNode[];
  knownResourcePaths: string[];
  reservedCandidateIds: string[];
  knownCandidates: Array<Pick<WhatsNextCandidate, 'candidateId' | 'dependsOn'>>;
  revisionTarget?: WhatsNextCandidate;
};

export function whatsNextValidationContext(
  input: WhatsNextValidationContextInput,
): WhatsNextValidationContext {
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
