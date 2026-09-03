import type { TaskGraphNode } from './task-graph.ts';
import type { TaskGraphPreview } from './task-graph-layout.ts';

export function cardResourceCounts(
  node?: TaskGraphNode,
  preview?: TaskGraphPreview,
) {
  if (node) {
    const { inputs, outputs } = partitionNodeResources(node.id, node.resources);
    return {
      inputCount: new Set(inputs.map((resource) => resource.path)).size,
      outputCount: new Set(outputs.map((resource) => resource.path)).size,
    };
  }
  if (preview?.candidate)
    return {
      inputCount: new Set(
        preview.candidate.resources.map((resource) => resource.path),
      ).size,
      outputCount: 1,
    };
  return {
    inputCount:
      (preview?.inheritedResourceCount ?? 0) +
      (preview?.additionalResourceCount ?? 0),
    outputCount: 0,
  };
}

export function partitionNodeResources(
  nodeId: string,
  resources: TaskGraphNode['resources'],
) {
  const outputs = resources.filter(
    (resource) =>
      resource.kind === 'output' &&
      (resource.path.includes(`/nodes/${nodeId}/`) ||
        resource.path.includes(`/contracts/${nodeId}/`)),
  );
  const outputPaths = new Set(outputs.map((resource) => resource.path));
  return {
    inputs: resources.filter((resource) => !outputPaths.has(resource.path)),
    outputs,
  };
}
