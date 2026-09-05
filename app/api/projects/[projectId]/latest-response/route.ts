import { apiErrorResponse } from '@/lib/api-errors';
import { isResponseModule } from '@/lib/execution-observability/types';
import { readModuleLatestResponse } from '@/lib/latest-response-service';
import { readCardLatestResponse } from '@/lib/modules/implementation/execution-response';
import { assertCardUuid } from '@/lib/modules/implementation/harness';
import { planningService } from '@/lib/modules/implementation/planning-service';
import { getProject } from '@/lib/project-registry';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const project = await getProject((await params).projectId);
    if (!project)
      return Response.json({ error: 'Project not found.' }, { status: 404 });
    const search = new URL(request.url).searchParams;
    const cardId = search.get('card');
    if (cardId) {
      assertCardUuid(cardId);
      const card = await planningService.read(project, cardId);
      return Response.json(
        { response: await readCardLatestResponse(project, card) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const owner = search.get('module');
    if (!isResponseModule(owner))
      return Response.json({ error: 'Unknown module.' }, { status: 400 });
    return Response.json(
      { response: await readModuleLatestResponse(project, owner) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not read the Latest Response.',
      'GET /api/projects/[projectId]/latest-response',
    );
  }
}
