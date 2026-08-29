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
