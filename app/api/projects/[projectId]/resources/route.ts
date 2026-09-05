import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { readTaskGraphMarkdownResource } from '@/lib/graph/task/nodes';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const resourcePath = new URL(request.url).searchParams.get('path');
    if (!resourcePath) {
      return Response.json(
        { error: 'A source document path is required.' },
        { status: 400 },
      );
    }
    return Response.json(
      await readTaskGraphMarkdownResource(project, resourcePath),
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not read the source document.',
      'GET /api/projects/[projectId]/resources',
    );
  }
}
