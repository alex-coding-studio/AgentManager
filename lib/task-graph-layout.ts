import dagre from '@dagrejs/dagre';
import { TASK_GRAPH_NODE_MIN_HEIGHT } from './graph-card-metrics.ts';
export { TASK_GRAPH_NODE_MIN_HEIGHT } from './graph-card-metrics.ts';
import type { HarnessCandidate } from '@/lib/task-decomposition-harness';
import type { TaskGraphNode } from '@/lib/task-graph';
import type { WhatsNextCandidate } from '@/lib/whats-next-harness';
import type { GraphIdentityFields, IdentityEntity } from './graph-identity.ts';

export type TaskGraphPreview = GraphIdentityFields & {
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
  layer?: 'discovery' | 'product-design';
};

export type TaskGraphLayoutNode = {
  id: string;
  uid: string;
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
const nodeHeight = TASK_GRAPH_NODE_MIN_HEIGHT;

export function buildTaskGraphLayout(
  nodes: TaskGraphNode[],
  previews: TaskGraphPreview[],
) {
  const nodeUid = (node: TaskGraphNode) =>
    node.uid ?? node.provenance?.candidateId ?? node.id;
  const previewUid = (preview: TaskGraphPreview) =>
    preview.uid ?? preview.candidate?.uid ?? preview.id;
  const formalUids = new Set(nodes.map(nodeUid));
  const visiblePreviews = previews.filter(
    (preview) => !formalUids.has(previewUid(preview)),
  );
  const layoutIdByNodeId = new Map<string, string>();
  for (const preview of previews)
    layoutIdByNodeId.set(preview.id, previewUid(preview));
  for (const node of nodes) {
    layoutIdByNodeId.set(node.id, nodeUid(node));
    if (node.provenance)
      layoutIdByNodeId.set(node.provenance.candidateId, nodeUid(node));
  }
  const displayIdByUid = new Map([
    ...visiblePreviews.map(
      (preview) => [previewUid(preview), preview.id] as const,
    ),
    ...nodes.map((node) => [nodeUid(node), node.id] as const),
  ]);
  const references = (
    entity: IdentityEntity,
    relation: 'derivedFrom' | 'dependsOn',
    fallback: string[],
  ) =>
    entity.relations
      ? entity.relations[relation].flatMap((uid) =>
          displayIdByUid.has(uid) ? [displayIdByUid.get(uid)!] : [],
        )
      : fallback.map(
          (alias) =>
            displayIdByUid.get(layoutIdByNodeId.get(alias) ?? alias) ?? alias,
        );
  const layoutNodes: Array<{
    id: string;
    uid: string;
    kind: TaskGraphLayoutNode['kind'];
    derivedFrom: string[];
  }> = [
    ...nodes.map((node) => ({
      id: node.id,
      uid: nodeUid(node),
      kind: 'formal' as const,
      derivedFrom: references(node, 'derivedFrom', node.derivedFrom ?? []),
    })),
    ...visiblePreviews.map((preview) => ({
      id: preview.id,
      uid: previewUid(preview),
      kind: 'preview' as const,
      derivedFrom: references(
        preview.candidate ?? preview,
        'derivedFrom',
        preview.derivedFrom ?? [preview.sourceNodeId],
      ),
    })),
  ];
  const layoutId = (id: string) => layoutIdByNodeId.get(id)!;
  const compareIds = (left: string, right: string) =>
    layoutId(left).localeCompare(layoutId(right), 'en', { numeric: true });
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
  for (const node of [...layoutNodes].sort((left, right) =>
    compareIds(left.id, right.id),
  )) {
    graph.setNode(layoutId(node.id), { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of [...lineageEdges].sort(
    (left, right) =>
      compareIds(left.source, right.source) ||
      compareIds(left.target, right.target),
  )) {
    graph.setEdge(layoutId(edge.source), layoutId(edge.target));
  }
  dagre.layout(graph);

  const positionedNodes: TaskGraphLayoutNode[] = layoutNodes.map((node) => {
    const stableId = layoutId(node.id);
    const position = graph.node(stableId) as { x: number; y: number };
    return {
      ...node,
      x: position.x - nodeWidth / 2 + horizontalOffset(stableId),
      y: position.y - nodeHeight / 2 + verticalOffset(stableId),
    };
  });
  const dependencySources = [
    ...nodes.map((node) => ({
      id: node.id,
      dependsOn: references(node, 'dependsOn', node.dependsOn),
    })),
    ...visiblePreviews.map((preview) => ({
      id: preview.id,
      dependsOn: references(
        preview.candidate ?? preview,
        'dependsOn',
        preview.dependsOn ?? [],
      ),
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
