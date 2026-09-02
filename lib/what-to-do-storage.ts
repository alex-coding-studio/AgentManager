import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from './project-registry.ts';

const runIdPattern = /^RUN-[0-9a-f-]{36}$/;

export function assertWhatToDoRunId(runId: string) {
  if (!runIdPattern.test(runId)) throw new Error('Invalid What to Do Run.');
}

export async function whatToDoDirectory(
  project: RegisteredProject,
  parts: string[] = [],
  create = false,
) {
  let current = await realpath(project.planningPath);
  const segments = ['what-to-do', ...parts];
  for (const [index, part] of segments.entries()) {
    if (!/^[a-zA-Z0-9._-]+$/.test(part) || part === '.' || part === '..')
      throw new Error('Invalid What to Do storage path.');
    const next = path.join(current, part);
    try {
      const info = await lstat(next);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('Invalid What to Do storage directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (!create) return path.join(next, ...segments.slice(index + 1));
      await mkdir(next);
    }
    current = next;
  }
  return current;
}

export async function readWhatToDoRepositorySummary(
  project: RegisteredProject,
) {
  const directory = await whatToDoDirectory(project, ['repository-context']);
  const file = path.join(directory, 'summary.md');
  const metadataFile = path.join(directory, 'summary.json');
  try {
    const [info, metadataInfo] = await Promise.all([
      lstat(file),
      lstat(metadataFile),
    ]);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > 512 * 1024 ||
      !metadataInfo.isFile() ||
      metadataInfo.isSymbolicLink() ||
      metadataInfo.size > 16 * 1024
    )
      throw new Error('Invalid What to Do Repository Summary.');
    const [markdown, metadataText] = await Promise.all([
      readFile(file, 'utf8'),
      readFile(metadataFile, 'utf8'),
    ]);
    const metadata = JSON.parse(metadataText) as unknown;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('schemaVersion' in metadata) ||
      metadata.schemaVersion !== 1 ||
      !('repositoryFingerprint' in metadata) ||
      typeof metadata.repositoryFingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/.test(metadata.repositoryFingerprint) ||
      !('markdownSha256' in metadata) ||
      typeof metadata.markdownSha256 !== 'string' ||
      metadata.markdownSha256 !==
        createHash('sha256').update(markdown).digest('hex')
    )
      throw new Error('Invalid What to Do Repository Summary metadata.');
    return { markdown, repositoryFingerprint: metadata.repositoryFingerprint };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function whatToDoRunDirectory(
  project: RegisteredProject,
  runId: string,
  create = false,
) {
  assertWhatToDoRunId(runId);
  return whatToDoDirectory(project, ['runs', runId], create);
}

export async function stageWhatToDoRunDirectory(
  project: RegisteredProject,
  runId: string,
) {
  assertWhatToDoRunId(runId);
  const parent = await whatToDoDirectory(project, ['runs'], true);
  const finalPath = path.join(parent, runId);
  const stagingPath = path.join(
    parent,
    `.${runId}-${randomUUID().slice(0, 8)}.tmp`,
  );
  await mkdir(stagingPath);
  let published = false;
  return {
    stagingPath,
    finalPath,
    async publish() {
      await rename(stagingPath, finalPath);
      published = true;
      return finalPath;
    },
    async cleanup() {
      if (!published) await rm(stagingPath, { recursive: true, force: true });
    },
  };
}
