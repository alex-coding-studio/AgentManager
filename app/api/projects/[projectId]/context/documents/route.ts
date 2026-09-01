import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest, guardRequest } from '@/lib/request-boundary';
import {
  ContextDocumentConflictError,
  createContextDocument,
  deleteContextDocument,
  importContextDocuments,
} from '@/lib/product-context';

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
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const section = formData.get('section');
      const files = formData
        .getAll('files')
        .filter((entry): entry is File => entry instanceof File);
      const overwrite = formData.get('overwrite') === 'true';
      if (typeof section !== 'string' || files.length === 0) {
        return Response.json(
          { error: 'A context section and at least one file are required.' },
          { status: 400 },
        );
      }
      if (files.length > 20) {
        return Response.json(
          { error: 'Import no more than 20 files at once.' },
          { status: 400 },
        );
      }
      const result = await importContextDocuments(
        project,
        section,
        files,
        overwrite,
      );
      return Response.json(result, { status: 201 });
    }

    const jsonDenied = guardJsonRequest(request);
    if (jsonDenied) return jsonDenied;
    const payload = (await request.json()) as {
      section?: string;
      title?: string;
    };
    const title = payload.title?.trim();
    if (!payload.section || !title) {
      return Response.json(
        { error: 'A context section and document title are required.' },
        { status: 400 },
      );
    }
    if (title.length > 120) {
      return Response.json(
        { error: 'Document title must be 120 characters or fewer.' },
        { status: 400 },
      );
    }
    const result = await createContextDocument(project, payload.section, title);
    return Response.json(
      { created: [result.fileName], sections: result.sections },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ContextDocumentConflictError) {
      return Response.json(
        { error: error.message, conflicts: error.conflicts },
        { status: 409 },
      );
    }
    return apiErrorResponse(
      error,
      'Could not add the document.',
      'POST /api/projects/[projectId]/context/documents',
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
      section?: string;
      fileName?: string;
    };
    if (!payload.section || !payload.fileName) {
      return Response.json(
        { error: 'A context section and document name are required.' },
        { status: 400 },
      );
    }
    const result = await deleteContextDocument(
      project,
      payload.section,
      payload.fileName,
    );
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not delete the document.',
      'DELETE /api/projects/[projectId]/context/documents',
    );
  }
}
