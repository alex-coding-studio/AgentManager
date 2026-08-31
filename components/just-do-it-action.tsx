'use client';

import { useState } from 'react';
import { LoaderCircle, Check } from 'lucide-react';
import { AgentProfileSelector } from '@/components/agent-profile-selector';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUiText } from '@/components/ui-language-provider';
import type { PlanningCard } from '@/lib/just-do-it-planning-service';
import type { ActionContract } from '@/lib/just-do-it-harness';
import type { AgentProfile } from '@/lib/agent-profile';

export function JustDoItAction({
  projectId,
  card,
  action,
  onChange,
}: {
  projectId: string;
  card: PlanningCard;
  action: ActionContract;
  onChange: (card: PlanningCard) => void;
}) {
  const { t } = useUiText();
  const [instruction, setInstruction] = useState('');
  const [profile, setProfile] = useState<AgentProfile>(
    card.execution?.runs.at(-1)?.profile ??
      card.run?.profile ?? { agent: 'codex', model: '', effort: '' },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const history =
    card.execution?.runs.filter((run) => run.actionId === action.id) ?? [];
  const latest = history.at(-1);
  const accepted =
    card.execution?.acceptedActionIds.includes(action.id) ?? false;
  const current = card.actions.find(
    (item) => !card.execution?.acceptedActionIds.includes(item.id),
  );
  const running = card.execution?.runs.at(-1)?.status === 'running';
  const enabled = current?.id === action.id && !pending && !running;

  async function send(operation: 'start' | 'cancel' | 'accept') {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: operation,
          cardId: card.id,
          actionId: action.id,
          expectedRevision: card.revision,
          instruction,
          profile,
          outputId: latest?.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onChange(data.card);
      if (operation === 'start') setInstruction('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed.');
    } finally {
      setPending(false);
    }
  }

  const stage = accepted ? 2 : latest?.status === 'succeeded' ? 1 : 0;
  return (
    <section className="mt-6 space-y-4 border-t border-border pt-5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        {['Ready to start', 'Ready to verify', 'Verified'].map(
          (label, index) => (
            <div
              key={label}
              className={`border-t-2 pt-2 ${accepted || index < stage ? 'border-emerald-500 text-emerald-500' : index === stage ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'}`}
            >
              {String(index + 1).padStart(2, '0')} · {t(label)}
            </div>
          ),
        )}
      </div>
      {accepted && (
        <p className="flex items-center gap-2 text-sm text-emerald-500">
          <Check className="size-4" />
          {t('This Action was accepted by you.')}
        </p>
      )}
      {card.execution?.git && (
        <p className="text-xs text-muted-foreground">
          {t('Local Git baseline')}:{' '}
          <code>{card.execution.git.baseline.slice(0, 8)}</code> ·{' '}
          {t('App-owned history; separate from repository commits and PRs.')}
        </p>
      )}
      {current?.id !== action.id && !accepted && (
        <p className="text-sm text-muted-foreground">
          {t('Accept earlier Actions before starting this step.')}
        </p>
      )}
      {history.length > 0 && (
        <div className="space-y-3">
          {history.map((run, index) => (
            <details
              key={run.id}
              open={run.id === latest?.id}
              className="rounded-xl border border-border p-4"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {t('Round')} {index + 1} ·{' '}
                {t(
                  accepted && run.id === latest?.id
                    ? 'Verified'
                    : run.status === 'running'
                      ? 'Agent running'
                      : run.status === 'canceled'
                        ? 'Canceled'
                        : run.status === 'failed'
                          ? 'Execution failed'
                          : run.result?.outcome === 'delivered'
                            ? 'Ready to verify'
                            : 'Needs your input',
                )}
              </summary>
              {run.commit && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span>
                    {t('Local version')} · <code>{run.commit.slice(0, 8)}</code>
                  </span>
                  <a
                    className="underline underline-offset-4"
                    href={`/api/projects/${projectId}/execution-history?cardId=${card.id}&runId=${run.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('View version diff')}
                  </a>
                </div>
              )}
              {run.input && (
                <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {t('Your input')}: {run.input}
                </p>
              )}
              {run.status === 'running' && (
                <div className="mt-4 flex items-center gap-3">
                  <LoaderCircle className="size-4 animate-spin text-blue-500" />
                  <span className="text-sm">
                    {run.profile.agent === 'codex' ? 'Codex' : 'Claude'} ·{' '}
                    {t('Agent running')}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void send('cancel')}
                  >
                    {t('Cancel')}
                  </Button>
                </div>
              )}
              {run.error && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-destructive">
                  {run.error}
                </p>
              )}
              {run.result && (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                    {run.result.summary}
                  </p>
                  {run.result.checks.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs text-muted-foreground">
                        {t('Agent-reported checks')}
                      </h4>
                      {run.result.checks.map((check, i) => (
                        <p
                          key={i}
                          className={`text-sm ${check.status === 'failed' ? 'text-destructive' : ''}`}
                        >
                          {t(check.status)} · {check.summary}
                        </p>
                      ))}
                    </div>
                  )}
                  {run.result.remaining.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs text-muted-foreground">
                        {t('Remaining work')}
                      </h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                        {run.result.remaining.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
              {run.observedRefs.some(
                (ref) => !ref.startsWith('checkpoint:'),
              ) && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t('Observed file and Git changes')} ·{' '}
                    {
                      run.observedRefs.filter(
                        (ref) => !ref.startsWith('checkpoint:'),
                      ).length
                    }
                  </summary>
                  <ul className="mt-2 space-y-1 break-all font-mono text-xs">
                    {run.observedRefs
                      .filter((ref) => !ref.startsWith('checkpoint:'))
                      .map((ref) => (
                        <li key={ref}>{ref}</li>
                      ))}
                  </ul>
                </details>
              )}
              {run.status !== 'running' && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t(
                    'Self-checks are not acceptance. Canceling does not revert changes.',
                  )}
                </p>
              )}
            </details>
          ))}
        </div>
      )}
      {!accepted && current?.id === action.id && (
        <>
          <label className="block space-y-2 text-sm">
            <span>
              {t(
                history.length
                  ? 'Feedback for this Action'
                  : 'Additional Action instructions',
              )}
            </span>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              maxLength={20000}
              disabled={pending || running}
              placeholder={t(
                'Add requirements for this step, or leave empty to follow the confirmed Plan.',
              )}
            />
          </label>
          <AgentProfileSelector
            value={profile}
            onChange={setProfile}
            disabled={pending || running}
            label="Execution profile"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              'Starting runs the Agent with project write access. Only this Action runs; you decide acceptance. GitHub merge is not monitored yet.',
            )}
          </p>
          {profile.agent === 'claude' && (
            <p className="text-xs text-muted-foreground">
              {t(
                'Claude can edit project files; commands requiring approval may return blocked in this non-interactive run.',
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={!enabled} onClick={() => void send('start')}>
              {t(history.length ? 'Continue this Action' : 'Start this Action')}
            </Button>
            {latest?.status === 'succeeded' &&
              latest.result &&
              latest.observedRefs.length > 0 && (
                <Button
                  variant="outline"
                  disabled={!enabled}
                  onClick={() => void send('accept')}
                >
                  <Check />
                  {t('Accept this output')}
                </Button>
              )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
