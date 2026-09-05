import {
  legacyModuleDocument,
  readModuleResponse,
} from './execution-observability/module-run.ts';
import type {
  LatestResponseDocument,
  LatestResponseSubject,
  ResponseClassification,
  ResponseModule,
} from './execution-observability/types.ts';
import {
  latestDomainModelResponse,
  latestTaskDecompositionResponse,
  latestWhatToDoResponse,
  latestWhatsNextResponse,
  legacyClassification,
  type LatestResponsePresentation,
} from './latest-response.ts';
import { intentionDestination } from './modules/product-discovery/intention.ts';
import { listLatestWhatsNextRuns } from './modules/product-discovery/runs.ts';
import { listLatestTaskDecompositionRuns } from './modules/scope-decomposition/runs.ts';
import { listLatestDomainModelRuns } from './modules/domain-modeling/runs.ts';
import { listLatestWhatToDoRuns } from './modules/delivery-planning/runs.ts';
import type { RegisteredProject } from './project-registry.ts';

type LegacyRun = {
  runId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  profile?: LatestResponseDocument['agentProfile'];
  response?: ResponseClassification;
  subject: LatestResponseSubject;
  presentation: LatestResponsePresentation;
};

const terminal = (status: string) =>
  !['running', 'validating'].includes(status);

async function newestTerminalRun(
  project: RegisteredProject,
  module: ResponseModule,
): Promise<LegacyRun | null> {
  switch (module) {
    case 'whats-next': {
      const run = (await listLatestWhatsNextRuns(project))
        .filter((item) => terminal(item.status))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .at(0);
      if (!run) return null;
      const layer = intentionDestination(run.intention).layer;
      return {
        runId: run.runId,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        profile: run.profile,
        response: run.response,
        subject: {
          kind: 'layer',
          label: layer === 'discovery' ? 'Product Discovery' : 'Product Design',
        },
        presentation: latestWhatsNextResponse(run),
      };
    }
    case 'task-decomposition': {
      const run = (await listLatestTaskDecompositionRuns(project))
        .filter((item) => terminal(item.status))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .at(0);
      if (!run) return null;
      return {
        runId: run.runId,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        profile: run.profile,
        response: run.response,
        subject: {
          kind: 'node',
          label: run.sourceNodeId,
          id: run.sourceNodeId,
        },
        presentation: latestTaskDecompositionResponse(run),
      };
    }
    case 'domain-model': {
      const run = (await listLatestDomainModelRuns(project))
        .filter((item) => terminal(item.status))
        .at(0);
      if (!run) return null;
      return {
        runId: run.id,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        profile: run.profile,
        response: run.response,
        subject: { kind: 'module', label: 'Domain Model' },
        presentation: latestDomainModelResponse(run),
      };
    }
    default: {
      const run = (await listLatestWhatToDoRuns(project))
        .filter((item) => terminal(item.status))
        .at(0);
      if (!run) return null;
      return {
        runId: run.id,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        status: run.status,
        profile: run.profile,
        response: run.response,
        subject: { kind: 'module', label: 'Delivery Map' },
        presentation: latestWhatToDoResponse(run),
      };
    }
  }
}

export async function readModuleLatestResponse(
  project: RegisteredProject,
  module: ResponseModule,
) {
  return readModuleResponse(project, module, {
    fallback: async () => {
      const run = await newestTerminalRun(project, module);
      if (!run) return null;
      const classification =
        run.response ?? legacyClassification(run.presentation);
      return legacyModuleDocument(
        project,
        module,
        {
          runId: run.runId,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          profile: run.profile,
        },
        { ...classification, subject: run.subject },
      );
    },
  });
}
