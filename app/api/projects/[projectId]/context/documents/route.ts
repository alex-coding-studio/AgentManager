import { getProject } from '@/lib/project-registry';
import {
  createContextDocument,
  importContextDocuments,
} from '@/lib/product-context';

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
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const section = formData.get('section');
      const files = formData
        .getAll('files')
        .filter((entry): entry is File => entry instanceof File);
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
      const result = await importContextDocuments(project, section, files);
      return Response.json(result, { status: 201 });
    }

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
    const message =
      error instanceof Error ? error.message : 'Could not add the document.';
    return Response.json({ error: message }, { status: 400 });
  }
}
