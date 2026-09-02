import { PublicApiError } from './api-errors.ts';

export type AcceptedDependencyNode = {
  id: string;
  provenance?: { candidateId: string };
};

export function resolveCandidateDependencies(
  candidateId: string,
  dependencyIds: string[],
  nodes: AcceptedDependencyNode[],
) {
  return dependencyIds.map((dependencyId) => {
    if (dependencyId.startsWith('NODE-')) {
      if (!nodes.some((node) => node.id === dependencyId)) {
        throw new PublicApiError(
          `Dependency ${dependencyId} is no longer available.`,
          409,
        );
      }
      return dependencyId;
    }
    const acceptedDependency = nodes.find(
      (node) => node.provenance?.candidateId === dependencyId,
    );
    if (!acceptedDependency) {
      throw new PublicApiError(
        `Accept ${dependencyId} before accepting ${candidateId}.`,
        409,
      );
    }
    return acceptedDependency.id;
  });
}

export function unresolvedCandidateDependencies(
  dependencyIds: string[],
  nodes: AcceptedDependencyNode[],
) {
  return dependencyIds.filter((dependencyId) =>
    dependencyId.startsWith('NODE-')
      ? !nodes.some((node) => node.id === dependencyId)
      : !nodes.some((node) => node.provenance?.candidateId === dependencyId),
  );
}

export function candidateDependencyBlockers(
  candidateId: string,
  candidates: Array<{ candidateId: string; dependsOn: string[] }>,
) {
  return candidates
    .filter(
      (candidate) =>
        candidate.candidateId !== candidateId &&
        candidate.dependsOn.includes(candidateId),
    )
    .map((candidate) => candidate.candidateId);
}
