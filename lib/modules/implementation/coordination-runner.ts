import { randomUUID } from 'node:crypto';
import type { AgentProfile } from '../../agents/profile.ts';
import { redactActivity, redactRecord } from '../../agents/activity.ts';
import {
  parseCardHarnessResult,
  type CardHarnessRequest,
  type CardHarnessResult,
} from './harness.ts';
import { assessRequiredChecks } from './checklist.ts';
import {
  createCoordinationRequest,
  coordinationPrompt,
  parseCoordinationDecision,
  type CoordinationDecision,
  type CoordinationSettings,
  type CoordinationTrace,
  type PriorEvidence,
} from './coordination.ts';
import {
  startLocalAgentRun,
  type LocalAgentRun,
  type LocalAgentResult,
  type LocalAgentUsage,
} from '../../agents/transport.ts';
import {
  startEventDrivenWorkerRun,
  startPushCoordinatorSession,
  type CoordinatorSession,
  type CoordinatorSessionInput,
} from '../../agents/event-driven-transport.ts';
import type { CardEnvironmentManifest } from '../../card-host-operations.ts';
import type {
  AgentRuntimeEvent,
  AgentRuntimeTurn,
  HostTool,
  HostToolContinuation,
} from '../../agents/runtime-driver.ts';
import { readCodexSkills, type SkillCatalog } from '../../agents/skills.ts';
import { executionResponsibilityInstructions } from './execution-responsibilities.ts';
import {
  allowedDecisionsAfter,
  classifyWorkerSettlement,
  coordinatorThreadInstructions,
  dispatchWorkerTool,
  workerSettlementPrompt,
  type WorkerSettlement,
} from './coordinator-events.ts';

type Options = Parameters<typeof startLocalAgentRun>[1];
type ExecutionReport = Extract<CardHarnessResult, { stage: 'execution' }>;
export const coordinationLimits = {
  maxAgentCalls: 5,
  maxWorkerCalls: 2,
  maxCoordinatorToolCalls: 40,
  coordinatorTimeoutMs: 300000,
};
export type CoordinationProgress = {
  phase: string;
  summary: string;
  updatedAt: string;
  attempts: number;
};
export type CoordinatedResult = LocalAgentResult & {
  coordination: CoordinationTrace;
  coordinationRecords: Record<string, string>;
};
export class CoordinationRunError extends Error {
  coordination: CoordinationTrace;
  coordinationRecords: Record<string, string>;
  workerReport: ExecutionReport | null;
  constructor(
    message: string,
    coordination: CoordinationTrace,
    coordinationRecords: Record<string, string>,
    workerReport: ExecutionReport | null = null,
  ) {
    super(message);
    this.coordination = coordination;
    this.coordinationRecords = coordinationRecords;
    this.workerReport = workerReport;
  }
}

function currentAdditionalChecks(report: ExecutionReport) {
  return (report.additionalChecks ?? []).filter(
    (check) =>
      !check.resolved && (check.needsAttention ?? check.status !== 'passed'),
  );
}

function workerOutput(
  request: CardHarnessRequest,
  report: ExecutionReport,
  contextSummary: string,
) {
  return {
    harnessRevision: request.harnessRevision,
    requestId: request.requestId,
    cardId: request.context.cardId,
    contextRevision: request.context.contextRevision,
    inputFingerprint: request.inputFingerprint,
    handoffSummary: contextSummary,
    stage: 'execution' as const,
    actionId: request.actionId,
    outcome: report.outcome,
    summary: report.summary,
    artifactRefs: report.artifactRefs,
    checks: report.checks,
    additionalChecks: currentAdditionalChecks(report),
    scopeNotes: report.scopeNotes ?? [],
    remaining: [],
  };
}

function applyMachineContradictions(
  report: ExecutionReport,
  outcomes: Map<string, number>,
): ExecutionReport {
  const checks = report.checks.map((check) => {
    if (check.status !== 'passed') return check;
    for (const ref of check.evidenceRefs) {
      const claim = ref.match(/^command:(?:final\s+)?(.+?)\s+exit\s+0$/i);
      if (!claim) continue;
      const observed = [...outcomes.entries()].findLast(([command]) =>
        command.includes(claim[1]),
      );
      if (observed && observed[1] !== 0)
        return {
          ...check,
          status: 'failed' as const,
          summary: `Machine evidence contradicts the self-check: ${claim[1]} exited ${observed[1]}.`,
          evidenceRefs: [...check.evidenceRefs, `observed-exit:${observed[1]}`],
        };
    }
    return check;
  });
  return { ...report, checks };
}
export function totalCoordinationUsage(
  trace: CoordinationTrace,
): LocalAgentUsage | null {
  const usages = trace.attempts.flatMap((attempt) =>
    attempt.usage ? [attempt.usage] : [],
  );
  if (!usages.length || usages.length !== trace.attempts.length) return null;
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
      cacheWriteInputTokens:
        total.cacheWriteInputTokens + usage.cacheWriteInputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      reasoningOutputTokens:
        total.reasoningOutputTokens + usage.reasoningOutputTokens,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
  );
}

export function startCoordinatedExecution(input: {
  request: CardHarnessRequest;
  workerOptions: Options;
  workerAgent: 'codex' | 'claude' | 'deepseek';
  settings: CoordinationSettings;
  priorEvidence: PriorEvidence[];
  previousContext: string;
  readBasis: () => Promise<string>;
  onProgress: (progress: CoordinationProgress) => void;
  transport?: typeof startLocalAgentRun;
  workerTransport?: typeof startLocalAgentRun;
  limits?: typeof coordinationLimits;
  environment?: CardEnvironmentManifest;
  resumeWorkerSessionId?: string;
  coordinatorSession?: (
    input: CoordinatorSessionInput,
  ) => Promise<CoordinatorSession | null>;
  discoverSkills?: typeof readCodexSkills;
}): LocalAgentRun {
  const transport = input.transport ?? startLocalAgentRun;
  const coordinatorSession =
    input.coordinatorSession ??
    (input.transport && input.transport !== startLocalAgentRun
      ? async () => null
      : startPushCoordinatorSession);
  let dispatchHandler: HostTool['call'] | undefined;
  const dispatchTool: HostTool = {
    ...dispatchWorkerTool,
    call: (arguments_) =>
      dispatchHandler
        ? dispatchHandler(arguments_)
        : Promise.reject(new Error('Coordinator thread is not ready.')),
  };
  const workerTransport =
    input.workerTransport ?? input.transport ?? startEventDrivenWorkerRun;
  const limits = input.limits ?? coordinationLimits;
  const trace: CoordinationTrace = {
    profile: input.settings.profile,
    attempts: [],
    decisions: [],
    contextSummary: input.previousContext,
  };
  const records: Record<string, string> = {};
  let child: LocalAgentRun | undefined;
  let coordinatorTurn: AgentRuntimeTurn | undefined;
  let session: CoordinatorSession | undefined;
  let stopped = false;
  let lastWorker: LocalAgentResult | undefined;
  let lastWorkerReport: ExecutionReport | null = null;
  let skillCatalog: SkillCatalog | undefined;
  let availableSkills = input.request.context.skills;
  const workerCommandOutcomes = new Map<string, number>();
  const assertActive = () => {
    if (stopped) throw new Error('Coordinated execution stopped.');
  };
  const progress = (phase: string, summary: string) =>
    input.onProgress({
      phase,
      summary,
      updatedAt: new Date().toISOString(),
      attempts: trace.attempts.length,
    });
  async function call(
    role: 'coordinator' | 'worker',
    phase: 'prepare' | 'execute' | 'qualify' | 'repair',
    prompt: string,
    allowedSkillPaths?: string[],
  ) {
    assertActive();
    if (Buffer.byteLength(prompt) > 1500000)
      throw new Error('Agent prompt exceeds the bounded dispatch size.');
    const resumeWorkerSession =
      role === 'worker' &&
      !trace.attempts.some((item) => item.role === 'worker')
        ? input.resumeWorkerSessionId
        : undefined;
    if (
      trace.attempts.length >= limits.maxAgentCalls ||
      (role === 'worker' &&
        trace.attempts.filter((a) => a.role === 'worker').length >=
          limits.maxWorkerCalls)
    )
      throw new Error('Coordinator dispatch budget exhausted.');
    let toolCalls = 0;
    let budgetError: Error | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const profile: AgentProfile =
      role === 'coordinator'
        ? input.settings.profile
        : {
            agent: input.workerAgent,
            model: input.workerOptions.model ?? '',
            effort: input.workerOptions.effort ?? '',
          };
    const attempt = {
      id: randomUUID(),
      role,
      phase,
      profile,
      startedAt: new Date().toISOString(),
      endedAt: null as string | null,
      sessionId: null as string | null,
      usage: null as LocalAgentUsage | null,
      summary: '',
    };
    trace.attempts.push(attempt);
    records[`${attempt.id}-request.txt`] = redactRecord(prompt);
    progress(
      phase,
      role === 'coordinator'
        ? 'Coordinator is preparing or assessing the Action.'
        : 'Worker is executing the bounded assignment.',
    );
    const options: Options = {
      ...input.workerOptions,
      prompt,
      model: profile.model || undefined,
      effort: profile.effort || undefined,
      access: role === 'coordinator' ? 'read-only' : 'workspace-write',
      allowedSkillPaths: role === 'worker' ? allowedSkillPaths : undefined,
      resumeSessionId: resumeWorkerSession,
      isolatedProcessGroup: true,
      disableDelegation: true,
      onActivity: (activity) => {
        if (
          !budgetError &&
          role === 'coordinator' &&
          activity.kind === 'tool' &&
          activity.phase === 'started' &&
          ++toolCalls > limits.maxCoordinatorToolCalls
        ) {
          budgetError = new Error('Coordinator tool-call budget exhausted.');
          child?.cancel();
        }
        if (role === 'worker' && activity.kind === 'tool') {
          const match = activity.summary.match(
            /^Finished: ([\s\S]+) \(exit (\d+)\)$/,
          );
          if (match) workerCommandOutcomes.set(match[1], Number(match[2]));
        }
        if (!stopped) progress(phase, redactActivity(activity.summary));
      },
    };
    try {
      child =
        role === 'worker'
          ? workerTransport(profile.agent, options)
          : transport(profile.agent, options);
      if (role === 'coordinator')
        deadline = setTimeout(() => {
          budgetError = new Error('Coordinator call timed out.');
          child?.cancel();
        }, limits.coordinatorTimeoutMs);
      const result = await child.completion;
      if (budgetError) throw budgetError;
      attempt.sessionId = result.agentSessionId;
      attempt.usage = result.usage;
      records[`${attempt.id}-response.txt`] = redactRecord(
        result.finalOutput.slice(0, 1000000),
      );
      assertActive();
      return result;
    } catch (error) {
      const cause = budgetError ?? error;
      attempt.summary =
        cause instanceof Error ? cause.message : 'Agent call failed.';
      throw cause;
    } finally {
      if (deadline) clearTimeout(deadline);
      attempt.endedAt = new Date().toISOString();
      child = undefined;
    }
  }
  const workerPromptFor = (decision: CoordinationDecision) => {
    const selectedSkills = availableSkills.filter((skill) =>
      decision.skillPaths.includes(skill.path),
    );
    return `${input.workerOptions.prompt}

COORDINATOR ASSIGNMENT (current Action only):
${JSON.stringify({ responsibilities: decision.responsibilities, responsibilityInstructions: executionResponsibilityInstructions(decision.responsibilities), skills: selectedSkills, environment: input.environment, instructions: decision.instructions, repairAssessment: decision.repairAssessment, verificationPlan: decision.verificationPlan, priorEvidence: input.priorEvidence.filter((item) => decision.verificationPlan.some((plan) => plan.evidenceIds.includes(item.id))) })}
The Coordinator-assigned responsibilities, responsibilityInstructions, Skills and packet are hard requirements and supersede conflicting generic execution guidance. Apply all assigned responsibilities together. Do not choose, remove or change your roles or reopen the task plan. Read each assigned SKILL.md once, then read only the references that Skill or the assignment requires. Do not read unrelated Skills, broad Memory or old logs. If the assigned responsibilities cannot complete part of the packet, set responsibilityGap to the exact missing role boundary, report blocked, and stop; do not expand your own role. Perform only this packet and return its result. Do not coordinate other roles, expand the task, or plan follow-on work. Treat the Environment Manifest as Host-verified and do not rediscover its Git/worktree/role facts unless the workspace reports a concrete contradiction. When information, capability, permission or another action is missing, report exactly what is needed and stop. Do not spawn or launch other Agents, including through shell commands. Reuse only the referenced applicable evidence, label it as reused, and do not claim its commands ran again. Report all frozen criteria honestly. Keep fixed user/permission/PR boundaries. Return the original required execution JSON.`;
  };
  const parseWorkerReport = (raw: string): ExecutionReport => {
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      throw new Error(
        'Worker did not return a valid report; no automatic full-task replay.',
      );
    }
    const claimed = (candidate as { artifactRefs?: unknown }).artifactRefs;
    const parsed = parseCardHarnessResult(
      raw,
      input.request,
      input.request.context.contextRevision,
      Array.isArray(claimed) &&
        claimed.every((item) => typeof item === 'string')
        ? claimed
        : [],
    );
    if (parsed.stage !== 'execution')
      throw new Error('Worker returned another stage.');
    return applyMachineContradictions(parsed, workerCommandOutcomes);
  };
  const deliveredResult = (
    report: ExecutionReport,
    worker: LocalAgentResult,
  ): CoordinatedResult => {
    trace.contextSummary = [trace.contextSummary, report.handoffSummary]
      .filter(Boolean)
      .join('\n')
      .slice(0, 6000);
    const output = workerOutput(input.request, report, trace.contextSummary);
    progress('complete', report.summary);
    return {
      agentSessionId: worker.agentSessionId,
      finalOutput: JSON.stringify(output),
      usage: totalCoordinationUsage(trace),
      executionAccess: worker.executionAccess,
      coordination: trace,
      coordinationRecords: records,
    };
  };
  const terminalResult = (
    decision: CoordinationDecision,
    sessionId: string | null,
  ): CoordinatedResult => {
    const output = {
      harnessRevision: input.request.harnessRevision,
      requestId: input.request.requestId,
      cardId: input.request.context.cardId,
      contextRevision: input.request.context.contextRevision,
      inputFingerprint: input.request.inputFingerprint,
      handoffSummary: decision.contextSummary || decision.summary,
      stage: 'execution',
      actionId: input.request.actionId,
      outcome: decision.decision === 'ready' ? 'delivered' : 'blocked',
      summary: decision.summary,
      artifactRefs: decision.artifactRefs,
      checks: decision.checks,
      additionalChecks: decision.additionalFindings
        .filter((item) => !item.resolved && item.needsAttention)
        .map(
          ({ resolved: _resolved, needsAttention: _attention, ...item }) =>
            item,
        ),
      scopeNotes: decision.scopeNotes,
      remaining: [],
    };
    progress('complete', decision.summary);
    return {
      agentSessionId: lastWorker?.agentSessionId ?? sessionId,
      finalOutput: JSON.stringify(output),
      usage: totalCoordinationUsage(trace),
      executionAccess: lastWorker?.executionAccess,
      coordination: trace,
      coordinationRecords: records,
    };
  };
  async function runThreaded(
    active: CoordinatorSession,
  ): Promise<CoordinatedResult> {
    session = active;
    const driver = active.driver;
    let basis = await input.readBasis();
    assertActive();
    let req = createCoordinationRequest({
      phase: 'prepare',
      task: input.request,
      availableSkills,
      basis,
      priorEvidence: input.priorEvidence,
      previousContext: trace.contextSummary,
      workerReport: null,
      previousDecision: null,
      repairsRemaining: 1,
      environment: input.environment,
    });
    let repairs = 1;
    let workerBusy = false;
    let delivered: CoordinatedResult | undefined;
    let continuationPrompt = '';
    const recordDecision = (decision: CoordinationDecision) => {
      trace.decisions.push(decision);
      const attempt = trace.attempts.findLast((a) => a.role === 'coordinator');
      if (attempt) attempt.summary = decision.summary;
      trace.contextSummary = decision.contextSummary;
    };
    const dispatch = async (
      decision: CoordinationDecision,
    ): Promise<HostToolContinuation> => {
      if (decision.decision !== 'dispatch' && decision.decision !== 'repair')
        throw new Error(
          'dispatch_worker accepts only dispatch or repair decisions.',
        );
      const phase = decision.decision === 'repair' ? 'repair' : 'execute';
      if (phase === 'repair') {
        if (repairs < 1)
          throw new Error('Coordinator repair budget exhausted.');
        repairs--;
      }
      let settlement: WorkerSettlement;
      try {
        lastWorker = await call(
          'worker',
          phase,
          workerPromptFor(decision),
          decision.skillPaths,
        );
        lastWorkerReport = parseWorkerReport(lastWorker.finalOutput);
        trace.attempts.at(-1)!.summary = lastWorkerReport.summary;
        settlement = classifyWorkerSettlement(lastWorkerReport);
      } catch (error) {
        assertActive();
        const message =
          error instanceof Error ? error.message : 'Worker call failed.';
        if (/budget exhausted|bounded dispatch size/.test(message)) throw error;
        settlement = { kind: 'failed', reason: message };
      }
      basis = await input.readBasis();
      assertActive();
      if (settlement.kind === 'completed') {
        const required = assessRequiredChecks(
          input.request.context.acceptanceChecklist,
          settlement.report.checks,
          input.request.context.acceptanceOverrides,
        );
        if (required.passed) {
          delivered = deliveredResult(settlement.report, lastWorker!);
          return { finalOutput: delivered.finalOutput };
        }
      }
      req = createCoordinationRequest({
        phase: 'qualify',
        task: input.request,
        availableSkills,
        basis,
        priorEvidence: input.priorEvidence,
        previousContext: trace.contextSummary,
        workerReport:
          settlement.kind === 'failed'
            ? { checks: [], artifactRefs: [], summary: settlement.reason }
            : settlement.report,
        previousDecision: decision,
        repairsRemaining: settlement.kind === 'failed' ? 0 : repairs,
        environment: input.environment,
      });
      progress(
        'qualify',
        settlement.kind === 'failed'
          ? 'Worker failed; resuming the coordinator.'
          : settlement.kind === 'attention-required'
            ? 'Worker needs attention; resuming the coordinator.'
            : 'Worker completed with unresolved checks; resuming the coordinator.',
      );
      continuationPrompt = workerSettlementPrompt(
        settlement,
        req,
        allowedDecisionsAfter(settlement, req.repairsRemaining),
      );
      return { prompt: continuationPrompt };
    };
    dispatchHandler = async (arguments_) => {
      assertActive();
      if (workerBusy)
        throw new Error('A worker is already dispatched for this Action.');
      const decision = parseCoordinationDecision(
        JSON.stringify(arguments_.decision ?? null),
        req,
      );
      recordDecision(decision);
      workerBusy = true;
      const continuation = dispatch(decision).finally(() => {
        workerBusy = false;
      });
      return {
        suspend: true as const,
        acknowledgement: `Worker dispatched (${decision.decision}). Praxis suspends this coordination turn and resumes this thread when the worker settles. Do not poll, wait or call another tool.`,
        continuation,
      };
    };
    const thread = await driver.startThread({
      profile: input.settings.profile,
      workingDirectory: input.workerOptions.workingDirectory,
      access: 'read-only',
      instructions: coordinatorThreadInstructions,
      hostJobs: false,
    });
    const runTurn = (prompt: string, initial: boolean) =>
      new Promise<LocalAgentResult>((resolve, reject) => {
        assertActive();
        if (Buffer.byteLength(prompt) > 1500000)
          throw new Error('Agent prompt exceeds the bounded dispatch size.');
        let toolCalls = 0;
        let budgetError: Error | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        let attempt: (typeof trace.attempts)[number] | undefined;
        let pendingPrompt = prompt;
        const clearDeadline = () => {
          if (deadline) clearTimeout(deadline);
          deadline = undefined;
        };
        const fail = (error: Error) => {
          budgetError ??= error;
          coordinatorTurn?.interrupt();
        };
        const onEvent = (event: AgentRuntimeEvent) => {
          if (event.type === 'turn-started') {
            if (trace.attempts.length >= limits.maxAgentCalls) {
              fail(new Error('Coordinator dispatch budget exhausted.'));
              return;
            }
            toolCalls = 0;
            attempt = {
              id: randomUUID(),
              role: 'coordinator',
              phase: trace.attempts.some((a) => a.role === 'coordinator')
                ? 'qualify'
                : 'prepare',
              profile: input.settings.profile,
              startedAt: event.at,
              endedAt: null,
              sessionId: thread.threadId,
              usage: null,
              summary: '',
            };
            trace.attempts.push(attempt);
            records[`${attempt.id}-request.txt`] = redactRecord(pendingPrompt);
            progress(
              attempt.phase,
              'Coordinator is preparing or assessing the Action.',
            );
            deadline = setTimeout(
              () => fail(new Error('Coordinator call timed out.')),
              limits.coordinatorTimeoutMs,
            );
          } else if (event.type === 'activity') {
            if (
              !budgetError &&
              event.summary.startsWith('Running') &&
              ++toolCalls > limits.maxCoordinatorToolCalls
            )
              fail(new Error('Coordinator tool-call budget exhausted.'));
            if (!stopped)
              progress(
                attempt?.phase ?? 'prepare',
                redactActivity(event.summary),
              );
          } else if (event.type === 'tool-suspended') {
            clearDeadline();
            progress(
              'dispatch',
              'Coordinator dispatched a worker; the coordination thread is suspended.',
            );
          } else if (event.type === 'tool-resumed') {
            pendingPrompt = continuationPrompt;
          } else if (event.type === 'turn-completed') {
            clearDeadline();
            if (attempt) {
              attempt.endedAt = event.at;
              attempt.usage = event.usage;
            }
          }
        };
        coordinatorTurn = driver.startTurn(thread, {
          prompt: initial ? active.decoratePrompt(prompt) : prompt,
          onEvent,
        });
        coordinatorTurn.completion.then(
          (result) => {
            clearDeadline();
            coordinatorTurn = undefined;
            if (budgetError) {
              if (attempt) attempt.summary = budgetError.message;
              reject(budgetError);
              return;
            }
            if (attempt)
              records[`${attempt.id}-response.txt`] = redactRecord(
                result.finalOutput.slice(0, 1000000),
              );
            resolve({
              agentSessionId: result.threadId,
              finalOutput: result.finalOutput,
              usage: result.usage,
            });
          },
          (error: Error) => {
            clearDeadline();
            coordinatorTurn = undefined;
            const cause = budgetError ?? error;
            if (attempt) attempt.summary = cause.message;
            reject(cause);
          },
        );
      });
    let prompt = coordinationPrompt(req);
    let initial = true;
    while (true) {
      const response = await runTurn(prompt, initial);
      initial = false;
      assertActive();
      if (delivered) return delivered;
      const decision = parseCoordinationDecision(response.finalOutput, req);
      if (decision.decision === 'dispatch' || decision.decision === 'repair') {
        recordDecision(decision);
        const continuation = await dispatch(decision);
        if ('finalOutput' in continuation) return delivered!;
        prompt = continuation.prompt;
        continue;
      }
      recordDecision(decision);
      return terminalResult(decision, thread.threadId);
    }
  }
  async function runLegacy(): Promise<CoordinatedResult> {
    {
      let basis = await input.readBasis();
      assertActive();
      let req = createCoordinationRequest({
        phase: 'prepare',
        task: input.request,
        availableSkills,
        basis,
        priorEvidence: input.priorEvidence,
        previousContext: trace.contextSummary,
        workerReport: null,
        previousDecision: null,
        repairsRemaining: 1,
        environment: input.environment,
      });
      let response = await call(
        'coordinator',
        'prepare',
        coordinationPrompt(req),
      );
      let decision = parseCoordinationDecision(response.finalOutput, req);
      let repairs = 1;
      while (true) {
        assertActive();
        trace.decisions.push(decision);
        trace.attempts.at(-1)!.summary = decision.summary;
        trace.contextSummary = decision.contextSummary;
        if (decision.decision !== 'dispatch' && decision.decision !== 'repair')
          break;
        const phase = decision.decision === 'repair' ? 'repair' : 'execute';
        if (phase === 'repair') {
          if (repairs < 1)
            throw new Error('Coordinator repair budget exhausted.');
          repairs--;
        }
        lastWorker = await call(
          'worker',
          phase,
          workerPromptFor(decision),
          decision.skillPaths,
        );
        lastWorkerReport = parseWorkerReport(lastWorker.finalOutput);
        trace.attempts.at(-1)!.summary = lastWorkerReport.summary;
        basis = await input.readBasis();
        assertActive();
        const required = assessRequiredChecks(
          input.request.context.acceptanceChecklist,
          lastWorkerReport.checks,
          input.request.context.acceptanceOverrides,
        );
        if (required.passed) {
          if (lastWorkerReport.outcome !== 'delivered')
            throw new Error(
              'Worker reported all required checks passed but did not deliver the Action.',
            );
          return deliveredResult(lastWorkerReport, lastWorker);
        }
        req = createCoordinationRequest({
          phase: 'qualify',
          task: input.request,
          availableSkills,
          basis,
          priorEvidence: input.priorEvidence,
          previousContext: trace.contextSummary,
          workerReport: lastWorkerReport,
          previousDecision: decision,
          repairsRemaining: repairs,
          environment: input.environment,
        });
        response = await call(
          'coordinator',
          'qualify',
          coordinationPrompt(req),
        );
        decision = parseCoordinationDecision(response.finalOutput, req);
      }
      assertActive();
      return terminalResult(decision, response.agentSessionId);
    }
  }
  const completion = (async (): Promise<CoordinatedResult> => {
    try {
      if (input.discoverSkills) {
        skillCatalog = await input.discoverSkills(
          input.workerOptions.workingDirectory,
        );
        availableSkills = skillCatalog.skills
          .filter((skill) => skill.enabled)
          .map(({ name, path }) => ({ name, path }));
      }
      const active = await coordinatorSession({
        profile: input.settings.profile,
        workingDirectory: input.workerOptions.workingDirectory,
        protectedPath: input.workerOptions.protectedPath,
        hostTools: [dispatchTool],
        skillCatalog,
      });
      assertActive();
      return active ? await runThreaded(active) : await runLegacy();
    } catch (error) {
      const attempt = trace.attempts.at(-1);
      if (attempt)
        attempt.error =
          error instanceof Error
            ? redactActivity(error.message)
            : 'Coordination failed.';
      throw new CoordinationRunError(
        error instanceof Error ? error.message : 'Coordination failed.',
        trace,
        records,
        lastWorkerReport,
      );
    } finally {
      await session?.driver.close().catch(() => undefined);
    }
  })();
  return {
    completion,
    cancel: () => {
      stopped = true;
      child?.cancel();
      coordinatorTurn?.interrupt();
      void session?.driver.close().catch(() => undefined);
    },
  };
}
