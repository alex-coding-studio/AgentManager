import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from '@/lib/project-registry';

export type WhatsNextAttachment = {
  fileName: string;
  path: string;
  format: 'markdown' | 'json';
  size: number;
};

export type WhatsNextContext = {
  instructions: string;
  attachments: WhatsNextAttachment[];
};

export async function readWhatsNextContext(
  project: RegisteredProject,
): Promise<WhatsNextContext> {
  const contextPath = featureContextPath(project);
  const instructions = await readFile(
    path.join(contextPath, 'instructions.md'),
    'utf8',
  ).catch(() => '');
  return { instructions, attachments: await listAttachments(project) };
}

export async function readWhatsNextAttachment(
  project: RegisteredProject,
  fileName: string,
) {
  const validFileName = validateAttachmentName(fileName);
  const content = await readFile(
    path.join(featureContextPath(project), 'attachments', validFileName),
    'utf8',
  );
  return {
    fileName: validFileName,
    format: attachmentFormat(validFileName),
    content,
  };
}

async function listAttachments(project: RegisteredProject) {
  const attachmentsPath = path.join(featureContextPath(project), 'attachments');
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
        path: `whats-next/attachments/${fileName}`,
        format: attachmentFormat(fileName),
        size: fileStat.size,
      } satisfies WhatsNextAttachment;
    }),
  );
}

function featureContextPath(project: RegisteredProject) {
  return path.join(project.planningPath, 'whats-next');
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
