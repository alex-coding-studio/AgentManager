import { readAgentGraphInputPacket } from '@/lib/agent-graph-input';
import { apiErrorResponse } from '@/lib/api-errors';
import { getProject } from '@/lib/project-registry';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import {
  cancelWhatToDoRun,
  listLatestWhatToDoRuns,
  readWhatToDoRun,
  startWhatToDoRun,
} from '@/lib/what-to-do-runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const formData = await request.formData();
    const input = readAgentGraphInputPacket(formData);
    const sourceUids = formData
      .getAll('sourceUids')
      .filter((entry): entry is string => typeof entry === 'string');
    const repositoryEvidencePaths = formData
      .getAll('repositoryEvidencePaths')
      .filter((entry): entry is string => typeof entry === 'string');
    const focusContractIds = formData
      .getAll('focusContractIds')
      .filter((entry): entry is string => typeof entry === 'string');
    return Response.json(
      {
        run: await startWhatToDoRun(project, {
          instruction: input.instruction,
          sourceUids,
          profile: input.profile,
          contextRefs: input.contextRefs,
          files: input.files,
          repositoryEvidencePaths,
          focusContractIds,
        }),
      },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const runId = new URL(request.url).searchParams.get('runId');
    return Response.json(
      runId
        ? { run: await readWhatToDoRun(project, runId) }
        : { runs: await listLatestWhatToDoRuns(project) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const payload = (await request.json()) as { runId?: unknown };
    if (typeof payload.runId !== 'string')
      return Response.json(
        { error: 'A What to Do Run identifier is required.' },
        { status: 400 },
      );
    return Response.json({
      run: await cancelWhatToDoRun(project, payload.runId),
    });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return apiErrorResponse(
    error,
    'What to Do request failed.',
    '/api/projects/[projectId]/what-to-do-runs',
  );
}
