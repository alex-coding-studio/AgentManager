import type { TaskGraphLayoutEdge } from './layout.ts';

export function graphFocus(
  edges: TaskGraphLayoutEdge[],
  nodeId: string,
  dependenciesOnly = false,
) {
  const relatedEdges = edges.filter(
    (edge) =>
      (edge.source === nodeId || edge.target === nodeId) &&
      (!dependenciesOnly || edge.relation === 'dependency'),
  );
  return {
    nodeIds: new Set([
      nodeId,
      ...relatedEdges.flatMap((edge) => [edge.source, edge.target]),
    ]),
    edgeIds: new Set(relatedEdges.map((edge) => edge.id)),
  };
}

export function directDependencyCount(
  edges: TaskGraphLayoutEdge[],
  nodeId: string,
) {
  return edges.filter(
    (edge) =>
      edge.relation === 'dependency' &&
      (edge.source === nodeId || edge.target === nodeId),
  ).length;
}
