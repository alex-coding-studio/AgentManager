import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import {
  assertGraphRoot,
  createStartNode,
  deleteTaskGraphNode,
  updateStartNode,
} from '@/lib/graph/task/model';
import { NodeReferencedError } from '@/lib/graph/task/rules';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const title = formData.get('title');
    const contextRefs = formData
      .getAll('contextRefs')
      .filter((entry): entry is string => typeof entry === 'string');
    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File);
    if (typeof title !== 'string') {
      return Response.json(
        { error: 'A start-node title is required.' },
        { status: 400 },
      );
    }
    const idea = formData.get('idea');
    const result = await createStartNode(
      project,
      {
        title,
        contextRefs,
        files,
        idea: typeof idea === 'string' ? idea : undefined,
      },
      assertGraphRoot(formData.get('graph') ?? undefined),
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not create the start node.',
      'POST /api/projects/[projectId]/nodes',
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardRequest(request);
  if (denied) return denied;
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const id = formData.get('id');
    const title = formData.get('title');
    const contextRefs = formData
      .getAll('contextRefs')
      .filter((entry): entry is string => typeof entry === 'string');
    const retainedAttachmentRefs = formData
      .getAll('retainedAttachmentRefs')
      .filter((entry): entry is string => typeof entry === 'string');
    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File);
    if (typeof id !== 'string' || typeof title !== 'string') {
      return Response.json(
        { error: 'A start node and title are required.' },
        { status: 400 },
      );
    }
    const idea = formData.get('idea');
    const result = await updateStartNode(
      project,
      {
        id,
        title,
        contextRefs,
        retainedAttachmentRefs,
        files,
        idea: typeof idea === 'string' ? idea : undefined,
      },
      assertGraphRoot(formData.get('graph') ?? undefined),
    );
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not update the start node.',
      'PATCH /api/projects/[projectId]/nodes',
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const payload = (await request.json()) as {
      id?: unknown;
      graph?: unknown;
    };
    if (typeof payload.id !== 'string') {
      return Response.json({ error: 'A node is required.' }, { status: 400 });
    }
    return Response.json(
      await deleteTaskGraphNode(
        project,
        payload.id,
        assertGraphRoot(payload.graph),
      ),
    );
  } catch (error) {
    if (error instanceof NodeReferencedError)
      return Response.json(
        { error: error.message, blockerNodeIds: error.blockerNodeIds },
        { status: error.status },
      );
    return apiErrorResponse(
      error,
      'Could not delete the node.',
      'DELETE /api/projects/[projectId]/nodes',
    );
  }
}
