import { getProject } from '@/lib/project-registry';
import { guardRequest } from '@/lib/request-boundary';

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

  return Response.json(
    {
      error:
        'Product Context is system-managed and cannot be initialized manually.',
    },
    { status: 410 },
  );
}
