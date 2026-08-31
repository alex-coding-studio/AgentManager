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
  reader = githubReader,
  provisionWorkspace: (
    project: Project,
    card: PlanningCard,
    initializeRepository?: boolean,
  ) => Promise<CardWorkspace | undefined> = ensureCardWorkspace,
  writeRecord = appendCardWorkRecord,
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
      try {
        snapshot = await snapshotWorkspace(workingProject);
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
        nextRun = {
          ...nextRun,
          status: 'failed',
          error: message,
          observedRefs: refs,
          result: error instanceof ExecutionEvidenceError ? error.result : null,
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
          files['rejected-report.json'] = JSON.stringify(nextRun.result);
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
            text: `${message}\nFiles may have changed; no rollback was performed.`,
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
      };
      const prompt = `${buildCardHarnessPrompt(request)}\n\nExecution runtime: work only in ${baseline.root}. This is the Card-owned worktree on branch ${workspace?.branch ?? 'legacy'}. Keep all Actions and Rounds on this branch. The primary checkout ${project.codePath ?? project.rootPath} is not your editing directory. Never switch this worktree to main, reset the primary checkout, or merge into main. Repository commits and pushes belong on this Card branch; only the agreed PR delivery process may merge to main. The planning store ${project.planningPath} is host-owned; do not edit it or call AgentManager mutation APIs. Preserve pre-existing user changes. The host has prepared the local repository and Card branch. Do not reinitialize Git or create a replacement branch. Creating a GitHub repository or publishing branches still requires the signed-off Action or explicit user instruction. A local empty baseline does not authorize pushing the default branch to GitHub. If initializing or publishing a project repository, exclude .agent-manager/ before staging; never publish the host-owned planning store or its private Git history. No automatic merge, rollback, acceptance, or next Action. Use file:relative/path for changed files, deleted:relative/path for removals, or git:full-commit-hash for a commit newly reachable from the final project HEAD in artifactRefs. Command descriptions and external URLs may be included in check evidenceRefs, but remain Agent-reported unless independently verified. Real GitHub repository or PR URLs may appear in artifactRefs; the host verifies the current origin and remote identity, and requires PR HEAD to match this output. A repository link identifies the delivery location, not proof of new files or completed work. The host checks these against before/after snapshots. artifactRefs identify the resulting deliverable or version, not a list of new changes. You may cite an existing file inside this workspace or a commit reachable from the output HEAD when validating or publishing existing work; state clearly when no code changed. Do not cite unrelated input resources, missing files or invented URLs. The host records actual changes separately. Include actual PR URLs in the output summary when PRs were produced; the host queries GitHub to verify their state. Checks are your reported evidence, not user acceptance. The host records a new local Git checkpoint for this round. You may reference checkpoint:${request.requestId} as this round's workspace snapshot when reporting checks without file changes; explicitly state that no code changed and do not invent completed functionality. If permissions prevent an operation, report blocked; never bypass sandbox restrictions. Return the required JSON, not a Markdown envelope.`;
      const saved = await commit(
        project,
        {
          ...card,
          execution: {
            ...card.execution,
            profile: input.profile,
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
        reservation.handle = transport(input.profile.agent, {
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
      handle.canceling = true;
      handle.handle?.cancel();
      await handle.handle?.completion.catch(() => undefined);
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
          replaceRun(saved, { ...saved.execution!.runs.at(-1)!, commit: hash }),
          {
            kind: 'system-event',
            stage: 'execution',
            actionId: run.actionId,
            event: 'output-recorded',
            text: `Recorded canceled-round Git checkpoint ${hash}. No rollback occurred.`,
            refs: [],
          },
        );
      } catch (error) {
        return await commit(
          project,
          replaceRun(saved, {
            ...saved.execution!.runs.at(-1)!,
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
        );
      } finally {
        if (active.get(project.rootPath)?.id === run.id)
          active.delete(project.rootPath);
      }
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
          'output.md': `# Rechecked Action output\n\n${result.summary}\n\nOutcome: ${result.outcome}\n\nNo Agent commands were rerun. Reported checks and remaining limitations are unchanged.\n\n## Agent-reported checks\n${result.checks.map((check) => `- ${check.status}: ${check.summary}`).join('\n')}\n\n## Remaining\n${result.remaining.map((item) => `- ${item}`).join('\n')}`,
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
      result.checks
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
