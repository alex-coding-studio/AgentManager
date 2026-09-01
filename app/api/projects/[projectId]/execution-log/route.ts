import { readFile, realpath, stat } from 'node:fs/promises';
import { apiErrorResponse } from '@/lib/api-errors';
import path from 'node:path';
import { getProject } from '@/lib/project-registry';
import { planningService } from '@/lib/just-do-it-planning-service';
import { assertCardUuid } from '@/lib/just-do-it-harness';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const project = await getProject((await params).projectId);
    if (!project)
      return Response.json({ error: 'Project not found.' }, { status: 404 });
    const search = new URL(request.url).searchParams;
    const cardId = search.get('cardId') ?? '';
    const runId = search.get('runId') ?? '';
    assertCardUuid(cardId);
    assertCardUuid(runId);
    const card = await planningService.read(project, cardId);
    const run = card.execution?.runs.find((run) => run.id === runId);
    if (!run) throw new Error('Run not found.');
    let reference =
      search.get('view') === 'activity'
        ? run.activityRef
        : run.coordination?.logRef;
    const attemptId = search.get('attempt');
    if (attemptId) {
      assertCardUuid(attemptId);
      if (
        !run.coordination?.attempts.some(
          (attempt) => attempt.id === attemptId,
        ) ||
        !run.coordination.logRef
      )
        throw new Error('Attempt not found.');
      reference = path.join(
        path.dirname(run.coordination.logRef),
        `coordination-${attemptId}-${search.get('kind') === 'request' ? 'request' : 'response'}.txt`,
      );
    }
    if (!reference) throw new Error('No recorded log is available.');
    const root = await realpath(project.planningPath);
    const target = path.resolve(root, reference);
    if (
      !target.startsWith(root + path.sep) ||
      (await realpath(target)) !== target
    )
      throw new Error('Invalid log path.');
    const metadata = await stat(target);
    if (!metadata.isFile() || metadata.size > 2097152)
      throw new Error('Log is unavailable or too large.');
    return new Response(await readFile(target, 'utf8'), {
      headers: {
        'Content-Type': target.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiErrorResponse(
      error,
      'Could not read the log.',
      'GET /api/projects/[projectId]/execution-log',
    );
  }
}
