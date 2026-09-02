import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { PublicApiError } from './api-errors.ts';
import type { RegisteredProject } from './project-registry.ts';

export async function domainModelDirectory(
  project: RegisteredProject,
  segments: string[] = [],
  create = true,
) {
  if (segments.some((segment) => !/^[a-zA-Z0-9-]+$/.test(segment)))
    throw new PublicApiError('Invalid Domain Model storage path.', 400);
  const planningRoot = await realpath(project.planningPath);
  let directory = planningRoot;
  for (const segment of ['domain-model', ...segments]) {
    directory = path.join(directory, segment);
    if (create)
      await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    const resolved = await realpath(directory);
    if (resolved !== directory)
      throw new PublicApiError('Domain Model storage is not available.', 409);
  }
  return directory;
}

export async function domainModelFile(
  project: RegisteredProject,
  segments: string[],
  name: string,
) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name))
    throw new PublicApiError('Invalid Domain Model storage path.', 400);
  const file = path.join(
    await domainModelDirectory(project, segments, false),
    name,
  );
  if ((await realpath(file)) !== file)
    throw new PublicApiError('Domain Model storage is not available.', 409);
  return file;
}
