import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { validateAgentProfile } from './agent-profile.ts';
import {
  planningService,
  readPlanningInstructions,
  type PlanningCard,
} from './just-do-it-planning-service.ts';
import {
  appendCardWorkRecord,
  readCardWorklog,
  type CardWorkRecord,
} from './just-do-it-worklog.ts';
import {
  assertCardUuid,
  buildCardHarnessPrompt,
  createCardHarnessRequest,
  parseCardHarnessResult,
  type CardHarnessRequest,
} from './just-do-it-harness.ts';
import {
  startLocalAgentRun,
  type LocalAgentRun,
} from './local-agent-transport.ts';
import {
  observedChanges,
  snapshotWorkspace,
  type WorkspaceSnapshot,
} from './just-do-it-artifacts.ts';
import type {
  ActionRun,
  ExecuteActionInput,
} from './just-do-it-execution-types.ts';

type Active = {
  id: string;
  cardId: string;
  handle: LocalAgentRun | null;
  timer: ReturnType<typeof setTimeout> | null;
};
const runtime = globalThis as typeof globalThis & {
  jdiExecutionActive?: Map<string, Active>;
};
const sharedActive = (runtime.jdiExecutionActive ??= new Map());
const root = (project: Parameters<typeof planningService.read>[0]) =>
  path.join(project.planningPath, 'implementation/cards');
type Project = Parameters<typeof planningService.read>[0];
const reference = (card: PlanningCard, file: string) =>
  `implementation/cards/${card.id}/${String(card.revision + 1).padStart(8, '0')}/${file}`;

export function createExecutionService(
  store = planningService,
  transport = startLocalAgentRun,
  active = sharedActive,
  timeoutMs = 1800000,
) {
  async function commit(
    project: Project,
    card: PlanningCard,
    record: CardWorkRecord,
    files: Record<string, string> = {},
  ) {
    const next = {
      ...card,
      revision: card.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await appendCardWorkRecord(root(project), card.id, card.revision, record, {
      ...files,
      'planning-state.json': JSON.stringify(next),
    });
    return next;
  }

  async function refresh(
    project: Project,
    card: PlanningCard,
  ): Promise<PlanningCard> {
    const run = card.execution?.runs.at(-1);
    if (
      run?.status !== 'running' ||
      active.get(project.rootPath)?.id === run.id
    )
      return card;
    if (run.hostPid !== process.pid) {
      try {
        process.kill(run.hostPid, 0);
        return card;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    const error =
      'Execution was interrupted. Files may have changed; nothing was rolled back. Inspect the workspace before retrying.';
    const next = replaceRun(card, {
      ...run,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error,
    });
    try {
      return await commit(project, next, {
        kind: 'system-event',
        stage: 'execution',
        actionId: run.actionId,
        event: 'run-ended',
        text: error,
        refs: [],
      });
    } catch (error) {
      if (/revision conflict/.test(String(error)))
        return store.read(project, card.id);
      throw error;
    }
  }

  async function finish(
    project: Project,
    request: CardHarnessRequest,
    baseline: WorkspaceSnapshot,
    outcome: Awaited<LocalAgentRun['completion']> | Error,
  ) {
    try {
      const card = await store.read(project, request.context.cardId);
      const run = card.execution?.runs.at(-1);
      if (
        run?.id !== request.requestId ||
        run.status !== 'running' ||
        card.revision !== request.context.contextRevision
      )
        return;
      let refs: string[] = [];
      let snapshot: WorkspaceSnapshot | null = null;
      let nextRun: ActionRun = {
        ...run,
        endedAt: new Date().toISOString(),
        agentSessionId:
          outcome instanceof Error ? null : outcome.agentSessionId,
        usage: outcome instanceof Error ? null : outcome.usage,
      };
      const files: Record<string, string> = {};
      try {
        snapshot = await snapshotWorkspace(project);
        refs = observedChanges(baseline, snapshot);
        files['observed-workspace.json'] = JSON.stringify(snapshot);
        if (outcome instanceof Error) throw outcome;
        files['raw-response.txt'] = outcome.finalOutput.slice(0, 1000000);
        const result = parseCardHarnessResult(
          outcome.finalOutput,
          request,
          card.revision,
          refs,
        );
        if (result.stage !== 'execution')
          throw new Error('Expected an execution response.');
        const outputRef = reference(card, 'output.md');
        nextRun = {
          ...nextRun,
          status: 'succeeded',
          result,
          error: null,
          observedRefs: refs,
          outputRef,
        };
        files['result.json'] = JSON.stringify(result);
        files['output.md'] =
          `# Action output\n\n${result.summary}\n\nOutcome: ${result.outcome}\n\n## Observed changes\n${refs.map((ref) => `- ${ref}`).join('\n')}\n\n## Agent-reported checks\n${result.checks.map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Remaining\n${result.remaining.map((item) => `- ${item}`).join('\n')}`;
        await commit(
          project,
          replaceRun(card, nextRun),
          {
            kind: 'agent-note',
            stage: 'execution',
            actionId: run.actionId,
            basedOnRevision: card.revision,
            summary: result.handoffSummary.slice(0, 600),
            currentState:
              `Goal: ${card.source.title}\nPlan: finalized.\nAccepted Actions: ${card.execution?.acceptedActionIds.join(', ') || 'none'}\nCurrent Action: ${run.actionId}\nOutput: ../${String(card.revision + 1).padStart(8, '0')}/output.md\n${result.handoffSummary}\nNext: user validates this output or supplies follow-up. Do not start another Action.`.slice(
                0,
                6000,
              ),
          },
          files,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Execution failed.';
        nextRun = {
          ...nextRun,
          status: 'failed',
          error: message,
          observedRefs: refs,
          result: null,
        };
        await commit(
          project,
          replaceRun(card, nextRun),
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: run.actionId,
            event: 'run-ended',
            text: `${message}\nFiles may have changed; no rollback was performed.`,
            refs,
          },
          files,
        );
      }
    } finally {
      const running = active.get(project.rootPath);
      if (running?.id === request.requestId) {
        if (running.timer) clearTimeout(running.timer);
        active.delete(project.rootPath);
      }
    }
  }

  async function start(project: Project, input: ExecuteActionInput) {
    assertCardUuid(input.cardId);
    assertCardUuid(input.actionId);
    validateAgentProfile(input.profile);
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      typeof input.instruction !== 'string' ||
      input.instruction.length > 20000
    )
      throw new Error('Invalid execution input.');
    if (active.has(project.rootPath))
      throw new Error('This project already has a running Action.');
    const reservation: Active = {
      id: randomUUID(),
      cardId: input.cardId,
      handle: null,
      timer: null,
    };
    active.set(project.rootPath, reservation);
    try {
      const cards = await store.list(project);
      for (const item of cards) {
        const current = await refresh(project, item);
        if (current.execution?.runs.at(-1)?.status === 'running')
          throw new Error('This project already has a running Action.');
      }
      const card = await store.read(project, input.cardId);
      if (card.revision !== input.expectedRevision)
        throw new Error('Card changed. Reload before trying again.');
      if (card.run?.status === 'running')
        throw new Error('Stop planning before executing.');
      const dependencyResources: Array<{ ref: string; description: string }> =
        [];
      for (const id of card.source.dependsOn) {
        const prerequisite = cards.find(
          (item) => item.source.uid === id || item.source.id === id,
        );
        if (
          !prerequisite?.actions.length ||
          prerequisite.actions.some(
            (action) =>
              !prerequisite.execution?.acceptedActionIds.includes(action.id),
          )
        )
          throw new Error(
            `Accept prerequisite ${id} before executing this goal.`,
          );
        for (const run of prerequisite.execution?.runs ?? [])
          if (
            run.outputRef &&
            prerequisite.execution!.acceptedActionIds.includes(run.actionId)
          )
            dependencyResources.push({
              ref: path.join(project.planningPath, run.outputRef),
              description: `Accepted prerequisite ${prerequisite.source.title}`,
            });
      }
      const log = await readCardWorklog(root(project), card.id);
      const previous = card.execution?.runs.findLast(
        (run) => run.actionId === input.actionId && run.result,
      );
      const resources = [
        {
          ref: path.join(project.planningPath, card.sourceRef),
          description: 'Retained source goal.',
        },
        ...card.resources.map((item) => ({
          ref: path.join(project.planningPath, item.ref),
          description: item.name,
        })),
        ...(card.planRef
          ? [
              {
                ref: path.join(project.planningPath, card.planRef),
                description: 'Signed-off Plan. Do not change its scope.',
              },
            ]
          : []),
        ...(log.handoffPath
          ? [
              {
                ref: log.handoffPath,
                description: 'Read the Card handoff and relevant references.',
              },
            ]
          : []),
        ...(card.execution?.acceptedActionIds ?? []).flatMap((id) => {
          const accepted = card.execution!.runs.findLast(
            (run) => run.actionId === id && run.outputRef,
          );
          return accepted?.outputRef
            ? [
                {
                  ref: path.join(project.planningPath, accepted.outputRef),
                  description: `Accepted Action ${id}: read its output and follow handoff references for feedback.`,
                },
              ]
            : [];
        }),
        ...dependencyResources,
      ];
      const request = createCardHarnessRequest(
        {
          cardId: card.id,
          contextRevision: card.revision + 1,
          goal: `${card.source.title}\n${card.source.summary}\nUser requirements: ${card.requirements}`,
          moduleInstructions: await readPlanningInstructions(project),
          skills: [],
          resources,
          handoffMarkdown: log.handoffMarkdown,
          plan: card.plan,
          acceptedActionIds: card.execution?.acceptedActionIds ?? [],
          currentOutput: previous
            ? {
                id: previous.id,
                actionId: input.actionId,
                refs: previous.observedRefs,
              }
            : null,
          execution: {
            running: false,
            hasOutput: Boolean(previous),
            effects: card.execution?.runs.length ? 'unknown' : 'clean',
            rollbackConfirmed: false,
            consumedByCardIds: [],
          },
        },
        'execution',
        input.instruction ||
          'Implement the selected Action and return its output for user validation.',
        input.actionId,
      );
      const baseline = await snapshotWorkspace(project);
      reservation.id = request.requestId;
      const run: ActionRun = {
        id: request.requestId,
        actionId: input.actionId,
        status: 'running',
        input: input.instruction,
        profile: structuredClone(input.profile),
        startedAt: new Date().toISOString(),
        endedAt: null,
        hostPid: process.pid,
        agentSessionId: null,
        usage: null,
        result: null,
        error: null,
        observedRefs: [],
        outputRef: null,
      };
      const prompt = `${buildCardHarnessPrompt(request)}\n\nExecution runtime: work only in ${baseline.root}. The planning store ${project.planningPath} is host-owned; do not edit it or call AgentManager mutation APIs. Preserve pre-existing user changes. Repository creation is not a prerequisite; create or publish a repository only if the signed-off Action or current user instruction explicitly requests it. No automatic merge, rollback, acceptance, or next Action. Use file:relative/path for changed files, deleted:relative/path for removals, or git:full-commit-hash for a new commit in artifactRefs. The host checks these against before/after snapshots. Do not list unchanged input files as new artifacts or invent URLs. Checks are your reported evidence, not user acceptance. If there is no filesystem or Git change, do not claim a delivered coding artifact. If permissions prevent an operation, report blocked; never bypass sandbox restrictions. Return the required JSON, not a Markdown envelope.`;
      const saved = await commit(
        project,
        {
          ...card,
          execution: {
            runs: [...(card.execution?.runs ?? []), run],
            acceptedActionIds: card.execution?.acceptedActionIds ?? [],
          },
        },
        {
          kind: 'user-input',
          stage: 'execution',
          actionId: input.actionId,
          text: input.instruction || 'User started this Action.',
        },
        {
          'request.json': JSON.stringify(request),
          'baseline.json': JSON.stringify(baseline),
          'prompt.txt': prompt,
        },
      );
      try {
        reservation.handle = transport(input.profile.agent, {
          workingDirectory: baseline.root,
          prompt,
          model: input.profile.model || undefined,
          effort: input.profile.effort || undefined,
          access: 'workspace-write',
          protectedPath: project.planningPath,
        });
      } catch (error) {
        await finish(
          project,
          request,
          baseline,
          error instanceof Error ? error : new Error('Could not start Agent.'),
        );
        return store.read(project, card.id);
      }
      let settled = false;
      const settle = (
        outcome: Awaited<LocalAgentRun['completion']> | Error,
      ) => {
        if (settled) return Promise.resolve();
        settled = true;
        return finish(project, request, baseline, outcome);
      };
      reservation.timer = setTimeout(() => {
        reservation.handle?.cancel();
        void settle(
          new Error('Execution timed out. Files were not rolled back.'),
        ).catch(() => undefined);
      }, timeoutMs);
      void reservation.handle.completion
        .then(settle, (error) =>
          settle(
            error instanceof Error ? error : new Error('Execution failed.'),
          ),
        )
        .catch(() => undefined);
      return saved;
    } catch (error) {
      if (active.get(project.rootPath) === reservation)
        active.delete(project.rootPath);
      throw error;
    }
  }

  async function update(
    project: Project,
    cardId: string,
    expectedRevision: number,
    action: 'cancel' | 'accept',
    outputId: string,
  ) {
    assertCardUuid(cardId);
    assertCardUuid(outputId);
    const card = await refresh(project, await store.read(project, cardId));
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    const run = card.execution?.runs.at(-1);
    if (!run || run.id !== outputId)
      throw new Error('The current Action output changed.');
    if (action === 'cancel') {
      if (run.status !== 'running') throw new Error('No execution is running.');
      const handle = active.get(project.rootPath);
      if (handle?.id !== run.id)
        throw new Error('Execution is owned by another server.');
      const saved = await commit(
        project,
        replaceRun(card, {
          ...run,
          status: 'canceled',
          endedAt: new Date().toISOString(),
          error: 'Canceled by user. Existing changes were not reverted.',
        }),
        {
          kind: 'system-event',
          stage: 'execution',
          actionId: run.actionId,
          event: 'run-ended',
          text: 'User canceled execution. Existing file and external changes were not reverted.',
          refs: [],
        },
      );
      if (handle.timer) clearTimeout(handle.timer);
      handle.handle?.cancel();
      await handle.handle?.completion.catch(() => undefined);
      if (active.get(project.rootPath)?.id === run.id)
        active.delete(project.rootPath);
      return saved;
    }
    if (
      action !== 'accept' ||
      run.status !== 'succeeded' ||
      !run.result ||
      !run.observedRefs.length
    )
      throw new Error('An observed output is required for acceptance.');
    const accepted = card.execution!.acceptedActionIds;
    if (
      card.actions.find((item) => !accepted.includes(item.id))?.id !==
      run.actionId
    )
      throw new Error('Only the current Action can be accepted.');
    return commit(
      project,
      {
        ...card,
        execution: {
          ...card.execution!,
          acceptedActionIds: [...accepted, run.actionId],
        },
      },
      {
        kind: 'system-event',
        stage: 'execution',
        actionId: run.actionId,
        event: 'user-accepted',
        text: `User accepted output ${run.id}. Agent-reported checks and remaining limitations remain recorded. No GitHub merge was inferred.`,
        refs: run.outputRef ? [run.outputRef] : [],
      },
    );
  }

  return { start, update, refresh };
}

function replaceRun(card: PlanningCard, run: ActionRun): PlanningCard {
  return {
    ...card,
    execution: {
      ...card.execution!,
      runs: card.execution!.runs.map((item) =>
        item.id === run.id ? run : item,
      ),
    },
  };
}

export const executionService = createExecutionService();
