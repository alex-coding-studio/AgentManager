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
        throw new Error(`Dependency ${dependencyId} is no longer available.`);
      }
      return dependencyId;
    }
    const acceptedDependency = nodes.find(
      (node) => node.provenance?.candidateId === dependencyId,
    );
    if (!acceptedDependency) {
      throw new Error(
        `Accept ${dependencyId} before accepting ${candidateId}.`,
      );
    }
    return acceptedDependency.id;
  });
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
