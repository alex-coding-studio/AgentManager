import {
  readAppSettings,
  updateAppSettings,
  isSettingsPatch,
} from '@/lib/app-settings';
import { guardJsonRequest } from '@/lib/request-boundary';

export async function GET() {
  return Response.json(await readAppSettings(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(request: Request) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid settings request.' },
      { status: 400 },
    );
  }
  if (!isSettingsPatch(body))
    return Response.json(
      { error: 'Unsupported application settings.' },
      { status: 400 },
    );
  try {
    return Response.json(await updateAppSettings(body));
  } catch {
    return Response.json(
      { error: 'Could not save settings.' },
      { status: 500 },
    );
  }
}
