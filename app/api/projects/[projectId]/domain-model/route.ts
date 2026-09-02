import { apiErrorResponse } from '@/lib/api-errors';
import {
  readDomainModelView,
  undoLastDomainModelChange,
} from '@/lib/domain-model';
import { getProject } from '@/lib/project-registry';
import { guardJsonRequest } from '@/lib/request-boundary';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    return Response.json(await readDomainModelView(project));
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not read the Domain Model.',
      'GET /api/projects/[projectId]/domain-model',
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const input = (await request.json()) as { action?: unknown };
    if (input.action !== 'undo')
      return Response.json(
        { error: 'Unknown Domain Model operation.' },
        { status: 400 },
      );
    return Response.json(await undoLastDomainModelChange(project));
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not update the Domain Model.',
      'POST /api/projects/[projectId]/domain-model',
    );
  }
}
