import { validateAgentProfile, type AgentProfile } from '@/lib/agent-profile';
import { apiErrorResponse } from '@/lib/api-errors';
import {
  cancelDomainModelRun,
  listLatestDomainModelRuns,
  readDomainModelRun,
  startDomainModelRun,
} from '@/lib/domain-model-runs';
import { getProject } from '@/lib/project-registry';
import { guardJsonRequest } from '@/lib/request-boundary';

export const runtime = 'nodejs';

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
        ? { run: await readDomainModelRun(project, runId) }
        : { runs: await listLatestDomainModelRuns(project) },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return Response.json(
        { error: 'Agent Run was not found.' },
        { status: 404 },
      );
    return apiErrorResponse(
      error,
      'Could not read the Domain Model Run.',
      'GET /api/projects/[projectId]/domain-model-runs',
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
    const input = (await request.json()) as {
      instruction?: unknown;
      selectedIds?: unknown;
      profile?: AgentProfile;
    };
    if (
      typeof input.instruction !== 'string' ||
      !Array.isArray(input.selectedIds) ||
      !input.selectedIds.every((item) => typeof item === 'string') ||
      !input.profile
    )
      return Response.json(
        { error: 'A Domain Model instruction and Agent profile are required.' },
        { status: 400 },
      );
    validateAgentProfile(input.profile);
    const run = await startDomainModelRun(project, {
      instruction: input.instruction,
      selectedIds: input.selectedIds,
      profile: input.profile,
    });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not start the Domain Model Agent.',
      'POST /api/projects/[projectId]/domain-model-runs',
    );
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
    const input = (await request.json()) as { runId?: unknown };
    if (typeof input.runId !== 'string')
      return Response.json(
        { error: 'A Domain Model Run identifier is required.' },
        { status: 400 },
      );
    return Response.json({
      run: await cancelDomainModelRun(project, input.runId),
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not cancel the Domain Model Agent.',
      'DELETE /api/projects/[projectId]/domain-model-runs',
    );
  }
}
