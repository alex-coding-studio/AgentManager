import { MaterializationError } from '../../materialization/receipt.ts';
import type {
  GraphCandidateInput,
  GraphProposalCandidate,
} from './contract.ts';
import type { GraphReference, NodeReference } from './reference.ts';

export function nodeReference(id: string): NodeReference {
  if (!id.startsWith('NODE-'))
    throw new MaterializationError(
      'validation',
      `${id} is not a formal Node identifier.`,
    );
  return { kind: 'node', id };
}

export function classifyGraphReference(
  value: string,
  siblingCandidateIds: ReadonlySet<string>,
): GraphReference {
  if (siblingCandidateIds.has(value))
    return { kind: 'proposal', localKey: value };
  if (value.startsWith('NODE-')) return { kind: 'node', id: value };
  if (value.startsWith('CANDIDATE-')) return { kind: 'candidate', id: value };
  throw new MaterializationError(
    'validation',
    `${value} is neither a Node nor a Candidate identifier.`,
  );
}

export function toGraphProposalCandidate(
  candidate: GraphCandidateInput,
  siblingCandidateIds: ReadonlySet<string>,
): GraphProposalCandidate {
  return {
    localKey: candidate.candidateId,
    type: candidate.type,
    title: candidate.title,
    summary: candidate.summary,
    derivedFrom: candidate.derivedFrom.map(nodeReference),
    dependsOn: candidate.dependsOn.map((reference) =>
      classifyGraphReference(reference, siblingCandidateIds),
    ),
    resources: candidate.resources.map((resource) => ({ ...resource })),
    typeTemplateRef:
      candidate.typeTemplateRef === null
        ? null
        : nodeReference(candidate.typeTemplateRef),
    metadata: candidate.metadata,
    presentation: candidate.presentation,
    assumptions: candidate.assumptions,
  };
}

export function siblingCandidateIds(
  candidates: ReadonlyArray<{ candidateId: string }>,
) {
  return new Set(candidates.map((candidate) => candidate.candidateId));
}
