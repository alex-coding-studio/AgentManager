import { execFile } from 'node:child_process';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { guardJsonRequest } from '@/lib/request-boundary';
import { getProject } from '@/lib/project-registry';
import {
  apiErrorResponse,
  PublicApiError,
  isCancellationError,
} from '@/lib/api-errors';

export const runtime = 'nodejs';
const execute = promisify(execFile);
export async function POST(request: Request) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  try {
    const input = (await request.json()) as {
      path?: string;
      projectId?: string;
    };
    let selected = input.path?.trim();
    if (!selected) {
      if (process.platform !== 'darwin')
        throw new PublicApiError(
          'Paste the file path on the Praxis host.',
          400,
        );
      selected = (
        await execute('osascript', [
          '-e',
          'POSIX path of (choose file with prompt "Choose a local reference file")',
        ])
      ).stdout.trim();
    }
    if (selected.startsWith('file:')) selected = fileURLToPath(selected);
    const project = input.projectId ? await getProject(input.projectId) : null;
    if (!path.isAbsolute(selected) && !project)
      throw new PublicApiError('A relative path requires a project.', 400);
    const absolute = path.resolve(
      project?.codePath ?? project?.rootPath ?? process.cwd(),
      selected,
    );
    const info = await stat(absolute);
    if (!info.isFile()) throw new PublicApiError('Select a local file.', 400);
    if (!/\.(md|markdown|txt|html|htm)$/i.test(absolute))
      throw new PublicApiError('Select a Markdown, text or HTML file.', 400);
    await realpath(absolute);
    return Response.json({
      name: path.basename(absolute),
      content: `# Local file reference\n\nOriginal path: ${JSON.stringify(absolute)}\nBase directory for relative dependencies: ${JSON.stringify(path.dirname(absolute))}\n\nThis attachment contains only a reference, not the document contents. Read or open the original file at its original location. Resolve HTML stylesheets, images and other relative dependencies from that directory.\n`,
    });
  } catch (error) {
    if (isCancellationError(error)) return Response.json({ cancelled: true });
    return apiErrorResponse(
      error,
      'Could not reference the local file.',
      'POST local-file-reference',
    );
  }
}
