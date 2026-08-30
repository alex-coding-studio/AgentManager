import dagre from '@dagrejs/dagre';
import type { PlanningSource } from './just-do-it-planning-sources.ts';

export const GOAL_PICKER_WIDTH = 216;
export const GOAL_PICKER_HEIGHT = 94;
export type GoalPickerStatus =
  | 'not-started'
  | 'added'
  | 'planning'
  | 'plan-ready'
  | 'completed';
export type GoalPickerEntry = PlanningSource & {
  executionStatus: GoalPickerStatus;
};
export type GoalPickerEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'dependency' | 'lineage';
};

export function buildGoalPickerGraph(
  entries: GoalPickerEntry[],
  moduleName: PlanningSource['module'],
) {
  const all = entries
    .filter((entry) => entry.module === moduleName)
    .sort((a, b) => a.uid.localeCompare(b.uid));
  const visible = all.filter((entry) => entry.executionStatus !== 'completed');
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
      if (prerequisite.executionStatus !== 'completed')
        edge(prerequisite.uid, entry.uid, 'dependency');
    }
    for (const ref of entry.derivedFrom ?? []) {
      const parent = byRef.get(ref);
      if (
        parent &&
        parent.executionStatus !== 'completed' &&
        parent.uid !== entry.uid
      )
        edge(entry.uid, parent.uid, 'lineage');
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
  for (const item of edges.filter((item) => item.kind === 'dependency')) {
    if (reaches(item.target, item.source)) dependencyCycle = true;
    else constraints.get(item.source)!.add(item.target);
  }
  for (const item of edges.filter((item) => item.kind === 'lineage')) {
    if (!reaches(item.target, item.source))
      constraints.get(item.source)!.add(item.target);
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
