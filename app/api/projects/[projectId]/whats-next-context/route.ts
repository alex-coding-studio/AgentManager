import { getProject } from '@/lib/project-registry';
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
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      return Response.json(
        { error: 'Cross-origin writes are not allowed.' },
        { status: 403 },
      );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new Error('JSON input is required.');
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
