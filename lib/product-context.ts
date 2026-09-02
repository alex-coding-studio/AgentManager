import { PublicApiError, retainCleanupFailures } from './api-errors.ts';
import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from '@/lib/project-registry';

export type ContextSection = {
  slug: string;
  title: string;
  summary: string;
  markdown: string;
  documents: ContextDocument[];
};

export type ContextDocument = {
  fileName: string;
  title: string;
  summary: string;
  markdown: string;
};

export type ContextBrowserFolder = {
  path: string;
  name: string;
  title: string;
  entries: ContextBrowserEntry[];
};

export type ContextBrowserEntry =
  | {
      kind: 'folder';
      path: string;
      name: string;
      title: string;
    }
  | {
      kind: 'file';
      path: string;
      name: string;
      title: string;
    };

export class ContextDocumentConflictError extends PublicApiError {
  conflicts: string[];

  constructor(conflicts: string[]) {
    super('One or more Markdown files already exist.', 409);
    this.name = 'ContextDocumentConflictError';
    this.conflicts = conflicts;
  }
}

const sectionTemplates = [
  {
    slug: 'product',
    markdown: `# Product

Product documents define who the product serves, which problems it solves, and how user-visible behavior should work.

## Put here

- Product foundations and positioning
- User journeys and experience contracts
- Behavioral rules and product decisions

## Keep elsewhere

Visual specifications belong in Design. Implementation constraints belong in Engineering. Active task state belongs in the task graph.

## Agent reading guidance

Read this section when clarifying requirements, decomposing user-facing capabilities, or checking whether implementation matches product intent.
`,
  },
  {
    slug: 'design',
    markdown: `# Design

Design documents describe the intended visual language, interaction patterns, information hierarchy, and human acceptance references.

## Put here

- Visual direction and interface principles
- Interaction flows and component behavior
- Reference screenshots and design acceptance notes

## Keep elsewhere

Product behavior that remains true without a particular interface belongs in Product. Code architecture belongs in Engineering.

## Agent reading guidance

Read this section for UI-bearing work, interaction decisions, and preparation for human visual acceptance.
`,
  },
  {
    slug: 'engineering',
    markdown: `# Engineering

Engineering documents capture durable technical boundaries that affect how work can be implemented and verified.

## Put here

- Architecture and data-model decisions
- Platform constraints and integration boundaries
- Repository conventions that are specific to this product

## Keep elsewhere

Generic agent instructions belong in shared infrastructure. Temporary debugging notes and task status do not belong here.

## Agent reading guidance

Read only the relevant documents when a task crosses a technical boundary or requires an architectural decision.
`,
  },
  {
    slug: 'milestones',
    markdown: `# Milestones

Milestone documents describe bounded, human-verifiable product outcomes that provide context for task decomposition.

## Put here

- Accepted milestone scope
- User-visible acceptance journeys
- Frozen handoffs that explain a milestone boundary

## Keep elsewhere

Live task readiness, dependency state, pull requests, and completion status belong in the task graph rather than these documents.

## Agent reading guidance

Read the active milestone when decomposing or implementing work inside that outcome. Do not treat milestone prose as live task state.
`,
  },
  {
    slug: 'references',
    markdown: `# References

Reference documents preserve external research and supporting material that may inform product or implementation decisions.

## Put here

- Research summaries and source notes
- Platform documentation relevant to this product
- Competitive or comparative observations

## Keep elsewhere

Verified product decisions should be promoted to Product, Design, or Engineering instead of remaining only as reference material.

## Agent reading guidance

Read this section only when the task names a source or when a specific unresolved question requires supporting evidence.
`,
  },
  {
    slug: 'other',
    markdown: `# Other

This section is a temporary home for useful product context that does not yet have a clear category.

## Put here

- Relevant context that cannot currently be classified
- Early material awaiting a durable owner

## Keep elsewhere

Move stable material into Product, Design, Engineering, Milestones, or References once its role becomes clear.

## Agent reading guidance

Do not load this section by default. Read it only when a task explicitly points here or other sections are insufficient.
`,
  },
] as const;

const rootReadme = `# Product Context

This directory contains the human-readable context that Praxis uses to understand and decompose work for this product.

Each section is a folder with its own README. Read the section README before loading its individual documents so Agent context can remain bounded.

## Sections

- Product defines user-visible intent and behavior.
- Design defines visual and interaction intent.
- Engineering defines durable technical boundaries.
- Milestones define bounded outcomes used for decomposition.
- References preserve supporting research and source material.
- Other temporarily holds material without a clear owner.

The directory layout is owned by Praxis. Task state and dependency relationships are stored separately from Product Context.
`;

async function writeIfMissing(filePath: string, content: string) {
  try {
    await writeFile(filePath, content, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export async function initializeProductContext(project: RegisteredProject) {
  const contextPath = path.join(project.planningPath, 'context');
  await mkdir(contextPath, { recursive: true });
  await writeIfMissing(path.join(contextPath, 'README.md'), rootReadme);

  for (const section of sectionTemplates) {
    const sectionPath = path.join(contextPath, section.slug);
    await mkdir(sectionPath, { recursive: true });
    await writeIfMissing(path.join(sectionPath, 'README.md'), section.markdown);
  }

  return readProductContext(project);
}

export async function readProductContext(project: RegisteredProject) {
  const contextPath = path.join(project.planningPath, 'context');
  const entries = await readdir(contextPath, { withFileTypes: true }).catch(
    () => [],
  );
  const directories = entries.filter(
    (entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name),
  );
  const preferredOrder = sectionTemplates.map((section) => section.slug);
  directories.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.name as never);
    const rightIndex = preferredOrder.indexOf(right.name as never);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.name.localeCompare(right.name);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const sections = await Promise.all(
    directories.map(async (directory) => {
      const sectionPath = path.join(contextPath, directory.name);
      const documentEntries = await readdir(sectionPath, {
        withFileTypes: true,
      });
      const fileNames = documentEntries
        .filter(
          (entry) => entry.isFile() && /\.(md|markdown)$/i.test(entry.name),
        )
        .map((entry) => entry.name)
        .sort(compareDocumentNames);
      const documents = await Promise.all(
        fileNames.map(async (fileName) =>
          documentFromMarkdown(
            fileName,
            await readFile(path.join(sectionPath, fileName), 'utf8'),
          ),
        ),
      );
      return buildSection(directory.name, documents);
    }),
  );

  return sections;
}

function compareDocumentNames(left: string, right: string) {
  if (left.toLowerCase() === 'readme.md') return -1;
  if (right.toLowerCase() === 'readme.md') return 1;
  return left.localeCompare(right);
}

function documentFromMarkdown(fileName: string, markdown: string) {
  return {
    fileName,
    title: readTitle(markdown, path.parse(fileName).name),
    summary: readSummary(markdown),
    markdown,
  } satisfies ContextDocument;
}

function buildSection(slug: string, documents: ContextDocument[]) {
  const readme = documents.find(
    (document) => document.fileName.toLowerCase() === 'readme.md',
  );
  return {
    slug,
    title: readme?.title ?? readTitle('', slug),
    summary: readme?.summary ?? 'No section guidance yet.',
    markdown: readme?.markdown ?? '',
    documents,
  } satisfies ContextSection;
}

export async function readContextBrowser(project: RegisteredProject) {
  const contextPath = path.join(project.planningPath, 'context');
  const entries = await readdir(contextPath, { withFileTypes: true }).catch(
    () => [],
  );
  const directories = entries
    .filter(
      (entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name),
    )
    .map((entry) => entry.name);
  const preferredOrder = sectionTemplates.map((section) => section.slug);
  directories.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left as never);
    const rightIndex = preferredOrder.indexOf(right as never);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const folders: ContextBrowserFolder[] = [];
  for (const directory of directories) {
    await readContextBrowserFolder(
      path.join(contextPath, directory),
      `context/${directory}`,
      folders,
    );
  }
  return folders;
}

async function readContextBrowserFolder(
  folderPath: string,
  relativePath: string,
  folders: ContextBrowserFolder[],
) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const childDirectories = entries
    .filter(
      (entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && /\.(md|markdown)$/i.test(entry.name))
    .sort((left, right) => {
      if (left.name.toLowerCase() === 'readme.md') return -1;
      if (right.name.toLowerCase() === 'readme.md') return 1;
      return left.name.localeCompare(right.name);
    });
  const documents = await Promise.all(
    markdownFiles.map(async (entry) => {
      const markdown = await readFile(
        path.join(folderPath, entry.name),
        'utf8',
      );
      return {
        kind: 'file' as const,
        path: `${relativePath}/${entry.name}`,
        name: entry.name,
        title: readTitle(markdown, path.parse(entry.name).name),
      };
    }),
  );
  const readme = documents.find(
    (document) => document.name.toLowerCase() === 'readme.md',
  );
  const name = path.basename(relativePath);
  const childFolders = childDirectories.map((entry) => ({
    kind: 'folder' as const,
    path: `${relativePath}/${entry.name}`,
    name: entry.name,
    title: readTitle('', entry.name),
  }));
  folders.push({
    path: relativePath,
    name,
    title: readme?.title ?? readTitle('', name),
    entries: [...childFolders, ...documents],
  });
  for (const directory of childDirectories) {
    await readContextBrowserFolder(
      path.join(folderPath, directory.name),
      `${relativePath}/${directory.name}`,
      folders,
    );
  }
}

export async function createContextDocument(
  project: RegisteredProject,
  section: string,
  title: string,
) {
  const sectionPath = await resolveSectionPath(project, section);
  const fileName = await writeUniqueMarkdown(
    sectionPath,
    slugify(title),
    `# ${title.trim()}\n\n`,
  );
  return { fileName, sections: await readProductContext(project) };
}

export async function createContextSection(
  project: RegisteredProject,
  title: string,
) {
  const slug = slugify(title);
  const contextPath = path.join(project.planningPath, 'context');
  await mkdir(contextPath, { recursive: true });
  try {
    await mkdir(path.join(contextPath, slug));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new PublicApiError(
        'A context folder with this name already exists.',
        409,
      );
    }
    throw error;
  }
  return { slug, sections: await readProductContext(project) };
}

export async function renameContextSection(
  project: RegisteredProject,
  section: string,
  title: string,
) {
  const sectionPath = await resolveSectionPath(project, section);
  const slug = slugify(title);
  if (slug === section) {
    return { slug, sections: await readProductContext(project) };
  }
  const destinationPath = path.join(project.planningPath, 'context', slug);
  try {
    await access(destinationPath);
    throw new PublicApiError(
      'A context folder with this name already exists.',
      409,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await rename(sectionPath, destinationPath);
  return { slug, sections: await readProductContext(project) };
}

export async function importContextDocuments(
  project: RegisteredProject,
  section: string,
  files: File[],
  overwrite = false,
) {
  const sectionPath = await resolveSectionPath(project, section);
  const existingNames = new Map(
    (await readdir(sectionPath)).map((fileName) => [
      fileName.toLowerCase(),
      fileName,
    ]),
  );
  const imports = await Promise.all(
    files.map(async (file) => {
      if (!/\.(md|markdown)$/i.test(file.name)) {
        throw new PublicApiError(
          'Only Markdown files can be imported right now.',
          400,
        );
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new PublicApiError(
          'Each Markdown file must be 2 MB or smaller.',
          400,
        );
      }
      const baseName = path.parse(path.basename(file.name)).name;
      const requestedName = `${slugify(baseName)}.md`;
      return {
        requestedName,
        fileName:
          existingNames.get(requestedName.toLowerCase()) ?? requestedName,
        content: await file.text(),
      };
    }),
  );
  const requestedNames = imports.map((entry) =>
    entry.requestedName.toLowerCase(),
  );
  if (new Set(requestedNames).size !== requestedNames.length) {
    throw new PublicApiError(
      'The import contains multiple files with the same destination name.',
      400,
    );
  }
  const conflicts = imports
    .filter((entry) => existingNames.has(entry.requestedName.toLowerCase()))
    .map((entry) => entry.fileName);
  if (conflicts.length > 0 && !overwrite) {
    throw new ContextDocumentConflictError(conflicts);
  }

  const sections = await readProductContext(project);
  if (overwrite) await replaceDocuments(sectionPath, imports);
  else await createDocuments(sectionPath, imports);

  const importedDocuments = imports.map((entry) =>
    documentFromMarkdown(entry.fileName, entry.content),
  );
  const replaced = new Set(imports.map((entry) => entry.fileName));
  const target = sections.find((current) => current.slug === section);
  const merged = buildSection(
    section,
    [
      ...(target?.documents ?? []).filter(
        (document) => !replaced.has(document.fileName),
      ),
      ...importedDocuments,
    ].sort((left, right) =>
      compareDocumentNames(left.fileName, right.fileName),
    ),
  );
  return {
    created: imports.map((entry) => entry.fileName),
    sections: target
      ? sections.map((current) => (current === target ? merged : current))
      : [...sections, merged],
  };
}

type PreparedImport = { fileName: string; content: string };

async function createDocuments(sectionPath: string, imports: PreparedImport[]) {
  const createdPaths: string[] = [];
  try {
    for (const entry of imports) {
      const destination = path.join(sectionPath, entry.fileName);
      await writeFile(destination, entry.content, { flag: 'wx' });
      createdPaths.push(destination);
    }
  } catch (error) {
    retainCleanupFailures(
      error,
      await removeAll(createdPaths),
      'Cleanup after a failed import did not complete.',
    );
    throw error;
  }
}

async function replaceDocuments(
  sectionPath: string,
  imports: PreparedImport[],
) {
  const originals = new Map<string, Buffer>();
  for (const entry of imports) {
    const destination = path.join(sectionPath, entry.fileName);
    const original = await readFile(destination).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      },
    );
    if (original) originals.set(destination, original);
  }

  const staged: Array<{ temporaryPath: string; destination: string }> = [];
  const published: string[] = [];
  try {
    for (const entry of imports) {
      const destination = path.join(sectionPath, entry.fileName);
      const temporaryPath = stagingPath(destination);
      staged.push({ temporaryPath, destination });
      await writeFile(temporaryPath, entry.content, { flag: 'wx' });
    }
    for (const { temporaryPath, destination } of staged) {
      await rename(temporaryPath, destination);
      published.push(destination);
    }
  } catch (error) {
    const unpublished = staged
      .slice(published.length)
      .map((entry) => entry.temporaryPath);
    retainCleanupFailures(
      error,
      [
        ...(await removeAll(unpublished, true)),
        ...(await restoreAll(published, originals)),
      ],
      'Restoring the previous documents after a failed import did not complete.',
    );
    throw error;
  }
}

function stagingPath(destination: string) {
  return `${destination}.${randomUUID()}.tmp`;
}

async function removeAll(paths: string[], tolerateMissing = false) {
  const outcomes = await Promise.all(
    paths.map((filePath) =>
      unlink(filePath).then(
        () => null,
        (failure: NodeJS.ErrnoException) =>
          tolerateMissing && failure.code === 'ENOENT' ? null : failure,
      ),
    ),
  );
  return outcomes.filter((failure) => failure !== null);
}

async function restoreAll(published: string[], originals: Map<string, Buffer>) {
  const outcomes = await Promise.all(
    published.map(async (destination) => {
      const original = originals.get(destination);
      try {
        if (original === undefined) {
          await unlink(destination);
        } else {
          const temporaryPath = stagingPath(destination);
          await writeFile(temporaryPath, original, { flag: 'wx' });
          await rename(temporaryPath, destination);
        }
        return null;
      } catch (failure) {
        return failure;
      }
    }),
  );
  return outcomes.filter((failure) => failure !== null);
}

export async function deleteContextDocument(
  project: RegisteredProject,
  section: string,
  fileName: string,
) {
  const sectionPath = await resolveSectionPath(project, section);
  if (
    path.basename(fileName) !== fileName ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(md|markdown)$/i.test(fileName)
  ) {
    throw new PublicApiError('Markdown document name is invalid.', 400);
  }
  await unlink(path.join(sectionPath, fileName));
  return { sections: await readProductContext(project) };
}

async function resolveSectionPath(project: RegisteredProject, section: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(section)) {
    throw new PublicApiError('Context section is invalid.', 400);
  }
  const sectionPath = path.join(project.planningPath, 'context', section);
  const entries = await readdir(sectionPath).catch(() => null);
  if (!entries) throw new PublicApiError('Context section was not found.', 404);
  return sectionPath;
}

async function writeUniqueMarkdown(
  sectionPath: string,
  baseName: string,
  content: string,
) {
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const fileName =
      suffix === 1 ? `${baseName}.md` : `${baseName}-${suffix}.md`;
    try {
      await writeFile(path.join(sectionPath, fileName), content, {
        flag: 'wx',
      });
      return fileName;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not choose a unique Markdown file name.');
}

function slugify(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  );
}

function readTitle(markdown: string, fallback: string) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return fallback
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function readSummary(markdown: string) {
  return (
    markdown
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph && !paragraph.startsWith('#')) ??
    'No section guidance yet.'
  );
}
