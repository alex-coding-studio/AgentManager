import { getProject } from '@/lib/project-registry';
import { createStartNode, updateStartNode } from '@/lib/task-graph';
import { CanvasStartConflictError } from '@/lib/task-graph-rules';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
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
    const result = await createStartNode(project, {
      title,
      contextRefs,
      files,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not create the start node.';
    return Response.json(
      { error: message },
      { status: error instanceof CanvasStartConflictError ? 409 : 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
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
    const result = await updateStartNode(project, {
      id,
      title,
      contextRefs,
      retainedAttachmentRefs,
      files,
    });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not update the start node.';
    return Response.json({ error: message }, { status: 400 });
  }
}
