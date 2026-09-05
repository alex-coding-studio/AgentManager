import path from 'node:path';
import { cardRunClassification } from '../../execution-observability/log-targets.ts';
import { readOwnerResponse } from '../../execution-observability/module-run.ts';
import {
  ownerLogUrlPath,
  storedOwner,
  type JobLogReference,
  type LatestResponseDocument,
  type LatestResponseSubject,
  type LogActor,
  type ResponseClassification,
  type ResponseOwner,
  type RetainedEffects,
  type RunPhase,
} from '../../execution-observability/types.ts';
import type { RegisteredProject } from '../../project-registry.ts';
import type { ActionRun } from './execution-types.ts';
import type { PlanningCard } from './planning-service.ts';

export function cardOwner(
  project: RegisteredProject,
  cardId: string,
): ResponseOwner {
  return {
    kind: 'card',
    projectId: project.id,
    planningPath: project.planningPath,
    cardId,
  };
}

export function cardRunLogPaths(
  project: RegisteredProject,
  cardId: string,
  runId: string,
) {
  const logRef = path.posix.join(
    'implementation/cards',
    cardId,
    'logs',
    `${runId}.log`,
  );
  return { logRef, logFile: path.join(project.planningPath, logRef) };
}

export function cardRunSubject(
  card: PlanningCard,
  actionId: string,
): LatestResponseSubject {
  const index = card.actions.findIndex((action) => action.id === actionId);
  const action = card.actions[index];
  return {
    kind: 'action',
    label: action
      ? `Action ${index + 1}/${card.actions.length} · ${action.title}`
      : `Action ${actionId.slice(0, 8)}`,
    id: actionId,
  };
}

export function retainedEffectsOf(
  run: ActionRun,
  changedFiles: number,
): RetainedEffects {
  return {
    changedFiles,
    commits: run.commit ? [run.commit] : [],
    checkpoint: run.commit ?? null,
    pullRequests: run.github?.pullRequests?.map((item) => item.url) ?? [],
    checksStarted: Boolean(run.jobs?.length),
  };
}

export function cardResponseDocument(
  project: RegisteredProject,
  card: PlanningCard,
  run: ActionRun,
  classification: ResponseClassification,
  extra: {
    retained?: RetainedEffects;
    jobLogs?: JobLogReference[];
    phase?: RunPhase;
    actor?: LogActor;
    accepted?: boolean;
  } = {},
): LatestResponseDocument {
  const owner = cardOwner(project, card.id);
  const running = run.status === 'running';
  return {
    schemaVersion: 1,
    owner: storedOwner(owner),
    projectId: project.id,
    runId: run.id,
    revision: 0,
    status: running ? 'running' : classification.status,
    phase: running ? (extra.phase ?? 'executing') : undefined,
    actor: running ? (extra.actor ?? 'WORKER') : undefined,
    title: running ? 'Running' : classification.title,
    detail: classification.detail,
    subject: cardRunSubject(card, run.actionId),
    supplementaryWarnings: classification.supplementaryWarnings,
    recovery: running ? ['log'] : classification.recovery,
    startedAt: run.startedAt,
    updatedAt: new Date().toISOString(),
    endedAt: run.endedAt,
    logRef: run.logRef ?? cardRunLogPaths(project, card.id, run.id).logRef,
    logUrlPath: ownerLogUrlPath(owner, run.id),
    hostPid: run.hostPid,
    agentProfile: run.profile,
    actionId: run.actionId,
    retained: extra.retained,
    jobLogs: extra.jobLogs ?? run.jobs,
    recentActivity: [],
    accepted: extra.accepted,
    reconstructed: !run.response,
  };
}

export async function readCardLatestResponse(
  project: RegisteredProject,
  card: PlanningCard,
): Promise<LatestResponseDocument | null> {
  return readOwnerResponse(cardOwner(project, card.id), {
    logFileFor: (document) =>
      cardRunLogPaths(project, card.id, document.runId).logFile,
    fallback: async () => {
      const run = card.execution?.runs.findLast(
        (item) => item.status !== 'running',
      );
      if (!run) return null;
      const accepted =
        card.execution?.acceptedActionIds.includes(run.actionId) ?? false;
      const classification = cardRunClassification(run, accepted);
      if (!classification) return null;
      return cardResponseDocument(project, card, run, classification, {
        accepted,
        retained: retainedEffectsOf(run, run.observedRefs.length),
      });
    },
  });
}
