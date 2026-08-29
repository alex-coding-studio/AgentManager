export class CanvasStartConflictError extends Error {
  constructor() {
    super('This Canvas already has a Start node.');
    this.name = 'CanvasStartConflictError';
  }
}

export function assertCanvasCanCreateStartNode(nodes: Array<{ role: string }>) {
  if (nodes.some((node) => node.role === 'start')) {
    throw new CanvasStartConflictError();
  }
}

type RelationshipNode = {
  id: string;
  derivedFrom?: string[];
  dependsOn: string[];
};

export class NodeReferencedError extends Error {
  blockerNodeIds: string[];

  constructor(nodeId: string, blockerNodeIds: string[]) {
    super(
      `${nodeId} is still referenced by ${blockerNodeIds.length === 1 ? 'another node' : 'other nodes'}.`,
    );
    this.name = 'NodeReferencedError';
    this.blockerNodeIds = blockerNodeIds;
  }
}

export function getTaskGraphRelationships<T extends RelationshipNode>(
  nodes: T[],
  nodeId: string,
) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const derivedFrom = new Set(node?.derivedFrom ?? []);
  const dependsOn = new Set(node?.dependsOn ?? []);

  return {
    derivedFrom: nodes.filter((candidate) => derivedFrom.has(candidate.id)),
    dependsOn: nodes.filter((candidate) => dependsOn.has(candidate.id)),
    derivedNodes: nodes.filter((candidate) =>
      candidate.derivedFrom?.includes(nodeId),
    ),
    dependents: nodes.filter((candidate) =>
      candidate.dependsOn.includes(nodeId),
    ),
  };
}

export function assertTaskGraphNodeCanBeDeleted(
  nodes: RelationshipNode[],
  nodeId: string,
) {
  const relationships = getTaskGraphRelationships(nodes, nodeId);
  const blockerNodeIds = [
    ...new Set(
      [...relationships.derivedNodes, ...relationships.dependents].map(
        (node) => node.id,
      ),
    ),
  ];
  if (blockerNodeIds.length > 0) {
    throw new NodeReferencedError(nodeId, blockerNodeIds);
  }
}
