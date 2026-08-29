import { getProject } from '@/lib/project-registry';
import { initializeProductContext } from '@/lib/product-context';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const sections = await initializeProductContext(project);
    return Response.json({ sections });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not initialize Product Context.';
    return Response.json({ error: message }, { status: 500 });
  }
}
