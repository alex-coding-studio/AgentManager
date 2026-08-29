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
  const layoutNodes: TaskGraphLayoutNode[] = nodes.map((node, index) => ({
    id: node.id,
    kind: 'formal',
    x: (index % 3) * 340,
    y: Math.floor(index / 3) * 220,
    derivedFrom: node.derivedFrom ?? [],
  }));
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
