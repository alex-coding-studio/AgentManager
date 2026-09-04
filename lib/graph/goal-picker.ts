import dagre from '@dagrejs/dagre';
import type { PlanningSource } from '../modules/implementation/planning-sources.ts';

export const GOAL_PICKER_WIDTH = 216;
export const GOAL_PICKER_HEIGHT = 94;
export type GoalPickerStatus =
  | 'not-started'
  | 'waiting'
  | 'added'
  | 'planning'
  | 'plan-ready'
  | 'completed';
export type GoalPickerEntry = PlanningSource & {
  executionStatus: GoalPickerStatus;
};

export function canAddGoalSource(entry: GoalPickerEntry, pending = false) {
  return !pending && entry.executionStatus === 'not-started';
}
export type GoalPickerEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'dependency';
};

export function goalPickerEdgeLane(
  nodes: Array<{ entry: GoalPickerEntry; x: number; y: number }>,
  edge: GoalPickerEdge,
) {
  const source = nodes.find((node) => node.entry.uid === edge.source)!;
  const target = nodes.find((node) => node.entry.uid === edge.target)!;
  const exitX = source.x + GOAL_PICKER_WIDTH + 16;
  const entryX = target.x - 16;
  const sourceY = source.y + GOAL_PICKER_HEIGHT / 2;
  const targetY = target.y + GOAL_PICKER_HEIGHT / 2;
  const left = Math.min(exitX, entryX),
    right = Math.max(exitX, entryX);
  const intersectsHorizontal = (node: typeof source, y: number) =>
    node.x < right &&
    node.x + GOAL_PICKER_WIDTH > left &&
    node.y - 8 < y &&
    node.y + GOAL_PICKER_HEIGHT + 8 > y;
  const blockers = nodes.filter(
    (node) =>
      node.x < right &&
      node.x + GOAL_PICKER_WIDTH > left &&
      node.y - 8 < Math.max(sourceY, targetY) &&
      node.y + GOAL_PICKER_HEIGHT + 8 > Math.min(sourceY, targetY),
  );
  if (exitX < entryX && !blockers.length) return undefined;
  const candidates = [
    ...new Set(
      nodes.flatMap((node) => [node.y - 18, node.y + GOAL_PICKER_HEIGHT + 18]),
    ),
  ];
  candidates.sort(
    (a, b) =>
      Math.abs(a - sourceY) +
        Math.abs(a - targetY) -
        (Math.abs(b - sourceY) + Math.abs(b - targetY)) || a - b,
  );
  function verticalBlocked(x: number, y: number, lane: number) {
    return nodes.some(
      (node) =>
        node.x - 8 < x &&
        node.x + GOAL_PICKER_WIDTH + 8 > x &&
        node.y < Math.max(y, lane) &&
        node.y + GOAL_PICKER_HEIGHT > Math.min(y, lane),
    );
  }
  return candidates.find(
    (lane) =>
      !nodes.some((node) => intersectsHorizontal(node, lane)) &&
      !verticalBlocked(exitX, sourceY, lane) &&
      !verticalBlocked(entryX, targetY, lane),
  );
}

export function buildGoalPickerGraph(
  entries: GoalPickerEntry[],
  moduleName: PlanningSource['module'],
) {
  const all = entries
    .filter((entry) => entry.module === moduleName)
    .sort((a, b) => a.uid.localeCompare(b.uid));
  const visible = all;
  const byRef = new Map<string, GoalPickerEntry>();
  for (const entry of all) {
    byRef.set(entry.id, entry);
    byRef.set(entry.uid, entry);
  }
  const edges: GoalPickerEdge[] = [];
  const edgeIds = new Set<string>();
  const unresolved = new Set<string>();
  function edge(source: string, target: string, kind: GoalPickerEdge['kind']) {
    const id = `${kind}:${source}:${target}`;
    if (!edgeIds.has(id)) {
      edges.push({ id, source, target, kind });
      edgeIds.add(id);
    }
  }
  for (const entry of visible) {
    for (const ref of entry.dependsOn) {
      const prerequisite = byRef.get(ref);
      if (!prerequisite) {
        unresolved.add(`${entry.uid}:${ref}`);
        continue;
      }
      edge(prerequisite.uid, entry.uid, 'dependency');
    }
  }
  const constraints = new Map(
    visible.map((entry) => [entry.uid, new Set<string>()]),
  );
  function reaches(
    from: string,
    to: string,
    visited = new Set<string>(),
  ): boolean {
    if (from === to) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return [...(constraints.get(from) ?? [])].some((next) =>
      reaches(next, to, visited),
    );
  }
  let dependencyCycle = false;
  for (const item of edges) {
    if (reaches(item.target, item.source)) dependencyCycle = true;
    else constraints.get(item.source)!.add(item.target);
  }
  const layout = new dagre.graphlib.Graph();
  layout.setGraph({
    rankdir: 'LR',
    ranksep: 64,
    nodesep: 24,
    marginx: 28,
    marginy: 28,
  });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const entry of visible)
    layout.setNode(entry.uid, {
      width: GOAL_PICKER_WIDTH,
      height: GOAL_PICKER_HEIGHT,
    });
  for (const [source, targets] of constraints)
    for (const target of targets) layout.setEdge(source, target);
  dagre.layout(layout);
  return {
    nodes: visible.map((entry) => ({
      entry,
      x: layout.node(entry.uid).x - GOAL_PICKER_WIDTH / 2,
      y: layout.node(entry.uid).y - GOAL_PICKER_HEIGHT / 2,
    })),
    edges,
    unresolvedDependencies: unresolved.size,
    dependencyCycle,
  };
}
