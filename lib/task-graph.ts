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
import type { RegisteredProject } from '@/lib/project-registry';
import {
  assertCanvasCanCreateStartNode,
  assertTaskGraphNodeCanBeDeleted,
} from '@/lib/task-graph-rules';

export type TaskGraphNode = {
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
  presentation?: {
    color?: string;
  };
};

export async function listTaskGraphNodes(project: RegisteredProject) {
  const nodesPath = path.join(project.planningPath, 'task-graph', 'nodes');
  const entries = await readdir(nodesPath, { withFileTypes: true }).catch(
    () => [],
  );
  const fileNames = entries
    .filter((entry) => entry.isDirectory() && /^NODE-\d{4,}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  return Promise.all(
    fileNames.map(async (fileName) => {
      const node = JSON.parse(
        await readFile(path.join(nodesPath, fileName, 'node.json'), 'utf8'),
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
      return node;
    }),
  );
}

export async function createStartNode(
  project: RegisteredProject,
  input: {
    title: string;
    contextRefs: string[];
    files: File[];
  },
) {
  const title = input.title.trim();
  if (!title) throw new Error('A start-node title is required.');
  if (title.length > 160) {
    throw new Error('Start-node title must be 160 characters or fewer.');
  }
  if (input.contextRefs.length + input.files.length === 0) {
    throw new Error('Select or upload at least one source document.');
  }
  if (input.contextRefs.length > 50) {
    throw new Error('Select no more than 50 Context Library documents.');
  }
  if (input.files.length > 20) {
    throw new Error('Upload no more than 20 Markdown files at once.');
  }

  const contextRefs = await validateContextRefs(project, input.contextRefs);
  const uploads = await prepareUploads(input.files);

  const taskGraphPath = path.join(project.planningPath, 'task-graph');
  const nodesPath = path.join(taskGraphPath, 'nodes');
  await mkdir(nodesPath, { recursive: true });
  const existingNodes = await listTaskGraphNodes(project);
  assertCanvasCanCreateStartNode(existingNodes);
  const nextNumber =
    existingNodes.reduce((largest, node) => {
      const number = Number(node.id.replace(/^NODE-/, ''));
      return Number.isFinite(number) ? Math.max(largest, number) : largest;
    }, 0) + 1;
  const id = `NODE-${String(nextNumber).padStart(4, '0')}`;
  const nodePath = path.join(nodesPath, id);
  const temporaryNodePath = path.join(nodesPath, `.${id}-${randomUUID()}.tmp`);
  await mkdir(temporaryNodePath);
  const uploadedResources: TaskGraphNode['resources'] = [];

  try {
    if (uploads.length > 0) {
      const resourcesPath = path.join(temporaryNodePath, 'resources');
      await mkdir(resourcesPath);
      const usedNames = new Set<string>();
      for (const upload of uploads) {
        const fileName = chooseUniqueName(upload.baseName, usedNames);
        await writeFile(path.join(resourcesPath, fileName), upload.content, {
          flag: 'wx',
        });
        uploadedResources.push({
          kind: 'attachment',
          path: `task-graph/nodes/${id}/resources/${fileName}`,
        });
      }
    }

    const timestamp = new Date().toISOString();
    const node: TaskGraphNode = {
      schemaVersion: 1,
      id,
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
    return { node, nodes: await listTaskGraphNodes(project) };
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
  },
) {
  if (!/^NODE-\d{4,}$/.test(input.id)) {
    throw new Error('The start node is invalid.');
  }
  const title = input.title.trim();
  if (!title) throw new Error('A start-node title is required.');
  if (title.length > 160) {
    throw new Error('Start-node title must be 160 characters or fewer.');
  }
  if (input.contextRefs.length > 50) {
    throw new Error('Select no more than 50 Context Library documents.');
  }
  if (input.files.length > 20) {
    throw new Error('Upload no more than 20 Markdown files at once.');
  }

  const nodePath = path.join(
    project.planningPath,
    'task-graph',
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
    if (!resource) throw new Error('A retained attachment is invalid.');
    return resource;
  });
  if (
    contextRefs.length + retainedAttachments.length + input.files.length ===
    0
  ) {
    throw new Error('Select or upload at least one source document.');
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
        path: `task-graph/nodes/${input.id}/resources/${fileName}`,
      });
    }

    const updatedNode: TaskGraphNode = {
      ...node,
      title,
      updatedAt: new Date().toISOString(),
      resources: [
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
    return { node: updatedNode, nodes: await listTaskGraphNodes(project) };
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
) {
  if (!/^NODE-\d{4,}$/.test(nodeId)) {
    throw new Error('The node is invalid.');
  }

  const nodes = await listTaskGraphNodes(project);
  if (!nodes.some((node) => node.id === nodeId)) {
    throw new Error('The node could not be found.');
  }
  assertTaskGraphNodeCanBeDeleted(nodes, nodeId);

  const nodePath = path.join(
    project.planningPath,
    'task-graph',
    'nodes',
    nodeId,
  );
  await trash(nodePath);
  return { nodes: await listTaskGraphNodes(project) };
}

export async function readTaskGraphMarkdownResource(
  project: RegisteredProject,
  resourcePath: string,
) {
  if (
    !/^context(?:\/[a-z0-9][a-z0-9-]*)+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
      resourcePath,
    ) &&
    !/^task-graph\/nodes\/NODE-\d{4,}\/resources\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(
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
