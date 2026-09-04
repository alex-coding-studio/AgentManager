import { getProject } from '@/lib/project-registry';
import { planningService } from '@/lib/modules/implementation/planning-service';
import { contractDeliveryStates } from '@/lib/modules/delivery-planning/completion';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const [cards, sources] = await Promise.all([
      planningService.list(project),
      planningService.sources(project),
    ]);
    return Response.json(
      { states: contractDeliveryStates(cards, sources) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not load contract completion.',
      'GET contract-completion',
    );
  }
}
