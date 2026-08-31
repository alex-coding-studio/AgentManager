import { randomUUID } from 'node:crypto';
import type { AgentProfile } from './agent-profile.ts';
import { redactActivity, redactRecord } from './local-agent-activity.ts';
import {
  parseCardHarnessResult,
  type CardHarnessRequest,
} from './just-do-it-harness.ts';
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

type Options = Parameters<typeof startLocalAgentRun>[1];
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
  constructor(
    message: string,
    coordination: CoordinationTrace,
    coordinationRecords: Record<string, string>,
  ) {
    super(message);
    this.coordination = coordination;
    this.coordinationRecords = coordinationRecords;
  }
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
  limits?: typeof coordinationLimits;
}): LocalAgentRun {
  const transport = input.transport ?? startLocalAgentRun;
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
        if (!stopped) progress(phase, redactActivity(activity.summary));
      },
    };
    try {
      child = transport(profile.agent, options);
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
        const workerPrompt = `${input.workerOptions.prompt}\n\nCOORDINATOR ASSIGNMENT (current Action only):\n${JSON.stringify({ instructions: decision.instructions, repairAssessment: decision.repairAssessment, verificationPlan: decision.verificationPlan, priorEvidence: input.priorEvidence.filter((item) => decision.verificationPlan.some((plan) => plan.evidenceIds.includes(item.id))) })}\nPerform only this delta. Do not spawn or launch other Agents, including through shell commands. Return additional work to the host coordinator. Reuse only the referenced applicable evidence, label it as reused, and do not claim its commands ran again. Report all frozen criteria honestly. Keep fixed user/permission/PR boundaries. Return the original required execution JSON.`;
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
        trace.attempts.at(-1)!.summary = parsed.summary;
        basis = await input.readBasis();
        assertActive();
        req = createCoordinationRequest({
          phase: 'qualify',
          task: input.request,
          basis,
          priorEvidence: input.priorEvidence,
          previousContext: trace.contextSummary,
          workerReport: parsed,
          previousDecision: decision,
          repairsRemaining: repairs,
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
