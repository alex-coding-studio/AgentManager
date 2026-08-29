import { getProject } from '@/lib/project-registry';
import {
  acceptWhatsNextCandidate,
  cancelWhatsNextRun,
  discardWhatsNextCandidate,
  listLatestWhatsNextRuns,
  readWhatsNextRun,
  startWhatsNextRun,
} from '@/lib/whats-next-runs';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await resolveProject(params);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const instruction = formData.get('instruction');
    const agent = formData.get('agent');
    const revisionRunId = formData.get('revisionRunId');
    const revisionCandidateId = formData.get('revisionCandidateId');
    const sourceNodeIds = formData
      .getAll('sourceNodeIds')
      .filter((entry): entry is string => typeof entry === 'string');
    if (sourceNodeIds.length === 0 || typeof instruction !== 'string') {
      return Response.json(
        { error: 'At least one origin Node and an Instruction are required.' },
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
    const run = await startWhatsNextRun(project, {
      sourceNodeIds,
      agent,
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
    });
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not start the Agent Run.';
    return Response.json(
      { error: message },
      { status: /already has an active/.test(message) ? 409 : 400 },
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
      return Response.json({ runs: await listLatestWhatsNextRuns(project) });
    }
    return Response.json({ run: await readWhatsNextRun(project, runId) });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const message =
      error instanceof Error ? error.message : 'Could not read the Agent Run.';
    return Response.json(
      { error: message },
      { status: nodeError.code === 'ENOENT' ? 404 : 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
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
    const message =
      error instanceof Error
        ? error.message
        : 'Could not cancel the Agent Run.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
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
    const message =
      error instanceof Error
        ? error.message
        : 'Could not update the Candidate.';
    return Response.json({ error: message }, { status: 400 });
  }
}

async function resolveProject(params: Promise<{ projectId: string }>) {
  const { projectId } = await params;
  return getProject(projectId);
}
