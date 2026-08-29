import type { TaskGraphNode } from '@/lib/task-graph';

export type TaskGraphPreview = {
  id: string;
  sourceNodeId: string;
  instruction: string;
  inheritedResourceCount: number;
  additionalResourceCount: number;
};

export type TaskGraphLayoutNode = {
  id: string;
  kind: 'formal' | 'preview';
  x: number;
  y: number;
  derivedFrom: string[];
};

export type TaskGraphLayoutEdge = {
  id: string;
  source: string;
  target: string;
  temporary: boolean;
};

export function buildTaskGraphLayout(
  nodes: TaskGraphNode[],
  previews: TaskGraphPreview[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const depthById = new Map<string, number>();

  function resolveDepth(nodeId: string, ancestors: Set<string>): number {
    const knownDepth = depthById.get(nodeId);
    if (knownDepth !== undefined) return knownDepth;
    if (ancestors.has(nodeId)) return 0;
    const node = nodeById.get(nodeId);
    const parents = (node?.derivedFrom ?? []).filter((parentId) =>
      nodeById.has(parentId),
    );
    if (parents.length === 0) {
      depthById.set(nodeId, 0);
      return 0;
    }
    const nextAncestors = new Set(ancestors).add(nodeId);
    const depth =
      Math.max(
        ...parents.map((parentId) => resolveDepth(parentId, nextAncestors)),
      ) + 1;
    depthById.set(nodeId, depth);
    return depth;
  }

  const countByDepth = new Map<number, number>();
  const layoutNodes: TaskGraphLayoutNode[] = nodes.map((node) => {
    const depth = resolveDepth(node.id, new Set());
    const index = countByDepth.get(depth) ?? 0;
    countByDepth.set(depth, index + 1);
    return {
      id: node.id,
      kind: 'formal',
      x: depth * 360,
      y: index * 190,
      derivedFrom: node.derivedFrom ?? [],
    };
  });
  const nodePositions = new Map(
    layoutNodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
  const previewCountBySource = new Map<string, number>();

  for (const preview of previews) {
    const sourcePosition = nodePositions.get(preview.sourceNodeId) ?? {
      x: 0,
      y: 0,
    };
    const sourcePreviewCount =
      previewCountBySource.get(preview.sourceNodeId) ?? 0;
    previewCountBySource.set(preview.sourceNodeId, sourcePreviewCount + 1);
    layoutNodes.push({
      id: preview.id,
      kind: 'preview',
      x: sourcePosition.x + 360,
      y: sourcePosition.y + sourcePreviewCount * 180,
      derivedFrom: [preview.sourceNodeId],
    });
  }

  const knownIds = new Set(layoutNodes.map((node) => node.id));
  const edges = layoutNodes.flatMap((node) =>
    node.derivedFrom
      .filter((source) => knownIds.has(source))
      .map((source) => ({
        id: `derived:${source}:${node.id}`,
        source,
        target: node.id,
        temporary: node.kind === 'preview',
      })),
  );
  return { nodes: layoutNodes, edges };
}
