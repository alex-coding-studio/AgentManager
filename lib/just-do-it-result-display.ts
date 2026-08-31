import type { ActionRun } from './just-do-it-execution-types.ts';

export function unverifiedDeliveryRefs(run: ActionRun) {
  const verified = new Set([
    ...run.observedRefs,
    ...(run.verifiedExternalRefs ?? []),
    ...(run.verifiedVersionRefs ?? []),
  ]);
  return (run.result?.artifactRefs ?? []).filter((ref) => !verified.has(ref));
}

export function hasUnsupportedAppArtifact(run: ActionRun) {
  return (
    Boolean(run.evidenceErrors?.length) &&
    unverifiedDeliveryRefs(run).some(
      (ref) => ref.startsWith('file:') && ref.endsWith('.app'),
    )
  );
}

export function hasReviewableReport(run: ActionRun | undefined) {
  return Boolean(
    run?.result &&
    (run.status === 'succeeded' ||
      (run.status === 'failed' && run.evidenceErrors?.length)),
  );
}
