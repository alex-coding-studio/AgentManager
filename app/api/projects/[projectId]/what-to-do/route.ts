import { apiErrorResponse } from '@/lib/api-errors';
import { getProject } from '@/lib/project-registry';
import { collectWhatToDoRepositoryFacts } from '@/lib/modules/delivery-planning/repository-facts';
import { listWhatToDoFeatureSources } from '@/lib/modules/delivery-planning/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const [features, repositoryFacts] = await Promise.all([
      listWhatToDoFeatureSources(project),
      collectWhatToDoRepositoryFacts(project),
    ]);
    return Response.json(
      { features, repositoryFacts },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not load What to Do.',
      'GET /api/projects/[projectId]/what-to-do',
    );
  }
}
