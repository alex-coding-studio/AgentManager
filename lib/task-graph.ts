import { PublicApiError } from './api-errors.ts';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import trash from 'trash';
import type { GraphIdentityFields } from './graph-identity.ts';
import {
  ensureGraphIdentities,
  readIdentifiedEntities,
  reserveNodeIdentity,
} from './graph-identity-store.ts';
import type { RegisteredProject } from './project-registry.ts';
import {
  assertCanvasCanCreateStartNode,
  assertTaskGraphNodeCanBeDeleted,
} from './task-graph-rules.ts';

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

export async function listTaskGraphNodes(
  project: RegisteredProject,
  graphRoot: GraphRoot = 'task-graph',
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
        const temporary = `${nodeFile}.${randomUUID()}.tmp`;
        await writeFile(temporary, `${JSON.stringify(node, null, 2)}\n`, {
          flag: 'wx',
        });
        await rename(temporary, nodeFile);
      }
      return node;
    }),
  );
  return readIdentifiedEntities(project.planningPath, graphRoot, nodes, true);
}

export async function createStartNode(
  project: RegisteredProject,
  input: {
    title: string;
    contextRefs: string[];
    files: File[];
    idea?: string;
  },
  graphRoot: GraphRoot = 'task-graph',
) {
  const title = input.title.trim();
  if (!title) throw new PublicApiError('A start-node title is required.', 400);
  if (title.length > 160) {
    throw new PublicApiError(
      'Start-node title must be 160 characters or fewer.',
      400,
    );
  }
  const idea = input.idea?.trim() ?? '';
  if (idea.length > 4_000) {
    throw new PublicApiError(
      'The starting idea must be 4,000 characters or fewer.',
      400,
    );
  }
  if (input.contextRefs.length + input.files.length === 0 && !idea) {
    throw new Error(
      'Write a starting idea, or select or upload at least one source document.',
    );
  }
  if (input.contextRefs.length > 50) {
    throw new PublicApiError(
      'Select no more than 50 Context Library documents.',
      400,
    );
  }
  if (input.files.length > 20) {
    throw new PublicApiError(
      'Upload no more than 20 Markdown files at once.',
      400,
    );
  }

  const contextRefs = await validateContextRefs(project, input.contextRefs);
  const uploads = await prepareUploads(input.files);

  const taskGraphPath = path.join(project.planningPath, graphRoot);
  const nodesPath = path.join(taskGraphPath, 'nodes');
  await mkdir(nodesPath, { recursive: true });
  const existingNodes = await listTaskGraphNodes(project, graphRoot);
  assertCanvasCanCreateStartNode(existingNodes);
  const { id, uid } = await reserveNodeIdentity(
    project.planningPath,
    graphRoot,
  );
  const nodePath = path.join(nodesPath, id);
  const temporaryNodePath = path.join(nodesPath, `.${id}-${randomUUID()}.tmp`);
  await mkdir(temporaryNodePath);
  const uploadedResources: TaskGraphNode['resources'] = [];

  try {
    if (idea) {
      const resourcesPath = path.join(temporaryNodePath, 'resources');
      await mkdir(resourcesPath, { recursive: true });
      await writeFile(
        path.join(resourcesPath, 'idea.md'),
        `# ${title}\n\n${idea}\n`,
        { flag: 'wx' },
      );
      uploadedResources.push({
        kind: 'idea',
        path: `${graphRoot}/nodes/${id}/resources/idea.md`,
      });
    }
    if (uploads.length > 0) {
      const resourcesPath = path.join(temporaryNodePath, 'resources');
      await mkdir(resourcesPath, { recursive: true });
      const usedNames = new Set<string>();
      for (const upload of uploads) {
        const fileName = chooseUniqueName(upload.baseName, usedNames);
        await writeFile(path.join(resourcesPath, fileName), upload.content, {
          flag: 'wx',
        });
        uploadedResources.push({
          kind: 'attachment',
          path: `${graphRoot}/nodes/${id}/resources/${fileName}`,
        });
      }
    }

    const timestamp = new Date().toISOString();
    const node: TaskGraphNode = {
      schemaVersion: 1,
      id,
      uid,
      relations: { derivedFrom: [], dependsOn: [] },
      role: 'start',
      type: 'source',
      title,
      status: 'captured',
      createdAt: timestamp,
      updatedAt: timestamp,
      resources: [
        ...contextRefs.map((ref) => ({ kind: 'context', path: ref })),
        ...uploadedResources,
      ],
      dependsOn: [],
      typeTemplateRef: id,
      metadata: {},
      layer: graphRoot === 'whats-next' ? 'discovery' : undefined,
      artifactKind: graphRoot === 'whats-next' ? 'source' : undefined,
      presentation: {
        color: '#525252',
      },
    };
    await writeFile(
      path.join(temporaryNodePath, 'node.json'),
      `${JSON.stringify(node, null, 2)}\n`,
      { flag: 'wx' },
    );
    await rename(temporaryNodePath, nodePath);
    return { node, nodes: await listTaskGraphNodes(project, graphRoot) };
  } catch (error) {
    await rm(temporaryNodePath, { recursive: true, force: true });
    throw error;
  }
}

export async function updateStartNode(
  project: RegisteredProject,
  input: {
    id: string;
    title: string;
    contextRefs: string[];
    retainedAttachmentRefs: string[];
    files: File[];
    idea?: string;
  },
  graphRoot: GraphRoot = 'task-graph',
) {
  if (!/^NODE-[0-9a-f]{8,32}$/.test(input.id)) {
    throw new PublicApiError('The start node is invalid.', 400);
  }
  const title = input.title.trim();
  if (!title) throw new PublicApiError('A start-node title is required.', 400);
  if (title.length > 160) {
    throw new PublicApiError(
      'Start-node title must be 160 characters or fewer.',
      400,
    );
  }
  if (input.contextRefs.length > 50) {
    throw new PublicApiError(
      'Select no more than 50 Context Library documents.',
      400,
    );
  }
  if (input.files.length > 20) {
    throw new PublicApiError(
      'Upload no more than 20 Markdown files at once.',
      400,
    );
  }
  const idea = input.idea?.trim() ?? '';
  if (idea.length > 4_000) {
    throw new PublicApiError(
      'The starting idea must be 4,000 characters or fewer.',
      400,
    );
  }

  const nodePath = path.join(
    project.planningPath,
    graphRoot,
    'nodes',
    input.id,
  );
  const nodeJsonPath = path.join(nodePath, 'node.json');
  const node = JSON.parse(
    await readFile(nodeJsonPath, 'utf8'),
  ) as TaskGraphNode;
  if (
    node.schemaVersion !== 1 ||
    node.id !== input.id ||
    node.role !== 'start'
  ) {
    throw new Error('The start node could not be edited.');
  }

  const contextRefs = await validateContextRefs(project, input.contextRefs);
  const existingAttachments = new Map(
    node.resources
      .filter((resource) => resource.kind === 'attachment')
      .map((resource) => [resource.path, resource]),
  );
  const retainedAttachmentRefs = [...new Set(input.retainedAttachmentRefs)];
  const retainedAttachments = retainedAttachmentRefs.map((ref) => {
    const resource = existingAttachments.get(ref);
    if (!resource)
      throw new PublicApiError('A retained attachment is invalid.', 400);
    return resource;
  });
  const ideaResource = node.resources.find(
    (resource) => resource.kind === 'idea',
  );
  if (
    contextRefs.length + retainedAttachments.length + input.files.length ===
      0 &&
    !idea &&
    !ideaResource
  ) {
    throw new Error(
      'Write a starting idea, or select or upload at least one source document.',
    );
  }

  const uploads = await prepareUploads(input.files);
  const resourcesPath = path.join(nodePath, 'resources');
  await mkdir(resourcesPath, { recursive: true });
  const usedNames = new Set(
    [...existingAttachments.keys()].map((ref) => path.basename(ref)),
  );
  const newAttachments: TaskGraphNode['resources'] = [];
  const newAttachmentPaths: string[] = [];
  let committed = false;

  try {
    for (const upload of uploads) {
      const fileName = chooseUniqueName(upload.baseName, usedNames);
      const absolutePath = path.join(resourcesPath, fileName);
      await writeFile(absolutePath, upload.content, { flag: 'wx' });
      newAttachmentPaths.push(absolutePath);
      newAttachments.push({
        kind: 'attachment',
        path: `${graphRoot}/nodes/${input.id}/resources/${fileName}`,
      });
    }

    if (idea && ideaResource) {
      await writeFile(
        path.join(project.planningPath, ideaResource.path),
        `# ${title}\n\n${idea}\n`,
      );
    }

    const updatedNode: TaskGraphNode = {
      ...node,
      title,
      updatedAt: new Date().toISOString(),
      resources: [
        ...(ideaResource ? [ideaResource] : []),
        ...contextRefs.map((ref) => ({ kind: 'context', path: ref })),
        ...retainedAttachments,
        ...newAttachments,
      ],
    };
    const temporaryJsonPath = path.join(
      nodePath,
      `.node-${randomUUID()}.json.tmp`,
    );
    await writeFile(
      temporaryJsonPath,
      `${JSON.stringify(updatedNode, null, 2)}\n`,
      { flag: 'wx' },
    );
    await rename(temporaryJsonPath, nodeJsonPath);
    committed = true;

    const removedAttachments = [...existingAttachments.keys()].filter(
      (ref) => !retainedAttachmentRefs.includes(ref),
    );
    await Promise.all(
      removedAttachments.map((ref) =>
        unlink(path.join(project.planningPath, ref)).catch(() => undefined),
      ),
    );
    return {
      node: updatedNode,
      nodes: await listTaskGraphNodes(project, graphRoot),
    };
  } catch (error) {
    if (!committed) {
      await Promise.all(
        newAttachmentPaths.map((filePath) =>
          unlink(filePath).catch(() => undefined),
        ),
      );
    }
    throw error;
  }
}

export async function deleteTaskGraphNode(
  project: RegisteredProject,
  nodeId: string,
  graphRoot: GraphRoot = 'task-graph',
) {
  if (!/^NODE-[0-9a-f]{8,32}$/.test(nodeId)) {
    throw new PublicApiError('The node is invalid.', 400);
  }

  const nodes = await listTaskGraphNodes(project, graphRoot);
  if (!nodes.some((node) => node.id === nodeId)) {
    throw new Error('The node could not be found.');
  }
  assertTaskGraphNodeCanBeDeleted(nodes, nodeId);

  const nodePath = path.join(project.planningPath, graphRoot, 'nodes', nodeId);
  await trash(nodePath);
  return { nodes: await listTaskGraphNodes(project, graphRoot) };
}

export async function readTaskGraphMarkdownResource(
  project: RegisteredProject,
  resourcePath: string,
) {
  if (
    !/^context(?:\/[a-z0-9][a-z0-9-]*)+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
      resourcePath,
    ) &&
    !/^(?:task-graph|whats-next)\/nodes\/NODE-[0-9a-f]{8,32}\/resources\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
      resourcePath,
    ) &&
    !/^task-decomposition\/runs\/RUN-[0-9a-f-]{36}\/candidates\/CANDIDATE-(?:[0-9]{4,}|[0-9a-f]{8,32})\/output\.md$/i.test(
      resourcePath,
    ) &&
    !/^whats-next\/runs\/RUN-[0-9a-f-]{36}\/candidates\/CANDIDATE-(?:[0-9]{4,}|[0-9a-f]{8,32})\/output\.md$/i.test(
      resourcePath,
    ) &&
    !/^whats-next\/runs\/RUN-[0-9a-f-]{36}\/reflection\.md$/i.test(
      resourcePath,
    ) &&
    !/^whats-next\/runs\/RUN-[0-9a-f-]{36}\/response\.md$/i.test(
      resourcePath,
    ) &&
    !/^whats-next\/runs\/RUN-[0-9a-f-]{36}\/resources\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
      resourcePath,
    ) &&
    !/^(?:task-graph|whats-next)\/nodes\/NODE-[0-9a-f]{8,32}\/output\.md$/i.test(
      resourcePath,
    )
  ) {
    throw new Error('The source document path is invalid.');
  }

  const planningRoot = await realpath(project.planningPath);
  const absolutePath = await realpath(
    path.resolve(project.planningPath, resourcePath),
  );
  if (!absolutePath.startsWith(`${planningRoot}${path.sep}`)) {
    throw new Error('The source document path is invalid.');
  }
  return {
    fileName: path.basename(resourcePath),
    path: resourcePath,
    markdown: await readFile(absolutePath, 'utf8'),
  };
}

async function validateContextRefs(project: RegisteredProject, refs: string[]) {
  const uniqueRefs = [...new Set(refs)];
  const contextRoot = path.join(project.planningPath, 'context');
  for (const ref of uniqueRefs) {
    if (
      !/^context(?:\/[a-z0-9][a-z0-9-]*)+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
        ref,
      )
    ) {
      throw new Error('A selected Context Library reference is invalid.');
    }
    const absolutePath = path.resolve(project.planningPath, ref);
    if (!absolutePath.startsWith(`${contextRoot}${path.sep}`)) {
      throw new Error('A selected Context Library reference is invalid.');
    }
    try {
      await readFile(absolutePath, 'utf8');
    } catch {
      throw new Error(`The selected source ${ref} could not be read.`);
    }
  }
  return uniqueRefs;
}

function chooseUniqueName(baseName: string, usedNames: Set<string>) {
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const fileName =
      suffix === 1 ? `${baseName}.md` : `${baseName}-${suffix}.md`;
    if (!usedNames.has(fileName)) {
      usedNames.add(fileName);
      return fileName;
    }
  }
  throw new Error('Could not choose a unique source file name.');
}

async function prepareUploads(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      if (!/\.(md|markdown)$/i.test(file.name)) {
        throw new Error(
          'Only Markdown source files can be uploaded right now.',
        );
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Each Markdown source file must be 2 MB or smaller.');
      }
      return {
        baseName: slugify(path.parse(path.basename(file.name)).name),
        content: await file.text(),
      };
    }),
  );
}

function slugify(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'source'
  );
}
