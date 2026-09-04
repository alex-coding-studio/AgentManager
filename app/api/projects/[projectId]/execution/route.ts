import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest } from '@/lib/request-boundary';
import { executionService } from '@/lib/modules/implementation/execution-service';

export const runtime = 'nodejs';

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
    const text = await request.text();
    if (Buffer.byteLength(text) > 1_100_000)
      throw new Error('Execution request is too large.');
    const input = JSON.parse(text);
    if (input.action === 'preview-reset' || input.action === 'reset') {
      if (
        input.action === 'reset' &&
        (typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token))
      )
        throw new Error('Preview and confirm the reset first.');
      return Response.json(
        await executionService.resetWorkspace(
          project,
          input.cardId,
          input.expectedRevision,
          input.action === 'reset' ? input.token : undefined,
        ),
      );
    }
    if (input.action === 'preview-replan' || input.action === 'replan') {
      if (
        input.action === 'replan' &&
        (typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token))
      )
        throw new Error('Preview and confirm the return first.');
      return Response.json(
        await executionService.reopenPlanFromBase(
          project,
          input.cardId,
          input.expectedRevision,
          input.action === 'replan' ? input.token : undefined,
        ),
      );
    }
    if (input.action === 'open-workspace')
      return Response.json({
        card: await executionService.openWorkspace(
          project,
          input.cardId,
          input.expectedRevision,
        ),
      });
    if (input.action === 'undo-action')
      return Response.json({
        card: await executionService.undoAction(
          project,
          input.cardId,
          input.actionId,
          input.expectedRevision,
        ),
      });
    if (input.action === 'override-check')
      return Response.json({
        card: await executionService.overrideRequiredCheck(
          project,
          input.cardId,
          input.expectedRevision,
          input.criterionId,
          input.note,
        ),
      });
    if (input.action === 'start')
      return Response.json(
        { card: await executionService.start(project, input) },
        { status: 202 },
      );
    if (input.action === 'recheck-output')
      return Response.json({
        card: await executionService.recheckOutput(
          project,
          input.cardId,
          input.expectedRevision,
          input.outputId,
        ),
      });
    if (input.action === 'refresh-github')
      return Response.json({
        card: await executionService.refreshGitHub(
          project,
          input.cardId,
          input.expectedRevision,
          input.outputId,
        ),
      });
    if (input.action === 'cancel' || input.action === 'accept')
      return Response.json({
        card: await executionService.update(
          project,
          input.cardId,
          input.expectedRevision,
          input.action,
          input.outputId,
        ),
      });
    throw new Error('Unknown execution operation.');
  } catch (error) {
    return apiErrorResponse(
      error,
      'Execution failed.',
      'POST /api/projects/[projectId]/execution',
    );
  }
}
