import type { TaskGraphPreview } from './task-graph-layout.ts';
import type { WhatsNextRunRecord } from './whats-next-runs.ts';
import { intentionDestination } from './whats-next-intention.ts';

export function whatsNextRunToPreviews(
  run: WhatsNextRunRecord,
): TaskGraphPreview[] {
  const base = {
    sourceNodeId: run.sourceNodeIds[0] ?? '',
    instruction: '',
    inheritedResourceCount: run.input?.resourcePaths.length ?? 0,
    additionalResourceCount: 0,
    runId: run.runId,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    derivedFrom: run.sourceNodeIds,
    layer: intentionDestination(run.intention).layer,
  };
  const agentLabel = run.transport === 'claude-cli' ? 'Claude' : 'Codex';

  if (['running', 'validating'].includes(run.status)) {
    return [
      {
        ...base,
        id: run.revisionOf ?? run.runId,
        kind: 'run',
        title: run.revisionOf ? 'Refining direction' : agentLabel,
        type: run.revisionOf ? 'Refining' : 'Running',
        description: run.activity?.at(-1)?.summary ?? '',
        agentLabel,
        status: run.status,
        revisionOf: run.revisionOf,
      },
    ];
  }

  if (run.result?.outcome === 'proposal') {
    return run.result.candidates.map((candidate) => ({
      ...base,
      id: candidate.candidateId,
      kind: 'candidate' as const,
      title: candidate.title,
      type: candidate.type,
      description: candidate.summary,
      color: candidate.presentation?.color,
      derivedFrom: candidate.derivedFrom,
      dependsOn: candidate.dependsOn,
      candidate,
      layer: candidate.layer,
      outputPath: `whats-next/runs/${run.runId}/candidates/${candidate.candidateId}/output.md`,
      previousOutputPath:
        run.revisionOf && run.parentRunId
          ? `whats-next/runs/${run.parentRunId}/candidates/${candidate.candidateId}/output.md`
          : undefined,
      revisionOf: run.revisionOf,
    }));
  }

  return [];
}
