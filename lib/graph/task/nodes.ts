import { randomUUID } from 'node:crypto';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PublicApiError } from '../../api-errors.ts';
import {
  TASK_GRAPH_MARKDOWN_SHAPES,
  isPlanningPathRejection,
  resolvePlanningPath,
} from '../../planning-paths.ts';
import type { GraphIdentityFields } from '../identity.ts';
import {
  ensureGraphIdentities,
  readIdentifiedEntities,
} from '../identity-store.ts';
import type { RegisteredProject } from '../../project-registry.ts';

export type GraphRoot = 'task-graph' | 'whats-next';

export function assertGraphRoot(value: unknown): GraphRoot {
  if (value === 'whats-next') return 'whats-next';
  if (value === undefined || value === 'task-graph') return 'task-graph';
  throw new PublicApiError('The graph is invalid.', 400);
}

export type TaskGraphNode = GraphIdentityFields & {
  schemaVersion: 1;
  id: string;
  role: 'start' | 'node';
  type: string;
  title: string;
  summary?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resources: Array<{
    kind: string;
    path: string;
    metadata?: Record<string, unknown>;
  }>;
  derivedFrom?: string[];
  dependsOn: string[];
  typeTemplateRef: string;
  metadata: Record<string, unknown>;
  layer?: 'discovery' | 'product-design';
  artifactKind?: string;
  presentation?: {
    color?: string;
  };
  provenance?: {
    feature?: 'task-decomposition' | 'whats-next';
    runId: string;
    candidateId: string;
    revision: number;
  };
};

const mutationRuntime = globalThis as typeof globalThis & {
  taskGraphMutations?: Map<string, Promise<unknown>>;
};
const mutations = (mutationRuntime.taskGraphMutations ??= new Map<
  string,
  Promise<unknown>
>());

function canvasKey(project: RegisteredProject, graphRoot: GraphRoot) {
  return `${path.resolve(project.planningPath)}\u0000${graphRoot}`;
}

export async function mutateCanvas<T>(
  project: RegisteredProject,
  graphRoot: GraphRoot,
  work: () => Promise<T>,
): Promise<T> {
  const key = canvasKey(project, graphRoot);
  const previous = mutations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mutations.set(key, next);
  try {
    return (await next) as T;
  } finally {
    if (mutations.get(key) === next) mutations.delete(key);
  }
}

export async function listTaskGraphNodes(
  project: RegisteredProject,
  graphRoot: GraphRoot = 'task-graph',
) {
  return listCanvasNodes(project, graphRoot, (publish) =>
    mutateCanvas(project, graphRoot, publish),
  );
}

export async function readTaskGraphNodesSnapshot<T>(
  project: RegisteredProject,
  graphRoot: GraphRoot,
  read: (nodes: TaskGraphNode[]) => Promise<T>,
) {
  return mutateCanvas(project, graphRoot, async () =>
    read(await listCanvasNodesWithinCanvas(project, graphRoot)),
  );
}

export async function listCanvasNodesWithinCanvas(
  project: RegisteredProject,
  graphRoot: GraphRoot,
) {
  return listCanvasNodes(project, graphRoot, (publish) => publish());
}

async function publishWhatsNextDefaults(nodeFile: string) {
  const node = JSON.parse(await readFile(nodeFile, 'utf8')) as TaskGraphNode;
  if (node.layer && node.artifactKind) return;
  node.layer ??= 'discovery';
  node.artifactKind ??= node.role === 'start' ? 'source' : 'direction';
  const temporary = `${nodeFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(node, null, 2)}\n`, {
    flag: 'wx',
  });
  await rename(temporary, nodeFile);
}

async function listCanvasNodes(
  project: RegisteredProject,
  graphRoot: GraphRoot,
  order: <T>(publish: () => Promise<T>) => Promise<T>,
) {
  await ensureGraphIdentities(project.planningPath, graphRoot);
  const nodesPath = path.join(project.planningPath, graphRoot, 'nodes');
  const entries = await readdir(nodesPath, { withFileTypes: true }).catch(
    () => [],
  );
  const fileNames = entries
    .filter(
      (entry) =>
        entry.isDirectory() && /^NODE-[0-9a-f]{8,32}$/.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const unnormalized: string[] = [];
  const nodes = await Promise.all(
    fileNames.map(async (fileName) => {
      const nodeFile = path.join(nodesPath, fileName, 'node.json');
      const node = JSON.parse(
        await readFile(nodeFile, 'utf8'),
      ) as TaskGraphNode;
      if (
        node.schemaVersion !== 1 ||
        !node.id ||
        !['start', 'node'].includes(node.role) ||
        typeof node.type !== 'string' ||
        !node.title ||
        (node.summary !== undefined && typeof node.summary !== 'string') ||
        (node.derivedFrom !== undefined && !Array.isArray(node.derivedFrom)) ||
        !Array.isArray(node.resources)
      ) {
        throw new Error(`${fileName} is not a valid Task Graph node.`);
      }
      if (graphRoot === 'whats-next' && (!node.layer || !node.artifactKind)) {
        node.layer ??= 'discovery';
        node.artifactKind ??= node.role === 'start' ? 'source' : 'direction';
        unnormalized.push(nodeFile);
      }
      return node;
    }),
  );
  if (unnormalized.length > 0) {
    await order(async () => {
      for (const nodeFile of unnormalized)
        await publishWhatsNextDefaults(nodeFile);
    });
  }
  return readIdentifiedEntities(project.planningPath, graphRoot, nodes, true);
}

export async function readTaskGraphMarkdownResource(
  project: RegisteredProject,
  resourcePath: string,
) {
  let resolved;
  try {
    resolved = await resolvePlanningPath(project, resourcePath, {
      shapes: TASK_GRAPH_MARKDOWN_SHAPES,
    });
  } catch (error) {
    if (isPlanningPathRejection(error))
      throw new PublicApiError('The source document path is invalid.', 400);
    throw error;
  }
  return {
    fileName: path.basename(resourcePath),
    path: resourcePath,
    markdown: await readFile(resolved.absolutePath, 'utf8'),
  };
}
