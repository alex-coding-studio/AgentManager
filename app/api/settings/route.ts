import { readAppSettings, saveAppLanguage } from '@/lib/app-settings';
import { isUiLanguage } from '@/lib/ui-language';

export async function GET() {
  return Response.json(await readAppSettings(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid settings request.' },
      { status: 400 },
    );
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !('language' in body) ||
    !isUiLanguage(body.language) ||
    Object.keys(body).some((key) => key !== 'language')
  )
    return Response.json(
      { error: 'Unsupported interface language.' },
      { status: 400 },
    );
  try {
    return Response.json(await saveAppLanguage(body.language));
  } catch {
    return Response.json(
      { error: 'Could not save settings.' },
      { status: 500 },
    );
  }
}
