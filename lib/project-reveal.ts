export async function requestProjectReveal(
  projectId: string,
  request: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await request(`/api/projects/${projectId}/reveal`, {
      method: 'POST',
    });
  } catch {
    throw new Error('Could not open project location.');
  }

  let result: { error?: string };
  try {
    result = (await response.json()) as { error?: string };
  } catch {
    throw new Error('Could not open project location.');
  }
  if (!response.ok)
    throw new Error(result.error ?? 'Could not open project location.');
}
