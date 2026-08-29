import { getProject } from '@/lib/project-registry';
import {
  deleteTaskDecompositionAttachment,
  importTaskDecompositionAttachments,
  readTaskDecompositionAttachment,
  saveTaskDecompositionInstructions,
  TaskDecompositionAttachmentConflictError,
} from '@/lib/task-decomposition-context';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const fileName = new URL(request.url).searchParams.get('fileName');
    if (!fileName) {
      return Response.json(
        { error: 'A context attachment name is required.' },
        { status: 400 },
      );
    }
    return Response.json(
      await readTaskDecompositionAttachment(project, fileName),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not read the context attachment.';
    return Response.json({ error: message }, { status: 400 });
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
    const payload = (await request.json()) as { instructions?: unknown };
    if (typeof payload.instructions !== 'string') {
      return Response.json(
        { error: 'Task Decomposition instructions are required.' },
        { status: 400 },
      );
    }
    return Response.json(
      await saveTaskDecompositionInstructions(project, payload.instructions),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not save Task Decomposition instructions.';
    return Response.json({ error: message }, { status: 400 });
  }
}

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
    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File);
    return Response.json(
      await importTaskDecompositionAttachments(project, files),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof TaskDecompositionAttachmentConflictError) {
      return Response.json(
        { error: error.message, conflicts: error.conflicts },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Could not add the context attachments.';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const payload = (await request.json()) as { fileName?: unknown };
    if (typeof payload.fileName !== 'string') {
      return Response.json(
        { error: 'A context attachment name is required.' },
        { status: 400 },
      );
    }
    return Response.json(
      await deleteTaskDecompositionAttachment(project, payload.fileName),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not remove the context attachment.';
    return Response.json({ error: message }, { status: 400 });
  }
}
