import type { WhatsNextRunRecord } from './whats-next-runs.ts';
import type { DomainModelRunRecord } from './domain-model-runs.ts';

export type LatestResponseTone = 'neutral' | 'attention' | 'warning' | 'error';

export type LatestResponseAttention =
  | 'none'
  | 'unread'
  | 'action-required'
  | 'resolved';

export type LatestResponsePresentation = {
  tone: LatestResponseTone;
  attention: LatestResponseAttention;
  statusLabel: string;
  summary: string;
  icon: 'success' | 'neutral' | 'attention' | 'warning' | 'error';
};

export function latestWhatsNextResponse(
  run: WhatsNextRunRecord,
): LatestResponsePresentation {
  if (run.status === 'failed')
    return {
      tone: 'error',
      attention: 'action-required',
      statusLabel: 'Failed',
      summary: run.error?.trim() || 'The Agent Run failed.',
      icon: 'error',
    };
  if (run.status === 'canceled')
    return {
      tone: 'neutral',
      attention: 'none',
      statusLabel: 'Canceled',
      summary: 'The Agent Run was canceled. The graph was not changed.',
      icon: 'neutral',
    };
  if (run.result?.outcome === 'clarification')
    return {
      tone: 'attention',
      attention: 'action-required',
      statusLabel: 'Answer needed',
      summary: run.result.clarification.question,
      icon: 'attention',
    };
  if (run.result?.outcome === 'no-change')
    return {
      tone: 'neutral',
      attention: 'none',
      statusLabel: 'No change',
      summary: run.result.reason,
      icon: 'neutral',
    };
  return {
    tone: 'neutral',
    attention: 'none',
    statusLabel: continuationLabel(
      run.result?.reflection.continuationAdvice.action,
    ),
    summary: plainMarkdown(run.result?.reflection.markdown ?? ''),
    icon: 'success',
  };
}

export function latestDomainModelResponse(
  run: DomainModelRunRecord,
): LatestResponsePresentation {
  if (run.status === 'failed')
    return {
      tone: 'error',
      attention: 'action-required',
      statusLabel: 'Failed',
      summary: run.error?.trim() || 'The Domain Model Agent failed.',
      icon: 'error',
    };
  if (run.status === 'canceled')
    return {
      tone: 'neutral',
      attention: 'none',
      statusLabel: 'Canceled',
      summary: 'The Agent Run was canceled. The Domain Model was not changed.',
      icon: 'neutral',
    };
  if (run.result?.outcome === 'clarification')
    return {
      tone: 'attention',
      attention: 'action-required',
      statusLabel: 'Answer needed',
      summary: run.result.question,
      icon: 'attention',
    };
  if (run.result?.outcome === 'no-change')
    return {
      tone: 'neutral',
      attention: 'none',
      statusLabel: 'No change',
      summary: run.result.reason,
      icon: 'neutral',
    };
  return {
    tone: 'neutral',
    attention: 'none',
    statusLabel: 'Applied',
    summary: run.result?.summary ?? 'The current Domain Model was updated.',
    icon: 'success',
  };
}

function continuationLabel(
  action: 'continue' | 'consider-closing' | 'consider-branching' | undefined,
) {
  if (action === 'consider-closing') return 'Ready to close';
  if (action === 'consider-branching') return 'Consider branching';
  return 'Continue';
}

function plainMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^Reflection\s*/i, '')
    .trim();
}
