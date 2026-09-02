import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { getProject } from '@/lib/project-registry';
import { guardRequest } from '@/lib/request-boundary';

export const runtime = 'nodejs';

const execute = promisify(execFile);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  const directory = await stat(project.rootPath).catch(() => null);
  if (!directory?.isDirectory())
    return Response.json(
      { error: 'Project location was not found.' },
      { status: 404 },
    );

  try {
    if (process.platform === 'darwin')
      await execute('open', [project.rootPath]);
    else if (process.platform === 'win32')
      await execute('explorer.exe', [project.rootPath]);
    else if (process.platform === 'linux')
      await execute('xdg-open', [project.rootPath]);
    else
      return Response.json(
        { error: 'Opening the system file manager is unsupported.' },
        { status: 501 },
      );
    return Response.json({ opened: true });
  } catch {
    return Response.json(
      { error: 'Could not open the system file manager.' },
      { status: 500 },
    );
  }
}
