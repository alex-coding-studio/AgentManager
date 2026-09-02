import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import { readAgentGraphInputPacket } from '@/lib/agent-graph-input';
import {
  acceptWhatsNextCandidate,
  cancelWhatsNextRun,
  discardWhatsNextCandidate,
  listLatestWhatsNextRuns,
  readWhatsNextRun,
  startWhatsNextRun,
  type WhatsNextFeedbackAnchor,
} from '@/lib/whats-next-runs';

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
    const input = readAgentGraphInputPacket(formData, {
      instructionRequired: false,
    });
    const revisionRunId = formData.get('revisionRunId');
    const revisionCandidateId = formData.get('revisionCandidateId');
    const redoProposal = formData.get('redoProposal') === 'true';
    const intention = formData.get('intention');
    const motion = formData.get('motion');
    const feedbackValue = formData.get('feedback');
    const sourceNodeIds = formData
      .getAll('sourceNodeIds')
      .filter((entry): entry is string => typeof entry === 'string');
    if (sourceNodeIds.length === 0) {
      return Response.json(
        { error: 'At least one origin Node is required.' },
        { status: 400 },
      );
    }
    const feedback = parseFeedback(feedbackValue);
    const run = await startWhatsNextRun(project, {
      sourceNodeIds,
      agent: input.profile.agent,
      model: input.profile.model,
      effort: input.profile.effort,
      instruction: input.instruction,
      contextRefs: input.contextRefs,
      files: input.files,
      feedback,
      redoProposal,
      intention:
        typeof intention === 'string' && intention
          ? (intention as
              | 'mvp-exploration'
              | 'feature-synthesis'
              | 'product-design-completion')
          : undefined,
      motion:
        typeof motion === 'string' && motion
          ? (motion as 'unspecified' | 'diverge' | 'converge')
          : undefined,
      revisionRunId:
        typeof revisionRunId === 'string' && revisionRunId
          ? revisionRunId
          : undefined,
      revisionCandidateId:
        typeof revisionCandidateId === 'string' && revisionCandidateId
          ? revisionCandidateId
          : undefined,
    });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not start the Agent Run.',
      'POST /api/projects/[projectId]/whats-next-runs',
    );
  }
}

function parseFeedback(value: FormDataEntryValue | null) {
  if (value === null || value === '') return [];
  if (typeof value !== 'string') {
    throw new Error('Inline feedback must be JSON.');
  }
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length > 20) {
    throw new Error('Inline feedback must contain no more than 20 items.');
  }
  return parsed as WhatsNextFeedbackAnchor[];
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
      return Response.json({ runs: await listLatestWhatsNextRuns(project) });
    }
    return Response.json({ run: await readWhatsNextRun(project, runId) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return Response.json(
        { error: 'Agent Run was not found.' },
        { status: 404 },
      );
    return apiErrorResponse(
      error,
      'Could not read the Agent Run.',
      'GET /api/projects/[projectId]/whats-next-runs',
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
      run: await cancelWhatsNextRun(project, payload.runId),
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not cancel the Agent Run.',
      'DELETE /api/projects/[projectId]/whats-next-runs',
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
        ? await acceptWhatsNextCandidate(
            project,
            payload.runId,
            payload.candidateId,
          )
        : await discardWhatsNextCandidate(
            project,
            payload.runId,
            payload.candidateId,
          ),
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not update the Candidate.',
      'PATCH /api/projects/[projectId]/whats-next-runs',
    );
  }
}

async function resolveProject(params: Promise<{ projectId: string }>) {
  const { projectId } = await params;
  return getProject(projectId);
}
