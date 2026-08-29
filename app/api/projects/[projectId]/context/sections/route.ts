import { getProject } from '@/lib/project-registry';
import {
  createContextSection,
  renameContextSection,
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
    const payload = (await request.json()) as { title?: string };
    const title = payload.title?.trim();
    if (!title) {
      return Response.json(
        { error: 'A context folder name is required.' },
        { status: 400 },
      );
    }
    if (title.length > 80) {
      return Response.json(
        { error: 'Context folder name must be 80 characters or fewer.' },
        { status: 400 },
      );
    }
    const result = await createContextSection(project, title);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create the folder.';
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
    const payload = (await request.json()) as {
      section?: string;
      title?: string;
    };
    const title = payload.title?.trim();
    if (!payload.section || !title) {
      return Response.json(
        { error: 'The current folder and a new name are required.' },
        { status: 400 },
      );
    }
    if (title.length > 80) {
      return Response.json(
        { error: 'Context folder name must be 80 characters or fewer.' },
        { status: 400 },
      );
    }
    const result = await renameContextSection(project, payload.section, title);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not rename the folder.';
    return Response.json({ error: message }, { status: 400 });
  }
}
