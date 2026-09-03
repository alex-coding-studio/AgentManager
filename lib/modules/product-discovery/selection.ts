import type { TaskGraphNode } from '../../graph/task/model.ts';

export function toggleWhatsNextSelection(
  nodes: Pick<TaskGraphNode, 'id' | 'role'>[],
  selectedIds: string[],
  nodeId: string,
) {
  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node) return selectedIds;
  if (selectedIds.includes(nodeId)) {
    return selectedIds.filter((id) => id !== nodeId);
  }
  if (node.role === 'start') return [nodeId];
  return [
    ...selectedIds.filter(
      (id) => nodes.find((entry) => entry.id === id)?.role !== 'start',
    ),
    nodeId,
  ];
}
