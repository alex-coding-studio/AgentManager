import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardRequest } from '@/lib/request-boundary';
import { initializeProductContext } from '@/lib/product-context';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const sections = await initializeProductContext(project);
    return Response.json({ sections });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not initialize Product Context.',
      'POST /api/projects/[projectId]/context/initialize',
    );
  }
}
