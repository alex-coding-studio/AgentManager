import { getProject } from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest } from '@/lib/request-boundary';
import {
  createContextSection,
  renameContextSection,
} from '@/lib/product-context';

export const runtime = 'nodejs';

export async function POST(
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
    return apiErrorResponse(
      error,
      'Could not create the folder.',
      'POST /api/projects/[projectId]/context/sections',
    );
  }
}

export async function PATCH(
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
    return apiErrorResponse(
      error,
      'Could not rename the folder.',
      'PATCH /api/projects/[projectId]/context/sections',
    );
  }
}
