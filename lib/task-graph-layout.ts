import dagre from '@dagrejs/dagre';
import type { HarnessCandidate } from '@/lib/task-decomposition-harness';
import type { TaskGraphNode } from '@/lib/task-graph';
import type { WhatsNextCandidate } from '@/lib/whats-next-harness';

export type TaskGraphPreview = {
  id: string;
  sourceNodeId: string;
  instruction: string;
  inheritedResourceCount: number;
  additionalResourceCount: number;
  kind?: 'request' | 'run' | 'candidate' | 'outcome';
  title?: string;
  type?: string;
  description?: string;
  color?: string;
  status?: string;
  agentLabel?: string;
  derivedFrom?: string[];
  dependsOn?: string[];
  candidate?: HarnessCandidate | WhatsNextCandidate;
  outputPath?: string;
  previousOutputPath?: string;
  previousMarkdown?: string;
  runId?: string;
  revisionOf?: string;
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
  relation: 'lineage' | 'dependency' | 'request';
};

const nodeWidth = 288;
const nodeHeight = 156;

export function buildTaskGraphLayout(
  nodes: TaskGraphNode[],
  previews: TaskGraphPreview[],
) {
  const layoutNodes: Array<{
    id: string;
    kind: TaskGraphLayoutNode['kind'];
    derivedFrom: string[];
  }> = [
    ...nodes.map((node) => ({
      id: node.id,
      kind: 'formal' as const,
      derivedFrom: node.derivedFrom ?? [],
    })),
    ...previews.map((preview) => ({
      id: preview.id,
      kind: 'preview' as const,
      derivedFrom: preview.derivedFrom ?? [preview.sourceNodeId],
    })),
  ];
  const knownIds = new Set(layoutNodes.map((node) => node.id));
  const lineageEdges: TaskGraphLayoutEdge[] = layoutNodes.flatMap((node) =>
    node.derivedFrom
      .filter((source) => knownIds.has(source))
      .map((source) => ({
        id: `derived:${source}:${node.id}`,
        source,
        target: node.id,
        relation: node.kind === 'preview' ? 'request' : 'lineage',
      })),
  );

  const graph = new dagre.graphlib.Graph()
    .setDefaultEdgeLabel(() => ({}))
    .setGraph({
      rankdir: 'LR',
      ranker: 'network-simplex',
      ranksep: 180,
      nodesep: 144,
      marginx: 24,
      marginy: 24,
    });
  for (const node of layoutNodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of lineageEdges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const positionedNodes: TaskGraphLayoutNode[] = layoutNodes.map((node) => {
    const position = graph.node(node.id) as { x: number; y: number };
    return {
      ...node,
      x: position.x - nodeWidth / 2 + horizontalOffset(node.id),
      y: position.y - nodeHeight / 2 + verticalOffset(node.id),
    };
  });
  const dependencySources = [
    ...nodes.map((node) => ({ id: node.id, dependsOn: node.dependsOn })),
    ...previews.map((preview) => ({
      id: preview.id,
      dependsOn: preview.dependsOn ?? [],
    })),
  ];
  const dependencyEdges: TaskGraphLayoutEdge[] = dependencySources.flatMap(
    (node) =>
      node.dependsOn
        .filter((dependency) => knownIds.has(dependency))
        .map((dependency) => ({
          id: `depends:${node.id}:${dependency}`,
          source: node.id,
          target: dependency,
          relation: 'dependency',
        })),
  );
  return {
    nodes: positionedNodes,
    edges: [...lineageEdges, ...dependencyEdges],
  };
}

function horizontalOffset(id: string) {
  return ((stableHash(id) % 5) - 2) * 12;
}

function verticalOffset(id: string) {
  return ((Math.floor(stableHash(id) / 5) % 7) - 3) * 10;
}

function stableHash(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}
