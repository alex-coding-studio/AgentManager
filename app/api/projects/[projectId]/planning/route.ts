import { getProject } from '@/lib/project-registry';
import { readContextBrowser } from '@/lib/product-context';
import {
  planningService,
  readPlanningInstructions,
  savePlanningInstructions,
  type StartPlanningInput,
} from '@/lib/just-do-it-planning-service';

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
    const [cards, sources, instructions, folders] = await Promise.all([
      planningService.list(project),
      planningService.sources(project),
      readPlanningInstructions(project),
      readContextBrowser(project),
    ]);
    return Response.json(
      { cards, sources, instructions, folders },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const project = await getProject((await params).projectId);
  if (!project)
    return Response.json({ error: 'Project not found.' }, { status: 404 });
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host'))
      throw new Error('Cross-origin Planning writes are not allowed.');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new Error('JSON input is required.');
    const text = await request.text();
    if (Buffer.byteLength(text) > 1_500_000)
      throw new Error('Planning request is too large.');
    const input = JSON.parse(text);
    if (
      input.action === 'import' &&
      typeof input.module === 'string' &&
      typeof input.uid === 'string'
    )
      return Response.json({
        card: await planningService.importSource(
          project,
          input.module,
          input.uid,
        ),
      });
    if (input.action === 'start')
      return Response.json(
        {
          card: await planningService.start(
            project,
            input as StartPlanningInput,
          ),
        },
        { status: 202 },
      );
    if (
      ['finalize', 'reopen', 'cancel'].includes(input.action) &&
      typeof input.cardId === 'string'
    )
      return Response.json({
        card: await planningService.update(
          project,
          input.cardId,
          input.expectedRevision,
          input.action,
        ),
      });
    if (input.action === 'instructions') {
      await savePlanningInstructions(project, input.instructions);
      return Response.json({ ok: true });
    }
    throw new Error('Unknown Planning operation.');
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Planning request failed.';
  return Response.json(
    { error: message },
    { status: /changed|conflict|running Agent/.test(message) ? 409 : 400 },
  );
}
