import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from '@/lib/project-registry';

export type TaskDecompositionAttachment = {
  fileName: string;
  path: string;
  format: 'markdown' | 'json';
  size: number;
};

export type TaskDecompositionContext = {
  initialized: boolean;
  instructions: string;
  attachments: TaskDecompositionAttachment[];
};

type TaskDecompositionSettings = {
  schemaVersion: 1;
  feature: 'task-decomposition';
  enabled: true;
  instructionsPath: 'instructions.md';
  attachmentsDirectory: 'attachments';
};

export class TaskDecompositionAttachmentConflictError extends Error {
  conflicts: string[];

  constructor(conflicts: string[]) {
    super('One or more context attachments already exist.');
    this.name = 'TaskDecompositionAttachmentConflictError';
    this.conflicts = conflicts;
  }
}

const settings: TaskDecompositionSettings = {
  schemaVersion: 1,
  feature: 'task-decomposition',
  enabled: true,
  instructionsPath: 'instructions.md',
  attachmentsDirectory: 'attachments',
};

export async function readTaskDecompositionContext(
  project: RegisteredProject,
): Promise<TaskDecompositionContext> {
  const contextPath = featureContextPath(project);
  const settingsPath = path.join(contextPath, 'settings.json');
  const storedSettings = await readFile(settingsPath, 'utf8').catch(() => null);
  if (storedSettings) validateSettings(JSON.parse(storedSettings));

  const instructions = await readFile(
    path.join(contextPath, settings.instructionsPath),
    'utf8',
  ).catch(() => '');
  const attachments = await listAttachments(project);
  return {
    initialized: storedSettings !== null,
    instructions,
    attachments,
  };
}

export async function saveTaskDecompositionInstructions(
  project: RegisteredProject,
  instructions: string,
) {
  if (instructions.length > 100_000) {
    throw new Error('Decomposition instructions must be 100 KB or smaller.');
  }
  const contextPath = await ensureFeatureContext(project);
  await writeAtomically(
    path.join(contextPath, settings.instructionsPath),
    instructions,
  );
  return readTaskDecompositionContext(project);
}

export async function importTaskDecompositionAttachments(
  project: RegisteredProject,
  files: File[],
) {
  if (files.length === 0) {
    throw new Error('Select at least one context attachment.');
  }
  if (files.length > 20) {
    throw new Error('Add no more than 20 context attachments at once.');
  }

  const prepared = await Promise.all(
    files.map(async (file) => {
      const fileName = validateAttachmentName(file.name);
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Each context attachment must be 2 MB or smaller.');
      }
      const content = await file.text();
      if (/\.json$/i.test(fileName)) {
        try {
          JSON.parse(content);
        } catch {
          throw new Error(`${fileName} is not valid JSON.`);
        }
      }
      return { fileName, content };
    }),
  );
  const duplicateNames = prepared
    .map((file) => file.fileName)
    .filter((fileName, index, names) => names.indexOf(fileName) !== index);
  if (duplicateNames.length > 0) {
    throw new TaskDecompositionAttachmentConflictError([
      ...new Set(duplicateNames),
    ]);
  }

  const contextPath = await ensureFeatureContext(project);
  const attachmentsPath = path.join(contextPath, settings.attachmentsDirectory);
  const existingNames = new Set(
    (await listAttachments(project)).map((attachment) => attachment.fileName),
  );
  const conflicts = prepared
    .map((file) => file.fileName)
    .filter((fileName) => existingNames.has(fileName));
  if (conflicts.length > 0) {
    throw new TaskDecompositionAttachmentConflictError(conflicts);
  }

  const createdPaths: string[] = [];
  try {
    for (const file of prepared) {
      const destinationPath = path.join(attachmentsPath, file.fileName);
      await writeFile(destinationPath, file.content, { flag: 'wx' });
      createdPaths.push(destinationPath);
    }
  } catch (error) {
    await Promise.all(
      createdPaths.map((filePath) => unlink(filePath).catch(() => undefined)),
    );
    throw error;
  }
  return readTaskDecompositionContext(project);
}

export async function deleteTaskDecompositionAttachment(
  project: RegisteredProject,
  fileName: string,
) {
  const validFileName = validateAttachmentName(fileName);
  const attachmentPath = path.join(
    featureContextPath(project),
    settings.attachmentsDirectory,
    validFileName,
  );
  try {
    await unlink(attachmentPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('The context attachment was not found.');
    }
    throw error;
  }
  return readTaskDecompositionContext(project);
}

export async function readTaskDecompositionAttachment(
  project: RegisteredProject,
  fileName: string,
) {
  const validFileName = validateAttachmentName(fileName);
  const content = await readFile(
    path.join(
      featureContextPath(project),
      settings.attachmentsDirectory,
      validFileName,
    ),
    'utf8',
  );
  return {
    fileName: validFileName,
    format: attachmentFormat(validFileName),
    content,
  };
}

async function ensureFeatureContext(project: RegisteredProject) {
  const contextPath = featureContextPath(project);
  await mkdir(path.join(contextPath, settings.attachmentsDirectory), {
    recursive: true,
  });
  const settingsPath = path.join(contextPath, 'settings.json');
  try {
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return contextPath;
}

async function listAttachments(project: RegisteredProject) {
  const attachmentsPath = path.join(
    featureContextPath(project),
    settings.attachmentsDirectory,
  );
  const entries = await readdir(attachmentsPath, { withFileTypes: true }).catch(
    () => [],
  );
  const fileNames = entries
    .filter(
      (entry) => entry.isFile() && /\.(md|markdown|json)$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(
    fileNames.map(async (fileName) => {
      const fileStat = await stat(path.join(attachmentsPath, fileName));
      return {
        fileName,
        path: `task-decomposition/attachments/${fileName}`,
        format: attachmentFormat(fileName),
        size: fileStat.size,
      } satisfies TaskDecompositionAttachment;
    }),
  );
}

async function writeAtomically(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

function featureContextPath(project: RegisteredProject) {
  return path.join(project.planningPath, 'task-decomposition');
}

function validateSettings(value: unknown) {
  const candidate = value as Partial<TaskDecompositionSettings>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.feature !== 'task-decomposition' ||
    candidate.enabled !== true ||
    candidate.instructionsPath !== 'instructions.md' ||
    candidate.attachmentsDirectory !== 'attachments'
  ) {
    throw new Error('Decomposition context settings are invalid.');
  }
}

function validateAttachmentName(value: string) {
  const fileName = value.normalize('NFC').trim();
  if (
    !fileName ||
    fileName.length > 160 ||
    path.basename(fileName) !== fileName ||
    fileName.includes('\0') ||
    fileName.includes('\r') ||
    fileName.includes('\n') ||
    !/\.(md|markdown|json)$/i.test(fileName)
  ) {
    throw new Error(
      'Only named Markdown or JSON context attachments are supported.',
    );
  }
  return fileName;
}

function attachmentFormat(fileName: string): 'markdown' | 'json' {
  return /\.json$/i.test(fileName) ? 'json' : 'markdown';
}
