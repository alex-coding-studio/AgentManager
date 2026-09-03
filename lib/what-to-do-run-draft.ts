import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { RegisteredProject } from './project-registry.ts';
import { resolvePlanningPath } from './planning-paths.ts';
import {
  instructionFromWhatToDoMarkdown,
  whatToDoRunContextResourcePath,
  type WhatToDoDraft,
} from './what-to-do-draft.ts';
import type { WhatToDoRunRecord } from './what-to-do-runs.ts';

export async function readWhatToDoRunDraft(
  project: RegisteredProject,
  run: WhatToDoRunRecord,
): Promise<WhatToDoDraft> {
  const input = run.request.content.input;
  if (!input) throw new Error('The What to Do Run has no User Input.');
  const entries = [input, ...run.request.content.external];
  const resources = await Promise.all(
    entries.map(async (entry) => {
      const resolved = await resolvePlanningPath(
        project,
        whatToDoRunContextResourcePath(run.id, entry.workspacePath),
        {
          require: 'file',
          maxBytes: 2 * 1024 * 1024,
          within: 'what-to-do/runs',
        },
      );
      const content = await readFile(resolved.absolutePath, 'utf8');
      if (createHash('sha256').update(content).digest('hex') !== entry.sha256)
        throw new Error('The frozen What to Do draft changed.');
      return { entry, content };
    }),
  );
  const [userInput, ...files] = resources;
  return {
    instruction: instructionFromWhatToDoMarkdown(userInput!.content),
    files: files.map(({ entry, content }) => ({
      name: entry.attachment?.originalName ?? entry.workspacePath,
      mediaType: entry.attachment?.mediaType ?? 'text/markdown',
      content,
    })),
  };
}
