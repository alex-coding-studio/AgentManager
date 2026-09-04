import { apiErrorResponse } from '@/lib/api-errors';
import { getProject } from '@/lib/project-registry';
import { guardRequest } from '@/lib/request-boundary';
import { syncProjectMain } from '@/lib/modules/implementation/sync-main';

export const runtime = 'nodejs';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    return Response.json(
      await syncProjectMain(project.codePath ?? project.rootPath),
    );
  } catch (error) {
    return apiErrorResponse(error, 'Could not sync main.', 'POST sync-main');
  }
}
