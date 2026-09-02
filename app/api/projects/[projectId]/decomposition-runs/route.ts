import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import { readAgentGraphInputPacket } from '@/lib/agent-graph-input';
import type { TaskDecompositionIntention } from '@/lib/task-decomposition-intention';
import type { TaskDecompositionMotion } from '@/lib/task-decomposition-motion';
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
    const input = readAgentGraphInputPacket(formData, {
      instructionRequired: false,
    });
    const revisionRunId = formData.get('revisionRunId');
    const revisionCandidateId = formData.get('revisionCandidateId');
    const operation = formData.get('operation');
    const intention = formData.get('intention');
    const motion = formData.get('motion');
    const recomposeCandidateIds = formData
      .getAll('recomposeCandidateIds')
      .filter((value): value is string => typeof value === 'string');
    if (typeof sourceNodeId !== 'string') {
      return Response.json(
        { error: 'A source Node is required.' },
        { status: 400 },
      );
    }
    const run = await startTaskDecompositionRun(project, {
      sourceNodeId,
      agent: input.profile.agent,
      model: input.profile.model,
      effort: input.profile.effort,
      instruction: input.instruction,
      contextRefs: input.contextRefs,
      files: input.files,
      intention:
        typeof intention === 'string'
          ? (intention as TaskDecompositionIntention)
          : undefined,
      motion:
        typeof motion === 'string'
          ? (motion as TaskDecompositionMotion)
          : undefined,
      recomposeCandidateIds,
      revisionRunId:
        typeof revisionRunId === 'string' && revisionRunId
          ? revisionRunId
          : undefined,
      revisionCandidateId:
        typeof revisionCandidateId === 'string' && revisionCandidateId
          ? revisionCandidateId
          : undefined,
      operation:
        recomposeCandidateIds.length > 0
          ? undefined
          : operation === 'append-candidates'
            ? 'append-candidates'
            : 'propose',
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
