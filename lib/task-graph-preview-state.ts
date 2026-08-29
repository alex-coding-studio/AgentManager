export function replaceRunWithPreviewsInPlace<T extends { id: string }>(
  current: T[],
  runId: string,
  replacements: T[],
) {
  const remaining = new Map(
    replacements.map((replacement) => [replacement.id, replacement]),
  );
  const merged: T[] = [];
  let runInsertionIndex: number | null = null;
  for (const preview of current) {
    if (preview.id === runId) {
      runInsertionIndex = merged.length;
      continue;
    }
    const replacement = remaining.get(preview.id);
    if (replacement) {
      merged.push(replacement);
      remaining.delete(preview.id);
    } else {
      merged.push(preview);
    }
  }
  const additions = [...remaining.values()];
  if (runInsertionIndex === null) {
    merged.push(...additions);
  } else {
    merged.splice(runInsertionIndex, 0, ...additions);
  }
  return merged;
}
