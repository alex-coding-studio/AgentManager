import {
  createProject,
  listProjects,
  type ProjectKind,
} from '@/lib/project-registry';
import { apiErrorResponse } from '@/lib/api-errors';
import { guardJsonRequest } from '@/lib/request-boundary';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ projects: await listProjects() });
}

export async function POST(request: Request) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as {
      kind?: ProjectKind;
      name?: string;
      description?: string;
      rootPath?: string;
    };
    const name = payload.name?.trim();
    if (!name) {
      return Response.json(
        { error: 'Project name is required.' },
        { status: 400 },
      );
    }
    if (name.length > 120) {
      return Response.json(
        { error: 'Project name must be 120 characters or fewer.' },
        { status: 400 },
      );
    }
    const description = payload.description?.trim() ?? '';
    if (description.length > 600) {
      return Response.json(
        { error: 'Description must be 600 characters or fewer.' },
        { status: 400 },
      );
    }
    if (payload.kind !== 'standalone' && payload.kind !== 'repository') {
      return Response.json(
        { error: 'Project kind is invalid.' },
        { status: 400 },
      );
    }

    const project = await createProject({
      kind: payload.kind,
      name,
      description,
      rootPath: payload.rootPath,
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not create project.',
      'POST /api/projects',
    );
  }
}
