import { apiErrorResponse } from '@/lib/api-errors';
import {
  clampOffset,
  readLogChunk,
  resolveLogTarget,
} from '@/lib/execution-observability/log-targets';
import { getProject } from '@/lib/project-registry';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; segments: string[] }> },
) {
  try {
    const { projectId, segments } = await params;
    const project = await getProject(projectId);
    if (!project)
      return Response.json({ error: 'Project not found.' }, { status: 404 });
    const search = new URL(request.url).searchParams;
    const target = await resolveLogTarget(project, segments);
    const chunk = await readLogChunk(target, clampOffset(search.get('offset')));
    if (search.get('raw') === '1')
      return new Response(chunk.text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    return Response.json(
      { ...chunk, meta: target.meta },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not read the log.',
      'GET /api/projects/[projectId]/logs',
    );
  }
}
