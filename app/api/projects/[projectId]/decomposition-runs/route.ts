import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import { readAgentProfile } from '@/lib/agent-profile';
import {
  acceptTaskDecompositionCandidate,
  cancelTaskDecompositionRun,
  discardTaskDecompositionCandidate,
  listLatestTaskDecompositionRuns,
  readTaskDecompositionRun,
  startTaskDecompositionRun,
} from '@/lib/task-decomposition-runs';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const project = await resolveProject(params);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const sourceNodeId = formData.get('sourceNodeId');
    const instruction = formData.get('instruction');
    const agent = formData.get('agent');
    const revisionRunId = formData.get('revisionRunId');
    const revisionCandidateId = formData.get('revisionCandidateId');
    const operation = formData.get('operation');
    if (typeof sourceNodeId !== 'string' || typeof instruction !== 'string') {
      return Response.json(
        { error: 'A source Node and Instruction are required.' },
        { status: 400 },
      );
    }
    if (agent !== 'codex' && agent !== 'claude') {
      return Response.json(
        { error: 'This MVP currently supports Codex and Claude only.' },
        { status: 400 },
      );
    }
    const contextRefs = formData
      .getAll('contextRefs')
      .filter((entry): entry is string => typeof entry === 'string');
    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File);
    const profile = readAgentProfile(formData);
    const run = await startTaskDecompositionRun(project, {
      sourceNodeId,
      agent,
      model: profile.model,
      effort: profile.effort,
      instruction,
      contextRefs,
      files,
      revisionRunId:
        typeof revisionRunId === 'string' && revisionRunId
          ? revisionRunId
          : undefined,
      revisionCandidateId:
        typeof revisionCandidateId === 'string' && revisionCandidateId
          ? revisionCandidateId
          : undefined,
      operation:
        operation === 'append-candidates' ? 'append-candidates' : 'propose',
    });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not start the Agent Run.',
      'POST /api/projects/[projectId]/decomposition-runs',
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await resolveProject(params);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const runId = new URL(request.url).searchParams.get('runId');
    if (!runId) {
      return Response.json({
        runs: await listLatestTaskDecompositionRuns(project),
      });
    }
    return Response.json({
      run: await readTaskDecompositionRun(project, runId),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return Response.json(
        { error: 'Agent Run was not found.' },
        { status: 404 },
      );
    return apiErrorResponse(
      error,
      'Could not read the Agent Run.',
      'GET /api/projects/[projectId]/decomposition-runs',
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await resolveProject(params);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const payload = (await request.json()) as { runId?: unknown };
    if (typeof payload.runId !== 'string') {
      return Response.json(
        { error: 'An Agent Run identifier is required.' },
        { status: 400 },
      );
    }
    return Response.json({
      run: await cancelTaskDecompositionRun(project, payload.runId),
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not cancel the Agent Run.',
      'DELETE /api/projects/[projectId]/decomposition-runs',
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await resolveProject(params);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const payload = (await request.json()) as {
      action?: unknown;
      runId?: unknown;
      candidateId?: unknown;
    };
    if (
      !['accept', 'discard'].includes(String(payload.action)) ||
      typeof payload.runId !== 'string' ||
      typeof payload.candidateId !== 'string'
    ) {
      return Response.json(
        { error: 'A valid Candidate action is required.' },
        { status: 400 },
      );
    }
    return Response.json(
      payload.action === 'accept'
        ? await acceptTaskDecompositionCandidate(
            project,
            payload.runId,
            payload.candidateId,
          )
        : await discardTaskDecompositionCandidate(
            project,
            payload.runId,
            payload.candidateId,
          ),
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not update the Candidate.',
      'PATCH /api/projects/[projectId]/decomposition-runs',
    );
  }
}

async function resolveProject(params: Promise<{ projectId: string }>) {
  const { projectId } = await params;
  return getProject(projectId);
}
