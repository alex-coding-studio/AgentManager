import { getProject } from '@/lib/project-registry';
import { guardJsonRequest } from '@/lib/request-boundary';
import {
  readWhatsNextInstructions,
  saveWhatsNextInstructions,
} from '@/lib/whats-next-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    return Response.json(
      { instructions: await readWhatsNextInstructions(project) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 150_000)
      throw new Error('Instructions request is too large.');
    const { instructions } = JSON.parse(body);
    return Response.json(
      await saveWhatsNextInstructions(project, instructions),
    );
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : 'Could not update Instructions.',
    },
    { status: 400 },
  );
}
