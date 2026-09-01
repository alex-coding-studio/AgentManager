import { randomUUID } from 'node:crypto';
import type { AgentProfile } from './agent-profile.ts';
import { redactActivity, redactRecord } from './local-agent-activity.ts';
import {
  parseCardHarnessResult,
  type CardHarnessRequest,
  type CardHarnessResult,
} from './just-do-it-harness.ts';
import { assessRequiredChecks } from './just-do-it-checklist.ts';
import {
  createCoordinationRequest,
  coordinationPrompt,
  parseCoordinationDecision,
  type CoordinationSettings,
  type CoordinationTrace,
  type PriorEvidence,
} from './just-do-it-coordination.ts';
import {
  startLocalAgentRun,
  type LocalAgentRun,
  type LocalAgentResult,
  type LocalAgentUsage,
} from './local-agent-transport.ts';
import { startEventDrivenWorkerRun } from './event-driven-agent-transport.ts';
import type { CardEnvironmentManifest } from './card-host-operations.ts';

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
  workerAgent: 'codex' | 'claude';
  settings: CoordinationSettings;
  priorEvidence: PriorEvidence[];
  previousContext: string;
  readBasis: () => Promise<string>;
  onProgress: (progress: CoordinationProgress) => void;
  transport?: typeof startLocalAgentRun;
  workerTransport?: typeof startLocalAgentRun;
  limits?: typeof coordinationLimits;
  environment?: CardEnvironmentManifest;
}): LocalAgentRun {
  const transport = input.transport ?? startLocalAgentRun;
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
  let stopped = false;
  let lastWorker: LocalAgentResult | undefined;
  let lastWorkerReport: ExecutionReport | null = null;
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
  ) {
    assertActive();
    if (Buffer.byteLength(prompt) > 1500000)
      throw new Error('Agent prompt exceeds the bounded dispatch size.');
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
      resumeSessionId: undefined,
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
  const completion = (async (): Promise<CoordinatedResult> => {
    try {
      let basis = await input.readBasis();
      assertActive();
      let req = createCoordinationRequest({
        phase: 'prepare',
        task: input.request,
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
        const workerPrompt = `${input.workerOptions.prompt}\n\nCOORDINATOR ASSIGNMENT (current Action only):\n${JSON.stringify({ environment: input.environment, instructions: decision.instructions, repairAssessment: decision.repairAssessment, verificationPlan: decision.verificationPlan, priorEvidence: input.priorEvidence.filter((item) => decision.verificationPlan.some((plan) => plan.evidenceIds.includes(item.id))) })}\nPerform only this delta. Treat the Environment Manifest as Host-verified and do not rediscover its Git/worktree/role facts unless the workspace reports a concrete contradiction. Do not spawn or launch other Agents, including through shell commands. Return additional work to the host coordinator. Reuse only the referenced applicable evidence, label it as reused, and do not claim its commands ran again. Report all frozen criteria honestly. Keep fixed user/permission/PR boundaries. Return the original required execution JSON.`;
        lastWorker = await call('worker', phase, workerPrompt);
        let candidate: unknown;
        try {
          candidate = JSON.parse(lastWorker.finalOutput);
        } catch {
          throw new Error(
            'Worker did not return a valid report; no automatic full-task replay.',
          );
        }
        const claimed = (candidate as { artifactRefs?: unknown }).artifactRefs;
        const parsed = parseCardHarnessResult(
          lastWorker.finalOutput,
          input.request,
          input.request.context.contextRevision,
          Array.isArray(claimed) &&
            claimed.every((item) => typeof item === 'string')
            ? claimed
            : [],
        );
        if (parsed.stage !== 'execution')
          throw new Error('Worker returned another stage.');
        lastWorkerReport = applyMachineContradictions(
          parsed,
          workerCommandOutcomes,
        );
        trace.attempts.at(-1)!.summary = parsed.summary;
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
          trace.contextSummary = [
            trace.contextSummary,
            lastWorkerReport.handoffSummary,
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, 6000);
          trace.attempts.at(-1)!.summary = lastWorkerReport.summary;
          const output = workerOutput(
            input.request,
            lastWorkerReport,
            trace.contextSummary,
          );
          progress('complete', lastWorkerReport.summary);
          return {
            agentSessionId: lastWorker.agentSessionId,
            finalOutput: JSON.stringify(output),
            usage: totalCoordinationUsage(trace),
            executionAccess: lastWorker.executionAccess,
            coordination: trace,
            coordinationRecords: records,
          };
        }
        req = createCoordinationRequest({
          phase: 'qualify',
          task: input.request,
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
        agentSessionId: lastWorker?.agentSessionId ?? response.agentSessionId,
        finalOutput: JSON.stringify(output),
        usage: totalCoordinationUsage(trace),
        executionAccess: lastWorker?.executionAccess,
        coordination: trace,
        coordinationRecords: records,
      };
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
    }
  })();
  return {
    completion,
    cancel: () => {
      stopped = true;
      child?.cancel();
    },
  };
}
