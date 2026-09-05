import {
  COORDINATOR_FALLBACK,
  hostSummary,
  type HostSummaryKind,
} from './summaries.ts';
import type {
  LogActor,
  RecoveryAction,
  ResponseClassification,
  RetainedEffects,
  RunPhase,
} from './types.ts';

export type ClassificationFacts = {
  surface: 'module' | 'card';
  runState:
    | 'settled'
    | 'canceled'
    | 'timed-out'
    | 'ownership-lost'
    | 'termination-unconfirmed';
  outcome?:
    | 'delivered'
    | 'applied'
    | 'proposal'
    | 'no-change'
    | 'clarification'
    | 'insufficient-evidence'
    | 'partial'
    | 'blocked'
    | 'failed'
    | null;
  coordinatorDecision?: 'ready' | 'needs-user' | 'blocked' | null;
  requiredChecks?: {
    total: number;
    passed: number;
    failed: number;
    notRun: number;
  } | null;
  additionalFindings?: string[];
  failure?: {
    kind: Exclude<
      HostSummaryKind,
      'canceled' | 'timed-out' | 'ownership-lost' | 'termination-unconfirmed'
    >;
    message: string;
  } | null;
  externalPending?: { label: string } | null;
  interruptedPhase?: RunPhase | null;
  interruptedActor?: LogActor | null;
  retained?: RetainedEffects | null;
  accepted?: boolean;
  semantic?: { title: string; detail: string } | null;
  question?: string | null;
  missingEvidence?: string[];
  reason?: string | null;
  summary?: string | null;
};

const completedTitles: Record<string, string> = {
  delivered: 'Delivered',
  applied: 'Applied',
  proposal: 'Review',
  'no-change': 'No change',
};

export function classifyResponse(
  facts: ClassificationFacts,
): ResponseClassification {
  const undo: RecoveryAction[] = facts.surface === 'card' ? ['undo'] : [];
  const semantic = cleanSemantic(facts.semantic);
  const context = {
    interruptedPhase: facts.interruptedPhase,
    interruptedActor: facts.interruptedActor,
    retained: facts.retained,
  };

  if (facts.runState === 'termination-unconfirmed')
    return fail(hostSummary('termination-unconfirmed', context), [
      'log',
      'inspect-workspace',
    ]);
  if (facts.runState === 'ownership-lost')
    return fail(hostSummary('ownership-lost', context), [
      'log',
      'inspect-workspace',
    ]);
  if (facts.runState === 'canceled')
    return warning(hostSummary('canceled', context), [
      'log',
      'continue',
      ...undo,
    ]);
  if (facts.runState === 'timed-out')
    return fail(hostSummary('timed-out', context), [
      'log',
      'continue',
      ...undo,
    ]);
  if (facts.failure) {
    const summary = hostSummary(facts.failure.kind, context);
    const reread: RecoveryAction[] =
      facts.failure.kind === 'parse' ||
      facts.failure.kind === 'schema' ||
      facts.failure.kind === 'host-verification'
        ? ['reread']
        : [];
    return fail(
      semantic ? { title: summary.title, detail: semantic.detail } : summary,
      ['log', ...reread, ...undo],
    );
  }
  const checks = facts.requiredChecks;
  if ((checks && checks.failed > 0) || facts.outcome === 'failed') {
    const failed = checks?.failed ?? 0;
    return fail(
      semantic ?? {
        title: 'Required checks failed',
        detail:
          failed > 0
            ? `${failed} of ${checks?.total ?? failed} required checks failed. Continue with a changed implementation instruction, or open the Run Log for the original findings.`
            : 'The Agent reported a failure. The original findings are preserved in the Run Log.',
      },
      ['log', 'continue', ...undo],
    );
  }
  if (
    facts.outcome === 'clarification' ||
    facts.outcome === 'insufficient-evidence' ||
    facts.coordinatorDecision === 'needs-user'
  ) {
    const missing = facts.missingEvidence?.filter(Boolean) ?? [];
    const detail =
      semantic?.detail ??
      facts.question?.trim() ??
      (missing.length ? `Missing: ${missing.join('; ')}` : null) ??
      COORDINATOR_FALLBACK.detail;
    return warning(
      {
        title:
          semantic?.title ??
          (facts.outcome === 'clarification'
            ? 'Answer needed'
            : facts.outcome === 'insufficient-evidence'
              ? 'More evidence needed'
              : 'Decision needed'),
        detail,
      },
      ['log', 'answer'],
    );
  }
  if (facts.outcome === 'blocked' || facts.coordinatorDecision === 'blocked')
    return warning(
      semantic ?? {
        title: 'Blocked',
        detail:
          facts.summary?.trim() ||
          'A recoverable condition blocks this Run. The Run Log names it.',
      },
      ['log', 'continue', ...undo],
    );
  if (checks && (checks.notRun > 0 || checks.passed < checks.total)) {
    const missing = Math.max(checks.notRun, checks.total - checks.passed);
    return warning(
      {
        title: semantic?.title ?? 'Required checks incomplete',
        detail:
          semantic?.detail ??
          `${missing} of ${checks.total} required checks did not run, so the result is not verified. Continue to run them, or open the Run Log for what was recorded.`,
      },
      ['log', 'continue', ...undo],
    );
  }
  if (facts.externalPending)
    return warning(
      {
        title: 'Pending',
        detail:
          semantic?.detail ??
          `${facts.externalPending.label} is still pending. Refresh it to pick up the latest state.`,
      },
      ['log', 'refresh-external'],
    );
  if (facts.outcome === 'partial')
    return warning(
      semantic ?? {
        title: 'Partial result preserved',
        detail:
          facts.summary?.trim() ||
          'Part of the result was saved and can be continued.',
      },
      ['log', 'continue', ...undo],
    );
  const pass: RecoveryAction[] =
    facts.surface === 'card' && !facts.accepted ? ['pass'] : [];
  return {
    status: 'completed',
    title: facts.accepted
      ? 'Accepted'
      : (semantic?.title ??
        completedTitles[facts.outcome ?? ''] ??
        'Completed'),
    detail:
      semantic?.detail ??
      facts.summary?.trim() ??
      facts.reason?.trim() ??
      'The Run completed and every required condition passed.',
    supplementaryWarnings: facts.additionalFindings?.filter(Boolean) ?? [],
    recovery: ['log', 'continue', ...pass],
  };
}

function cleanSemantic(value: ClassificationFacts['semantic']) {
  if (!value) return null;
  const title = value.title.trim();
  const detail = value.detail.trim();
  return title && detail ? { title, detail } : null;
}

function fail(
  summary: { title: string; detail: string },
  recovery: RecoveryAction[],
): ResponseClassification {
  return {
    status: 'fail',
    ...summary,
    supplementaryWarnings: [],
    recovery,
  };
}

function warning(
  summary: { title: string; detail: string },
  recovery: RecoveryAction[],
): ResponseClassification {
  return {
    status: 'warning',
    ...summary,
    supplementaryWarnings: [],
    recovery,
  };
}
