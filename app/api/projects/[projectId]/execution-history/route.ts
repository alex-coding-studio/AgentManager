import { getProject } from '@/lib/project-registry';
import { planningService } from '@/lib/just-do-it-planning-service';
import { assertCardUuid } from '@/lib/just-do-it-harness';
import { readCheckpointDiff } from '@/lib/just-do-it-git';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const query = new URL(request.url).searchParams;
    const cardId = query.get('cardId') ?? '';
    const runId = query.get('runId') ?? '';
    assertCardUuid(cardId);
    assertCardUuid(runId);
    const card = await planningService.read(project, cardId);
    const run = card.execution?.runs.find((item) => item.id === runId);
    if (!run?.commit || !run.parentCommit)
      throw new Error('No Git checkpoint for this round.');
    const diff = await readCheckpointDiff(
      project,
      cardId,
      run.parentCommit,
      run.commit,
    );
    return new Response(
      diff || 'This checkpoint has no tracked file changes.\n',
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          'Could not read this checkpoint. Large diffs may exceed the preview limit.',
      },
      { status: 400 },
    );
  }
}
