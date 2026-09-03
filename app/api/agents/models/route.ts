import { getLocalModels } from '@/lib/agents/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const agent = new URL(request.url).searchParams.get('agent');
  if (agent !== 'codex' && agent !== 'claude' && agent !== 'deepseek')
    return Response.json({ error: 'Unknown Agent.' }, { status: 400 });
  try {
    return Response.json(await getLocalModels(agent), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'Could not load local models.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
