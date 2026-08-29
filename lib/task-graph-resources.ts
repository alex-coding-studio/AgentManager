import type { TaskGraphNode } from './task-graph.ts';

export function partitionNodeResources(
  nodeId: string,
  resources: TaskGraphNode['resources'],
) {
  const outputs = resources.filter(
    (resource) =>
      resource.kind === 'output' && resource.path.includes(`/nodes/${nodeId}/`),
  );
  const outputPaths = new Set(outputs.map((resource) => resource.path));
  return {
    inputs: resources.filter((resource) => !outputPaths.has(resource.path)),
    outputs,
  };
}
