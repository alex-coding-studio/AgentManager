import { execFile } from 'node:child_process';
import { guardJsonRequest } from '@/lib/request-boundary';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { getProject } from '@/lib/project-registry';

export const runtime = 'nodejs';

const execute = promisify(execFile);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  const payload = (await request.json()) as { section?: string };
  if (!payload.section || !/^[a-z0-9][a-z0-9-]*$/.test(payload.section)) {
    return Response.json(
      { error: 'Context section is invalid.' },
      { status: 400 },
    );
  }

  const sectionPath = path.join(
    project.planningPath,
    'context',
    payload.section,
  );
  const directory = await stat(sectionPath).catch(() => null);
  if (!directory?.isDirectory()) {
    return Response.json(
      { error: 'Context section was not found.' },
      { status: 404 },
    );
  }

  try {
    if (process.platform === 'darwin') {
      await execute('open', [sectionPath]);
    } else if (process.platform === 'win32') {
      await execute('explorer.exe', [sectionPath]);
    } else if (process.platform === 'linux') {
      await execute('xdg-open', [sectionPath]);
    } else {
      return Response.json(
        { error: 'Opening the system file manager is unsupported.' },
        { status: 501 },
      );
    }
    return Response.json({ opened: true });
  } catch {
    return Response.json(
      { error: 'Could not open the system file manager.' },
      { status: 500 },
    );
  }
}
