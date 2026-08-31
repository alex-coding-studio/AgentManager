import {
  startCoordinatedExecution,
  CoordinationRunError,
  totalCoordinationUsage,
  type CoordinatedResult,
  type CoordinationProgress,
} from './just-do-it-coordination-runner.ts';
import type { PriorEvidence } from './just-do-it-coordination.ts';
import { redactActivity } from './local-agent-activity.ts';
import {
  hasUnsupportedAppArtifact,
  hasReviewableReport,
} from './just-do-it-result-display.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  validateAcceptanceCriteria,
  assessRequiredChecks,
  type AcceptanceCriterion,
} from './just-do-it-checklist.ts';
import { getGitHubRepositoryUrl } from './project-registry.ts';
import {
  ensureCardWorkspace,
  cardGitWritePaths,
  verifyCardWorkspace,
  workspaceProject,
  restartCardWorkspace,
  undoWorkspaceRestart,
  type CardWorkspace,
} from './just-do-it-worktree.ts';
import {
  discoverGitHubDelivery,
  refreshGitHubDelivery,
  githubReader,
  verifiedGitHubArtifactRefs,
} from './github-delivery.ts';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { checkpointWorkspace } from './just-do-it-git.ts';
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
  ExecutionEvidenceError,
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
  captureLocalAcceptanceArtifacts,
  observedChanges,
  observedGitCommits,
  verifiedOutputVersionRefs,
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
  canceling?: boolean;
  timeoutError?: Error;
  progress?: CoordinationProgress;
  activity?: CoordinationProgress[];
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
  timeoutMs = 7200000,
  reader = githubReader,
  provisionWorkspace: (
    project: Project,
    card: PlanningCard,
    initializeRepository?: boolean,
  ) => Promise<CardWorkspace | undefined> = ensureCardWorkspace,
  writeRecord = appendCardWorkRecord,
  coordinate = startCoordinatedExecution,
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
    await writeRecord(root(project), card.id, card.revision, record, {
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
    const live = active.get(project.rootPath);
    if (run?.status === 'running' && live?.id === run.id && live.progress)
      return replaceRun(card, { ...run, progress: live.progress });
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
      const workingProject = workspaceProject(
        project,
        card.execution?.workspace,
      );
      let refs: string[] = [];
      let snapshot: WorkspaceSnapshot | null = null;
      let nextRun: ActionRun = {
        ...run,
        endedAt: new Date().toISOString(),
        agentSessionId:
          outcome instanceof Error ? null : outcome.agentSessionId,
        usage: outcome instanceof Error ? null : outcome.usage,
        executionAccess:
          outcome instanceof Error ? undefined : outcome.executionAccess,
      };
      const files: Record<string, string> = {};
      if (!(outcome instanceof Error))
        files['raw-response.txt'] = outcome.finalOutput.slice(0, 1000000);
      const coordinated =
        outcome instanceof CoordinationRunError
          ? outcome
          : !(outcome instanceof Error) && 'coordination' in outcome
            ? (outcome as CoordinatedResult)
            : undefined;
      if (coordinated) {
        nextRun.coordination = {
          ...coordinated.coordination,
          logRef: reference(card, 'coordination.json'),
        };
        nextRun.usage = totalCoordinationUsage(coordinated.coordination);
        files['coordination.json'] = JSON.stringify(nextRun.coordination);
        for (const [name, text] of Object.entries(
          coordinated.coordinationRecords,
        ))
          files[`coordination-${name}`] = text;
      }
      const activity = active.get(project.rootPath)?.activity ?? [];
      if (activity.length) {
        nextRun.activityRef = reference(card, 'activity.json');
        nextRun.progress = activity.at(-1);
        files['activity.json'] = JSON.stringify(activity);
      }
      try {
        snapshot = await snapshotWorkspace(workingProject);
        nextRun.verificationBasis = verificationBasis(snapshot);
        refs = observedChanges(baseline, snapshot);
        files['observed-workspace.json'] = JSON.stringify(snapshot);
        const checkpointHash = await checkpointWorkspace(
          project,
          card.id,
          snapshot,
          run.parentCommit ?? card.execution!.git!.head,
          run.id,
          `Action ${run.actionId}\nRound ${run.id}\n${card.source.title}`,
        );
        nextRun = { ...nextRun, commit: checkpointHash };
        refs.push(`checkpoint:${run.id}`);
        refs = [
          ...new Set([
            ...refs,
            ...(await observedGitCommits(baseline, snapshot)),
          ]),
        ];
        if (card.execution?.workspace)
          await verifyCardWorkspace(card.execution.workspace);
        if (outcome instanceof Error) throw outcome;
        let result;
        try {
          result = parseCardHarnessResult(
            outcome.finalOutput,
            request,
            card.revision,
            refs,
          );
        } catch (error) {
          if (!(error instanceof ExecutionEvidenceError)) throw error;
          const versions = await verifiedOutputVersionRefs(
            snapshot,
            error.result.artifactRefs,
          );
          const attachments = await captureLocalAcceptanceArtifacts(
            snapshot,
            error.result.artifactRefs,
            nextRun.endedAt!,
          );
          files['local-artifacts.json'] = JSON.stringify({
            capturedAt: new Date().toISOString(),
            artifacts: attachments,
          });
          versions.push(...attachments.map((item) => item.ref));
          const verified = await verifiedGitHubArtifactRefs(
            workingProject,
            error.result.artifactRefs,
            snapshot.head,
            reader,
          );
          if (!verified.length && !versions.length) throw error;
          nextRun.verifiedExternalRefs = verified;
          nextRun.verifiedVersionRefs = versions;
          files['verified-references.json'] = JSON.stringify({
            checkedAt: new Date().toISOString(),
            external: verified,
            versions,
            meaning:
              'Verified delivery/version references, not a claim that files or commits changed during this Round.',
          });
          result = parseCardHarnessResult(
            outcome.finalOutput,
            request,
            card.revision,
            [...refs, ...verified, ...versions],
          );
        }
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
        nextRun.github = await discoverGitHubDelivery(
          workingProject,
          JSON.stringify(result),
          baseline.head,
          reader,
          snapshot.head,
        );
        files['github-delivery.json'] = JSON.stringify(nextRun.github);
        nextRun.unverifiedCheckRefs = unverifiedCheckRefs(result, request, [
          ...refs,
          ...(nextRun.verifiedExternalRefs ?? []),
          ...(nextRun.verifiedVersionRefs ?? []),
        ]);
        files['result.json'] = JSON.stringify(result);
        files['output.md'] =
          `# Action output\n\n${result.summary}\n\nOutcome: ${result.outcome}\n\n## Observed changes\n${refs.map((ref) => `- ${ref}`).join('\n')}\n\n## Required self-checks\n${result.checks.map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Additional checks (non-blocker)\n${(result.additionalChecks ?? []).map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Remaining\n${result.remaining.map((item) => `- ${item}`).join('\n')}`;
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
              `Goal: ${card.source.title}\nPlan: finalized.\nAccepted Actions: ${card.execution?.acceptedActionIds.join(', ') || 'none'}\nCurrent Action: ${run.actionId}\nOutput: ../${String(card.revision + 1).padStart(8, '0')}/output.md\nGit checkpoint: ${nextRun.commit ?? 'unavailable'}\nGit history: ../versions.git\n${result.handoffSummary}\nNext: user validates this output or supplies follow-up. Do not start another Action.`.slice(
                0,
                6000,
              ),
          },
          files,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Execution failed.';
        const workerReport =
          error instanceof CoordinationRunError ? error.workerReport : null;
        const advisoryOnly =
          Boolean(coordinated) &&
          error instanceof ExecutionEvidenceError &&
          assessRequiredChecks(
            run.acceptanceChecklist,
            error.result.checks,
            card.execution?.acceptanceOverrides?.[run.actionId],
          ).passed;
        nextRun = {
          ...nextRun,
          status: advisoryOnly ? 'succeeded' : 'failed',
          error: advisoryOnly ? null : message,
          observedRefs: refs,
          result:
            error instanceof ExecutionEvidenceError
              ? error.result
              : workerReport,
          ...(error instanceof ExecutionEvidenceError
            ? {
                evidenceErrors: [error.message],
                unverifiedCheckRefs: unverifiedCheckRefs(
                  error.result,
                  request,
                  refs,
                ),
              }
            : {}),
        };
        if (nextRun.result)
          files[
            advisoryOnly
              ? 'result.json'
              : workerReport
                ? 'worker-report.json'
                : 'rejected-report.json'
          ] = JSON.stringify(nextRun.result);
        if (snapshot) {
          nextRun.github = await discoverGitHubDelivery(
            workingProject,
            nextRun.result ? JSON.stringify(nextRun.result) : '',
            baseline.head,
            reader,
            snapshot.head,
          );
          files['github-delivery.json'] = JSON.stringify(nextRun.github);
        }
        await commit(
          project,
          replaceRun(card, nextRun),
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: run.actionId,
            event: 'run-ended',
            text: advisoryOnly
              ? `Required checks passed. Advisory artifact verification finding retained: ${message}`
              : `${message}\nFiles may have changed; no rollback was performed.`,
            refs,
          },
          files,
        );
      }
    } finally {
      const running = active.get(project.rootPath);
      if (running?.id === request.requestId && !running.canceling) {
        if (running.timer) clearTimeout(running.timer);
        active.delete(project.rootPath);
      }
    }
  }

  async function start(project: Project, input: ExecuteActionInput) {
    assertCardUuid(input.cardId);
    assertCardUuid(input.actionId);
    validateAgentProfile(input.profile);
    if (input.coordination) {
      validateAgentProfile(input.coordination.profile);
    }
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
      let card = await store.read(project, input.cardId);
      if (card.revision !== input.expectedRevision)
        throw new Error('Card changed. Reload before trying again.');
      if (card.run?.status === 'running')
        throw new Error('Stop planning before executing.');
      const coordinationSettings = {
        profile:
          input.coordination?.profile ??
          card.execution?.coordinationSettings?.profile ??
          card.run?.profile ??
          input.profile,
      };
      validateAgentProfile(coordinationSettings.profile);
      const selectedAction = card.actions.find(
        (action) => action.id === input.actionId,
      );
      const criteria = validateAcceptanceCriteria(
        selectedAction?.acceptanceCriteria,
      );
      const acceptanceChecklist = {
        version: createHash('sha256')
          .update(JSON.stringify(criteria))
          .digest('hex'),
        items: structuredClone(criteria),
      };
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
        for (const actionId of prerequisite.execution!.acceptedActionIds) {
          const run = prerequisite.execution!.runs.findLast(
            (candidate) => candidate.actionId === actionId,
          );
          if (run?.outputRef)
            dependencyResources.push({
              ref: path.join(project.planningPath, run.outputRef),
              description: `Accepted prerequisite ${prerequisite.source.title}, Action ${actionId}`,
            });
        }
      }
      card = await ensureAcceptedOutputRefs(project, card);
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
            (run) => run.actionId === id,
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
          acceptanceChecklist,
          acceptanceOverrides:
            card.execution?.acceptanceOverrides?.[input.actionId] ?? {},
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
      const workspace = await provisionWorkspace(
        project,
        card,
        input.initializeRepository === true,
      );
      const workingProject = workspaceProject(project, workspace);
      const baseline = await snapshotWorkspace(workingProject);
      let git = card.execution?.git;
      if (!git) {
        const baselineCommit = await checkpointWorkspace(
          project,
          card.id,
          baseline,
          null,
          randomUUID(),
          `Execution baseline\n${card.source.title}`,
        );
        git = {
          baseline: baselineCommit,
          head: baselineCommit,
          firstTrackedRunId: request.requestId,
        };
      }
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
        parentCommit: git.head,
        acceptanceChecklist,
      };
      const prompt = `${buildCardHarnessPrompt(request)}\n\nExecution runtime: work only in ${baseline.root}. This is the Card-owned worktree on branch ${workspace?.branch ?? 'legacy'}. Keep all Actions and Rounds on this branch. The primary checkout ${project.codePath ?? project.rootPath} is not your editing directory. Never switch this worktree to main, reset the primary checkout, or merge into main. Repository commits and pushes belong on this Card branch; only the agreed PR delivery process may merge to main. The planning store ${project.planningPath} is host-owned; do not edit it or call AgentManager mutation APIs. Preserve pre-existing user changes. The host has prepared the local repository and Card branch. Do not reinitialize Git or create a replacement branch. Creating a GitHub repository or publishing branches still requires the signed-off Action or explicit user instruction. A local empty baseline does not authorize pushing the default branch to GitHub. If initializing or publishing a project repository, exclude .agent-manager/ before staging; never publish the host-owned planning store or its private Git history. No automatic merge, rollback, acceptance, or next Action. Use file:relative/path for changed files, deleted:relative/path for removals, or git:full-commit-hash for a commit newly reachable from the final project HEAD in artifactRefs. Command descriptions and external URLs may be included in check evidenceRefs, but remain Agent-reported unless independently verified. Real GitHub repository or PR URLs may appear in artifactRefs; the host verifies the current origin and remote identity, and requires PR HEAD to match this output. A repository link identifies the delivery location, not proof of new files or completed work. The host checks these against before/after snapshots. artifactRefs identify the resulting deliverable or version, not a list of new changes. You may cite an existing file inside this workspace or a commit reachable from the output HEAD when validating or publishing existing work; state clearly when no code changed. Do not cite unrelated input resources, missing files or invented URLs. The host records actual changes separately. Include actual PR URLs in the output summary when PRs were produced; the host queries GitHub to verify their state. Checks are your reported evidence, not user acceptance. The host records a new local Git checkpoint for this round. You may reference checkpoint:${request.requestId} as this round's workspace snapshot when reporting checks without file changes; explicitly state that no code changed and do not invent completed functionality. If permissions prevent an operation, report blocked; never bypass sandbox restrictions. Return the required JSON, not a Markdown envelope.`;
      const saved = await commit(
        project,
        {
          ...card,
          execution: {
            ...card.execution,
            profile: input.profile,
            coordinationSettings,
            workspace,
            runs: [...(card.execution?.runs ?? []), run],
            acceptedActionIds: card.execution?.acceptedActionIds ?? [],
            git,
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
        const recordProgress = (progress: CoordinationProgress) => {
          if (
            active.get(project.rootPath) !== reservation ||
            reservation.canceling
          )
            return;
          const entry = {
            ...progress,
            summary: redactActivity(progress.summary),
          };
          reservation.progress = entry;
          reservation.activity = [...(reservation.activity ?? []), entry].slice(
            -300,
          );
        };
        const options: Parameters<typeof transport>[1] = {
          workingDirectory: baseline.root,
          prompt,
          model: input.profile.model || undefined,
          effort: input.profile.effort || undefined,
          access: 'workspace-write',
          protectedPath: project.planningPath,
          primaryRepositoryPath: workspace?.repository,
          gitWritePaths: workspace
            ? await cardGitWritePaths(workspace)
            : undefined,
          onActivity: (activity) =>
            recordProgress({
              phase: 'execute',
              summary: activity.summary,
              updatedAt: new Date().toISOString(),
              attempts: 1,
            }),
        };
        recordProgress({
          phase: 'prepare',
          summary: 'Preparing coordinated execution.',
          updatedAt: new Date().toISOString(),
          attempts: 0,
        });
        {
          const evidence: PriorEvidence[] =
            card.execution?.runs.flatMap((previous) =>
              previous.verificationBasis && previous.result
                ? previous.result.checks
                    .filter(
                      (check) => check.status === 'passed' && check.criterionId,
                    )
                    .map((check) => ({
                      id: `${previous.id}:${check.criterionId}`,
                      actionId: previous.actionId,
                      criterionId: check.criterionId!,
                      summary: check.summary,
                      evidenceRefs: check.evidenceRefs,
                      basis: previous.verificationBasis!,
                    }))
                : [],
            ) ?? [];
          reservation.handle = coordinate({
            request,
            workerOptions: options,
            workerAgent: input.profile.agent,
            settings: coordinationSettings,
            priorEvidence: evidence.slice(-80),
            previousContext:
              card.execution?.runs.findLast(
                (previous) => previous.coordination?.contextSummary,
              )?.coordination?.contextSummary ??
              request.context.handoffMarkdown.slice(0, 6000),
            readBasis: async () =>
              verificationBasis(await snapshotWorkspace(workingProject)),
            onProgress: recordProgress,
            transport,
          });
        }
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
        const traced =
          outcome instanceof CoordinationRunError
            ? outcome
            : !(outcome instanceof Error) && 'coordination' in outcome
              ? (outcome as CoordinatedResult)
              : undefined;
        const finalOutcome = reservation.timeoutError
          ? traced
            ? new CoordinationRunError(
                reservation.timeoutError.message,
                traced.coordination,
                traced.coordinationRecords,
              )
            : reservation.timeoutError
          : outcome;
        return finish(project, request, baseline, finalOutcome);
      };
      reservation.timer = setTimeout(() => {
        reservation.timeoutError = new Error(
          'Execution timed out. Files were not rolled back.',
        );
        reservation.handle?.cancel();
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
      handle.canceling = true;
      handle.handle?.cancel();
      const termination = await handle.handle?.completion.catch(
        (error: unknown) => error,
      );
      const canceledFiles: Record<string, string> = {};
      const canceledRun = { ...saved.execution!.runs.at(-1)! };
      if (termination instanceof CoordinationRunError) {
        canceledRun.coordination = {
          ...termination.coordination,
          logRef: reference(saved, 'coordination.json'),
        };
        canceledRun.usage = totalCoordinationUsage(termination.coordination);
        canceledFiles['coordination.json'] = JSON.stringify(
          canceledRun.coordination,
        );
        for (const [name, text] of Object.entries(
          termination.coordinationRecords,
        ))
          canceledFiles[`coordination-${name}`] = text;
      }
      if (handle.activity?.length) {
        canceledRun.activityRef = reference(saved, 'activity.json');
        canceledFiles['activity.json'] = JSON.stringify(handle.activity);
      }
      try {
        const snapshot = await snapshotWorkspace(
          workspaceProject(project, card.execution?.workspace),
        );
        const hash = await checkpointWorkspace(
          project,
          card.id,
          snapshot,
          run.parentCommit ?? card.execution!.git!.head,
          run.id,
          `Canceled Action ${run.actionId}\nRound ${run.id}`,
        );
        return await commit(
          project,
          replaceRun(saved, { ...canceledRun, commit: hash }),
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: run.actionId,
            event: 'output-recorded',
            text: `Recorded canceled-round Git checkpoint ${hash}. No rollback occurred.`,
            refs: [],
          },
          canceledFiles,
        );
      } catch (error) {
        return await commit(
          project,
          replaceRun(saved, {
            ...canceledRun,
            error: `Canceled; changes remain. Git checkpoint failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          }),
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: run.actionId,
            event: 'run-ended',
            text: 'Cancellation completed but its Git checkpoint failed. Inspect the workspace before continuing.',
            refs: [],
          },
          canceledFiles,
        );
      } finally {
        if (active.get(project.rootPath)?.id === run.id)
          active.delete(project.rootPath);
      }
    }
    if (action !== 'accept' || !hasReviewableReport(run) || !run.result)
      throw new Error(
        'A valid current Action report is required for acceptance.',
      );
    if (
      !assessRequiredChecks(
        run.acceptanceChecklist,
        run.result.checks,
        card.execution?.acceptanceOverrides?.[run.actionId],
      ).passed
    )
      throw new Error(
        'Required acceptance checks are incomplete or failed. Record an explicit user decision for any waived item.',
      );
    const accepted = card.execution!.acceptedActionIds;
    if (
      card.actions.find((item) => !accepted.includes(item.id))?.id !==
      run.actionId
    )
      throw new Error('Only the current Action can be accepted.');
    const outputRef = reference(card, 'output.md');
    return commit(
      project,
      {
        ...card,
        execution: {
          ...card.execution!,
          runs: card.execution!.runs.map((item) =>
            item.id === run.id ? { ...item, outputRef } : item,
          ),
          acceptedActionIds: [...accepted, run.actionId],
        },
      },
      {
        kind: 'system-event',
        stage: 'execution',
        actionId: run.actionId,
        event: 'user-accepted',
        text: `User accepted output ${run.id}. Agent-reported checks and verification findings remain unchanged. No GitHub merge was inferred.`,
        refs: [outputRef],
      },
      { 'output.md': acceptedOutputMarkdown(card, run) },
    );
  }

  async function ensureAcceptedOutputRefs(
    project: Project,
    card: PlanningCard,
  ) {
    const missing = (card.execution?.acceptedActionIds ?? [])
      .map((id) => card.execution!.runs.findLast((run) => run.actionId === id))
      .filter((run): run is ActionRun => Boolean(run && !run.outputRef));
    if (!missing.length) return card;
    if (missing.some((run) => !hasReviewableReport(run)))
      throw new Error(
        'An accepted Action is missing its original report; restore the record before continuing.',
      );
    const files: Record<string, string> = {};
    const refs = new Map<string, string>();
    for (const run of missing) {
      const name = `accepted-${run.actionId}.md`;
      files[name] = acceptedOutputMarkdown(card, run);
      refs.set(run.id, reference(card, name));
    }
    return commit(
      project,
      {
        ...card,
        execution: {
          ...card.execution!,
          runs: card.execution!.runs.map((run) =>
            refs.has(run.id) ? { ...run, outputRef: refs.get(run.id)! } : run,
          ),
        },
      },
      {
        kind: 'system-event',
        stage: 'execution',
        actionId: null,
        event: 'output-recorded',
        text: 'Restored missing handoff references for previously accepted reports. Original results, verification findings and acceptance decisions are unchanged. No Agent was rerun.',
        refs: [...refs.values()],
      },
      files,
    );
  }

  async function bindLegacyChecklist(
    project: Project,
    cardId: string,
    expectedRevision: number,
    actionId: string,
    criteria: AcceptanceCriterion[],
    note: string,
  ) {
    assertCardUuid(cardId);
    const card = await store.read(project, cardId);
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    const action = card.actions.find((item) => item.id === actionId);
    if (
      card.plan?.status !== 'finalized' ||
      !action ||
      action.acceptanceCriteria?.length ||
      active.has(project.rootPath) ||
      card.execution?.runs.at(-1)?.status === 'running' ||
      card.execution?.acceptedActionIds.includes(actionId)
    )
      throw new Error(
        'Only a legacy unaccepted Action without a checklist can be upgraded.',
      );
    validateAcceptanceCriteria(criteria);
    if (typeof note !== 'string' || !note.trim())
      throw new Error(
        'Record the explicit user authorization for this upgrade.',
      );
    const upgrade = (item: typeof action) =>
      item.id === actionId
        ? { ...item, acceptanceCriteria: structuredClone(criteria) }
        : item;
    return commit(
      project,
      {
        ...card,
        actions: card.actions.map(upgrade),
        plan: { ...card.plan, steps: card.plan.steps.map(upgrade) },
      },
      {
        kind: 'user-input',
        stage: 'execution',
        actionId,
        text: `User authorized a one-time legacy checklist upgrade. ${note} Historical rounds remain unchanged.`,
      },
    );
  }

  async function openWorkspace(
    project: Project,
    cardId: string,
    expectedRevision: number,
  ) {
    assertCardUuid(cardId);
    const card = await store.read(project, cardId);
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    const workspace = card.execution?.workspace;
    if (!workspace) throw new Error('This Card has no workspace yet.');
    await verifyCardWorkspace(workspace);
    const command =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer.exe'
          : process.platform === 'linux'
            ? 'xdg-open'
            : null;
    if (!command)
      throw new Error('Opening the system file manager is unsupported.');
    await promisify(execFile)(command, [workspace.path], { timeout: 10000 });
    return card;
  }

  async function overrideRequiredCheck(
    project: Project,
    cardId: string,
    expectedRevision: number,
    criterionId: string,
    note: string,
  ) {
    assertCardUuid(cardId);
    const card = await store.read(project, cardId);
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    const run = card.execution?.runs.at(-1);
    if (
      !run?.acceptanceChecklist ||
      run.status === 'running' ||
      active.has(project.rootPath) ||
      card.execution!.acceptedActionIds.includes(run.actionId)
    )
      throw new Error(
        'User decisions require a finished, unaccepted Round with a fixed checklist.',
      );
    if (
      !run.acceptanceChecklist.items.some((item) => item.id === criterionId) ||
      typeof note !== 'string' ||
      !note.trim() ||
      note.length > 4000
    )
      throw new Error(
        'Select a required criterion and record the user decision.',
      );
    const decision = {
      note,
      recordedAt: new Date().toISOString(),
      checklistVersion: run.acceptanceChecklist.version,
    };
    return commit(
      project,
      {
        ...card,
        execution: {
          ...card.execution!,
          acceptanceOverrides: {
            ...card.execution?.acceptanceOverrides,
            [run.actionId]: {
              ...card.execution?.acceptanceOverrides?.[run.actionId],
              [criterionId]: decision,
            },
          },
        },
      },
      {
        kind: 'user-input',
        stage: 'execution',
        actionId: run.actionId,
        text: `User accepts required criterion ${criterionId} as passed for checklist ${decision.checklistVersion}. ${note} Actual check results remain unchanged.`,
      },
    );
  }

  async function refreshGitHub(
    project: Project,
    cardId: string,
    expectedRevision: number,
    outputId: string,
  ) {
    assertCardUuid(cardId);
    assertCardUuid(outputId);
    const card = await store.read(project, cardId);
    if (card.revision !== expectedRevision)
      throw new Error('Card changed. Reload before trying again.');
    if (card.execution?.runs.at(-1)?.status === 'running')
      throw new Error('Wait for execution to finish before refreshing GitHub.');
    const run = card.execution?.runs.find((item) => item.id === outputId);
    if (!run?.github)
      throw new Error('No captured GitHub delivery for this output.');
    const github = await refreshGitHubDelivery(run.github, reader);
    return commit(
      project,
      {
        ...card,
        execution: {
          ...card.execution!,
          runs: card.execution!.runs.map((item) =>
            item.id === run.id ? { ...run, github } : item,
          ),
        },
      },
      {
        kind: 'system-event',
        stage: 'execution',
        actionId: run.actionId,
        event: 'output-recorded',
        text:
          github.error ??
          `GitHub status refreshed for output ${run.id}. ${github.pullRequests.map((pr) => `${pr.url}: ${pr.state}`).join('; ')} User acceptance is unchanged.`,
        refs: github.pullRequests.map((pr) => pr.url),
      },
      { 'github-delivery.json': JSON.stringify(github) },
    );
  }

  async function recheckOutput(
    project: Project,
    cardId: string,
    expectedRevision: number,
    outputId: string,
  ) {
    assertCardUuid(cardId);
    assertCardUuid(outputId);
    if (active.has(project.rootPath))
      throw new Error(
        'Wait for project execution to finish before rechecking.',
      );
    const reservation: Active = {
      id: randomUUID(),
      cardId,
      handle: null,
      timer: null,
    };
    active.set(project.rootPath, reservation);
    try {
      const card = await store.read(project, cardId);
      if (card.revision !== expectedRevision)
        throw new Error('Card changed. Reload before trying again.');
      const run = card.execution?.runs.at(-1);
      if (
        !run ||
        run.id !== outputId ||
        run.status !== 'failed' ||
        !run.evidenceErrors ||
        card.execution!.acceptedActionIds.includes(run.actionId)
      )
        throw new Error(
          'Only the latest unaccepted report rejected for evidence can be rechecked.',
        );
      if (hasUnsupportedAppArtifact(run))
        throw new Error(
          'App bundle verification is unsupported. Retrying cannot resolve this until support is added.',
        );
      if (card.execution?.workspace)
        await verifyCardWorkspace(card.execution.workspace);
      const workingProject = workspaceProject(
        project,
        card.execution?.workspace,
      );
      const log = await readCardWorklog(root(project), cardId);
      let request: CardHarnessRequest | undefined;
      let raw: string | undefined;
      let recorded: WorkspaceSnapshot | undefined;
      for (const entry of [...log.entries].reverse()) {
        if (entry.record.stage !== 'execution') continue;
        const directory = path.join(
          root(project),
          cardId,
          String(entry.revision).padStart(8, '0'),
        );
        if (!request) {
          const text = await optionalRecordFile(
            path.join(directory, 'request.json'),
          );
          if (text) {
            const candidate = JSON.parse(text);
            if (candidate.requestId === run.id) request = candidate;
          }
        }
        if (!raw) {
          const text = await optionalRecordFile(
            path.join(directory, 'raw-response.txt'),
          );
          if (text && JSON.parse(text).requestId === run.id) {
            raw = text;
            const snapshot = await optionalRecordFile(
              path.join(directory, 'observed-workspace.json'),
            );
            if (snapshot) recorded = JSON.parse(snapshot);
          }
        }
        if (request && raw && recorded) break;
      }
      if (!request || !raw || !recorded)
        throw new Error('Original report evidence is unavailable.');
      if (JSON.stringify(card.plan) !== JSON.stringify(request.context.plan))
        throw new Error('Plan changed since this report.');
      const current = await snapshotWorkspace(workingProject);
      if (
        current.root !== recorded.root ||
        current.head !== recorded.head ||
        JSON.stringify(
          Object.entries(current.files).sort(([a], [b]) => a.localeCompare(b)),
        ) !==
          JSON.stringify(
            Object.entries(recorded.files).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          )
      )
        throw new Error(
          'Workspace changed since this report. Rechecking cannot certify a different output.',
        );
      let result;
      let versions: string[] = [];
      let external: string[] = [];
      let localArtifacts = JSON.stringify({ artifacts: [] });
      try {
        result = parseCardHarnessResult(
          raw,
          request,
          request.context.contextRevision,
          run.observedRefs,
        );
      } catch (error) {
        if (!(error instanceof ExecutionEvidenceError)) throw error;
        versions = await verifiedOutputVersionRefs(
          recorded,
          error.result.artifactRefs,
        );
        const attachments = await captureLocalAcceptanceArtifacts(
          recorded,
          error.result.artifactRefs,
          run.endedAt!,
        );
        localArtifacts = JSON.stringify({
          capturedAt: new Date().toISOString(),
          meaning:
            'Captured at report recheck; not proof of an original snapshot.',
          artifacts: attachments,
        });
        versions.push(...attachments.map((item) => item.ref));
        external = await verifiedGitHubArtifactRefs(
          workingProject,
          error.result.artifactRefs,
          recorded.head,
          reader,
        );
        result = parseCardHarnessResult(
          raw,
          request,
          request.context.contextRevision,
          [...run.observedRefs, ...versions, ...external],
        );
      }
      if (result.stage !== 'execution')
        throw new Error('Expected an execution report.');
      const github =
        run.github?.outputHead === recorded.head &&
        run.github.repositoryUrl === getGitHubRepositoryUrl(workingProject)
          ? await refreshGitHubDelivery(run.github, reader)
          : await discoverGitHubDelivery(
              workingProject,
              JSON.stringify(result),
              recorded.head,
              reader,
              recorded.head,
            );
      const outputRef = reference(card, 'output.md');
      const nextRun = {
        ...run,
        status: 'succeeded' as const,
        error: null,
        evidenceErrors: undefined,
        result,
        github,
        outputRef,
        verifiedExternalRefs: external,
        verifiedVersionRefs: versions,
        unverifiedCheckRefs: unverifiedCheckRefs(result, request, [
          ...run.observedRefs,
          ...external,
          ...versions,
        ]),
      };
      return commit(
        project,
        replaceRun(card, nextRun),
        {
          kind: 'system-event',
          stage: 'execution',
          actionId: run.actionId,
          event: 'output-recorded',
          text: `Rechecked recorded output ${run.id} against its unchanged workspace and verified references. No Agent commands were rerun. Reported check statuses remain unchanged; no user acceptance was recorded.`,
          refs: [outputRef],
        },
        {
          'result.json': JSON.stringify(result),
          'verified-references.json': JSON.stringify({
            checkedAt: new Date().toISOString(),
            versions,
            external,
          }),
          'local-artifacts.json': localArtifacts,
          'output.md': `# Rechecked Action output\n\n${result.summary}\n\nOutcome: ${result.outcome}\n\nNo Agent commands were rerun. Reported checks and remaining limitations are unchanged.\n\n## Required self-checks\n${result.checks.map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Additional checks (non-blocker)\n${(result.additionalChecks ?? []).map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Remaining\n${result.remaining.map((item) => `- ${item}`).join('\n')}`,
        },
      );
    } finally {
      if (active.get(project.rootPath) === reservation)
        active.delete(project.rootPath);
    }
  }

  async function resetWorkspace(
    project: Project,
    cardId: string,
    expectedRevision: number,
    confirmation?: string,
  ) {
    assertCardUuid(cardId);
    if (active.has(project.rootPath))
      throw new Error('Stop project execution before resetting a Card.');
    const reservation: Active = {
      id: randomUUID(),
      cardId,
      handle: null,
      timer: null,
    };
    active.set(project.rootPath, reservation);
    try {
      const card = await store.read(project, cardId);
      if (card.revision !== expectedRevision)
        throw new Error('Card changed. Reload before trying again.');
      const workspace = card.execution?.workspace;
      const last = card.execution?.runs.at(-1);
      if (
        !workspace ||
        !last ||
        card.execution!.acceptedActionIds.length ||
        card.run?.status === 'running' ||
        !(
          last.status === 'failed' ||
          last.status === 'canceled' ||
          (last.status === 'succeeded' && last.result?.outcome !== 'delivered')
        )
      )
        throw new Error(
          'Only failed, canceled or blocked Cards without accepted Actions can restart from their base.',
        );
      await verifyCardWorkspace(workspace);
      const snapshot = await snapshotWorkspace(
        workspaceProject(project, workspace),
      );
      const repositoryUrl = getGitHubRepositoryUrl(
        workspaceProject(project, workspace),
      );
      if (repositoryUrl) {
        const prs = await reader.branchPullRequests(
          repositoryUrl.slice('https://github.com/'.length),
          workspace.branch,
        );
        if (prs.some((pr) => pr.state === 'MERGED'))
          throw new Error(
            'This Card branch has a merged PR. Use a revert PR instead of a local restart.',
          );
      }
      const token = createHash('sha256')
        .update(
          JSON.stringify({ revision: card.revision, workspace, snapshot }),
        )
        .digest('hex');
      const preview = {
        token,
        path: workspace.path,
        branch: workspace.branch,
        baseCommit: workspace.baseCommit,
        repositoryUrl,
      };
      if (confirmation === undefined) return { preview };
      if (confirmation !== token)
        throw new Error('Workspace changed. Preview the reset again.');
      const restarted = await restartCardWorkspace(project, card);
      try {
        const saved = await commit(
          project,
          {
            ...card,
            execution: {
              runs: [],
              profile: last.profile,
              acceptedActionIds: [],
              workspace: restarted.workspace,
              workspaceBackups: [
                ...(card.execution?.workspaceBackups ?? []),
                restarted.backup,
              ],
            },
          },
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: null,
            event: 'rollback-confirmed',
            text: `User restarted this Card from base ${workspace.baseCommit}. The confirmed Plan is preserved. No Actions are accepted or running. Active worktree: ${restarted.workspace.path}. Previous workspace and branch remain at ${restarted.backup.path}. GitHub and other external effects were not reverted. Next: wait for the user to start the first Action.`,
            refs: [],
          },
        );
        return { card: saved };
      } catch (error) {
        await undoWorkspaceRestart(
          project,
          cardId,
          workspace,
          restarted.workspace,
          restarted.backup,
        );
        throw error;
      }
    } finally {
      if (active.get(project.rootPath) === reservation)
        active.delete(project.rootPath);
    }
  }

  return {
    start,
    update,
    refresh,
    refreshGitHub,
    resetWorkspace,
    recheckOutput,
    overrideRequiredCheck,
    openWorkspace,
    bindLegacyChecklist,
  };
}

async function optionalRecordFile(file: string) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8000000)
      throw new Error('Invalid recorded output file.');
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function unverifiedCheckRefs(
  result: NonNullable<ActionRun['result']>,
  request: CardHarnessRequest,
  refs: string[],
) {
  const known = new Set([
    ...refs,
    ...request.context.resources.map((item) => item.ref),
    ...(request.context.currentOutput?.refs ?? []),
  ]);
  return [
    ...new Set(
      [...result.checks, ...(result.additionalChecks ?? [])]
        .flatMap((check) => check.evidenceRefs)
        .filter((ref) => !known.has(ref)),
    ),
  ];
}

function replaceRun(card: PlanningCard, run: ActionRun): PlanningCard {
  return {
    ...card,
    execution: {
      ...card.execution!,
      ...(run.commit && card.execution?.git
        ? { git: { ...card.execution.git, head: run.commit } }
        : {}),
      runs: card.execution!.runs.map((item) =>
        item.id === run.id ? run : item,
      ),
    },
  };
}

export const executionService = createExecutionService();

function acceptedOutputMarkdown(card: PlanningCard, run: ActionRun) {
  const result = run.result!;
  const decisions = card.execution?.acceptanceOverrides?.[run.actionId] ?? {};
  const checks = result.checks
    .map(
      (check) =>
        `- ${check.criterionId ?? 'unclassified'}: ${check.status} — ${check.summary}\n${check.evidenceRefs.map((ref) => `  - ${ref}`).join('\n')}`,
    )
    .join('\n');
  const overrides = Object.entries(decisions)
    .filter(
      ([, decision]) =>
        decision.checklistVersion === run.acceptanceChecklist?.version,
    )
    .map(
      ([id, decision]) => `- ${id}: ${decision.note} (${decision.recordedAt})`,
    )
    .join('\n');
  return `# Accepted Action output\n\nAction: ${run.actionId}\nRound: ${run.id}\nChecklist: ${run.acceptanceChecklist?.version ?? 'legacy'}\n\n${result.summary}\n\n## Handoff\n${result.handoffSummary}\n\n${run.coordination ? `Coordination context: ${run.coordination.contextSummary}\nCoordination record: ${run.coordination.logRef ?? 'not available'}\nActivity record: ${run.activityRef ?? 'not available'}\n\n` : ''}## Required checks (observed results)\n${checks}\n\n## User decisions\n${overrides || 'None.'}\n\n## Delivery references (Agent-reported)\n${result.artifactRefs.map((ref) => `- ${ref}`).join('\n')}\n\n## System verification findings\n${run.evidenceErrors?.map((error) => `- ${error}`).join('\n') || 'None recorded.'}\n\nUser acceptance does not turn unverified references into verified artifacts.\n\n## Additional checks (non-blocker)\n${(result.additionalChecks ?? []).map((check) => `- ${check.status}: ${check.summary}\n${check.evidenceRefs.map((ref) => `  - ${ref}`).join('\n')}`).join('\n')}\n`;
}

function verificationBasis(snapshot: WorkspaceSnapshot) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        root: snapshot.root,
        files: Object.entries(snapshot.files).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      }),
    )
    .digest('hex');
}
