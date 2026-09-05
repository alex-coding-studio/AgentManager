import { MaterializationError } from '../../materialization/receipt.ts';
import type { GraphProposalCandidate } from './contract.ts';
import type { GraphReference } from './reference.ts';

export type GraphProposalDependencyState = {
  knownNodeIds: readonly string[];
  acceptedCandidateIds: readonly string[];
  knownResourcePaths: readonly string[];
  reservedCandidateIds: readonly string[];
  currentCandidates: ReadonlyArray<{
    candidateId: string;
    dependsOn: readonly string[];
  }>;
  revisionTarget: { candidateId: string } | null;
};

export class GraphProposalValidationError extends MaterializationError {
  constructor(message: string) {
    super('validation', message);
    this.name = 'GraphProposalValidationError';
  }
}

function fail(message: string): never {
  throw new GraphProposalValidationError(message);
}

export function validateGraphProposal(
  basis: GraphProposalDependencyState,
  candidates: GraphProposalCandidate[],
) {
  const localKeys = new Set<string>();
  for (const candidate of candidates) {
    if (localKeys.has(candidate.localKey))
      fail(`Proposal key ${candidate.localKey} is declared more than once.`);
    localKeys.add(candidate.localKey);
  }
  const knownNodeIds = new Set(basis.knownNodeIds);
  const knownResourcePaths = new Set(basis.knownResourcePaths);
  const reservedCandidateIds = new Set(basis.reservedCandidateIds);
  const currentCandidateIds = new Set(
    basis.currentCandidates.map((candidate) => candidate.candidateId),
  );
  const acceptedCandidateIds = new Set(basis.acceptedCandidateIds);
  const revisionKey = basis.revisionTarget?.candidateId;

  for (const candidate of candidates) {
    if (
      reservedCandidateIds.has(candidate.localKey) &&
      candidate.localKey !== revisionKey
    ) {
      fail(`Proposal key ${candidate.localKey} is already allocated.`);
    }
    if (candidate.derivedFrom.length === 0)
      fail(`Candidate ${candidate.localKey} requires a lineage source.`);
    for (const reference of candidate.derivedFrom) {
      if (!knownNodeIds.has(reference.id))
        fail(`Candidate ${candidate.localKey} derives from an unknown Node.`);
    }
    if (
      candidate.typeTemplateRef !== null &&
      !knownNodeIds.has(candidate.typeTemplateRef.id)
    ) {
      fail(
        `Candidate ${candidate.localKey} references an unknown type template.`,
      );
    }
    for (const resource of candidate.resources) {
      if (!knownResourcePaths.has(resource.path))
        fail(`Candidate ${candidate.localKey} references an unknown Resource.`);
    }
    for (const dependency of candidate.dependsOn) {
      assertDependencyResolves(candidate.localKey, dependency, {
        knownNodeIds,
        localKeys,
        currentCandidateIds,
        acceptedCandidateIds,
      });
    }
  }

  assertAcyclic(basis, candidates);
}

function assertDependencyResolves(
  localKey: string,
  dependency: GraphReference,
  known: {
    knownNodeIds: Set<string>;
    localKeys: Set<string>;
    currentCandidateIds: Set<string>;
    acceptedCandidateIds: Set<string>;
  },
) {
  if (dependency.kind === 'node') {
    if (!known.knownNodeIds.has(dependency.id))
      fail(`Candidate ${localKey} depends on an unknown Node.`);
    return;
  }
  if (dependency.kind === 'proposal') {
    if (dependency.localKey === localKey)
      fail(`Candidate ${localKey} cannot depend on itself.`);
    if (!known.localKeys.has(dependency.localKey))
      fail(`Candidate ${localKey} depends on an unknown proposal key.`);
    return;
  }
  if (
    !known.currentCandidateIds.has(dependency.id) &&
    !known.acceptedCandidateIds.has(dependency.id)
  ) {
    fail(`Candidate ${localKey} depends on an unknown Candidate.`);
  }
}

function assertAcyclic(
  basis: GraphProposalDependencyState,
  candidates: GraphProposalCandidate[],
) {
  const edges = new Map<string, string[]>();
  for (const candidate of basis.currentCandidates) {
    edges.set(candidate.candidateId, [...candidate.dependsOn]);
  }
  for (const candidate of candidates) {
    edges.set(
      candidate.localKey,
      candidate.dependsOn.flatMap((dependency) =>
        dependency.kind === 'node'
          ? []
          : [
              dependency.kind === 'proposal'
                ? dependency.localKey
                : dependency.id,
            ],
      ),
    );
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key))
      fail('Candidate dependencies must not contain a cycle.');
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of edges.get(key) ?? []) visit(next);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of edges.keys()) visit(key);
}
