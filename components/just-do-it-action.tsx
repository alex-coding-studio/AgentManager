'use client';

import { useState } from 'react';
import { assessRequiredChecks, splitChecks } from '@/lib/just-do-it-checklist';
import { LoaderCircle, Check } from 'lucide-react';
import { AgentProfileSelector } from '@/components/agent-profile-selector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    card.execution?.profile ??
      card.execution?.runs.at(-1)?.profile ??
      card.run?.profile ?? { agent: 'codex', model: '', effort: '' },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetPreview, setResetPreview] = useState<{
    token: string;
    path: string;
    branch: string;
    baseCommit: string;
    repositoryUrl: string | null;
  } | null>(null);
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

  async function send(
    operation:
      | 'start'
      | 'cancel'
      | 'accept'
      | 'refresh-github'
      | 'recheck-output'
      | 'override-check',
    outputId = latest?.id,
    initializeRepository = false,
    criterionId?: string,
  ) {
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
          outputId,
          initializeRepository,
          criterionId,
          note: instruction,
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

  async function resetCard(token?: string) {
    setResetOpen(true);
    setPending(true);
    setResetError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: token ? 'reset' : 'preview-reset',
          cardId: card.id,
          expectedRevision: card.revision,
          token,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.preview) setResetPreview(data.preview);
      if (data.card) {
        onChange(data.card);
        setInstruction('');
        setResetPreview(null);
        setResetOpen(false);
      }
    } catch (err) {
      setResetPreview(null);
      setResetError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setPending(false);
    }
  }

  const requiredPassed = assessRequiredChecks(
    latest?.acceptanceChecklist,
    latest?.result?.checks ?? [],
    card.execution?.acceptanceOverrides?.[action.id],
  ).passed;
  const stage = accepted
    ? 2
    : latest?.status === 'succeeded' && requiredPassed
      ? 1
      : 0;
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
      {card.execution?.workspace && (
        <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
          <p className="font-medium">{t('Card workspace')}</p>
          <p className="break-all">{card.execution.workspace.path}</p>
          <p className="break-all">
            {t('Branch')}: {card.execution.workspace.branch}
          </p>
          <p className="text-muted-foreground">
            {t(
              'All Actions use this worktree. Main changes only through the agreed PR delivery flow.',
            )}
          </p>
          {card.execution.workspaceBackups?.at(-1) && (
            <p className="break-all">
              {t('Previous workspace backup')}:{' '}
              {card.execution.workspaceBackups.at(-1)!.path}
            </p>
          )}
        </div>
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
                          : run.result &&
                              assessRequiredChecks(
                                run.acceptanceChecklist,
                                run.result.checks,
                                run.id === latest?.id
                                  ? card.execution?.acceptanceOverrides?.[
                                      action.id
                                    ]
                                  : undefined,
                              ).passed
                            ? 'Ready to verify'
                            : 'Needs your input',
                )}
              </summary>
              {run.executionAccess && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('Execution permissions')}: {t(run.executionAccess)}
                </p>
              )}
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
              {run.status !== 'running' && (
                <div className="mt-4 space-y-2 rounded-lg border border-border p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">GitHub</span>
                    {run.github && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending || running}
                        onClick={() => void send('refresh-github', run.id)}
                      >
                        {t('Refresh GitHub status')}
                      </Button>
                    )}
                  </div>
                  {run.github ? (
                    <>
                      <a
                        className="block break-all underline"
                        href={run.github.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {run.github.repositoryUrl}
                      </a>
                      {run.github.error && (
                        <output className="block text-destructive">
                          {t(run.github.error)}
                        </output>
                      )}
                      <p className="text-muted-foreground">
                        {t('Last attempted check')}: {run.github.checkedAt}
                      </p>
                      {run.github.pullRequests.map((pr) => (
                        <a
                          key={pr.url}
                          className="block break-words underline underline-offset-4"
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{pr.number} · {pr.title} · {t(pr.state)}
                          {pr.isDraft ? ` · ${t('Draft')}` : ''}
                          {run.github?.error ? ` · ${t('Stale status')}` : ''}
                        </a>
                      ))}
                      {!run.github.pullRequests.length && (
                        <p>
                          {t('No verified PR association for this output.')}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        {t(
                          'PR state is separate from your acceptance. Refresh to check for remote changes.',
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {t(
                        'No GitHub repository was captured for this round. Future rounds discover it automatically.',
                      )}
                    </p>
                  )}
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
                  {run.evidenceErrors
                    ? t(
                        'Output evidence could not be verified. The Agent report is retained below.',
                      )
                    : run.error}
                </p>
              )}
              {run.evidenceErrors &&
                run.id === card.execution?.runs.at(-1)?.id &&
                run.status === 'failed' && (
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={pending || running}
                    onClick={() => void send('recheck-output', run.id)}
                  >
                    {t('Recheck saved report without rerunning Agent')}
                  </Button>
                )}
              {run.evidenceErrors && (
                <details className="mt-3 text-xs">
                  <summary>{t('Evidence validation details')}</summary>
                  <ul className="mt-2 space-y-1 break-all">
                    {run.evidenceErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </details>
              )}
              {Boolean(run.unverifiedCheckRefs?.length) && (
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary>{t('Unverified check references')}</summary>
                  <p className="mt-2">
                    {t(
                      'These references were reported by the Agent; the host has not verified the commands or external results.',
                    )}
                  </p>
                  <ul className="mt-2 space-y-1 break-all">
                    {run.unverifiedCheckRefs!.map((ref) => (
                      <li key={ref}>{ref}</li>
                    ))}
                  </ul>
                </details>
              )}
              {run.result && (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                    {run.result.summary}
                  </p>
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-medium">
                      {t('Agent-reported checks')}
                    </h4>
                    <h5 className="text-xs font-semibold">
                      {t('Required checks')}
                    </h5>
                    {!run.acceptanceChecklist && (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'Historical report without a fixed checklist; rerun against confirmed criteria.',
                        )}
                      </p>
                    )}
                    {assessRequiredChecks(
                      run.acceptanceChecklist,
                      run.result.checks,
                      run.id === latest?.id
                        ? card.execution?.acceptanceOverrides?.[action.id]
                        : undefined,
                    ).items.map((item) => (
                      <div
                        key={item.criterion.id}
                        className="space-y-1 rounded border border-border p-2 text-sm"
                      >
                        <p>
                          {item.criterion.id} · {item.criterion.criterion}
                        </p>
                        <p>
                          {t('Pass condition')}: {item.criterion.passCondition}
                        </p>
                        <p>
                          {t('Observed result')}:{' '}
                          {t(item.observed?.status ?? 'not-run')} ·{' '}
                          {item.observed?.summary}
                        </p>
                        {item.observed?.evidenceRefs.map((ref, i) => (
                          <p
                            key={i}
                            className="break-all text-xs text-muted-foreground"
                          >
                            {ref}
                          </p>
                        ))}
                        {item.override && (
                          <p>
                            {t('Passed by user decision')}: {item.override.note}{' '}
                            · {item.override.recordedAt}
                          </p>
                        )}
                        {item.status !== 'passed' &&
                          run.id === latest?.id &&
                          !accepted &&
                          run.status !== 'running' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!enabled || !instruction.trim()}
                              onClick={() =>
                                void send(
                                  'override-check',
                                  run.id,
                                  false,
                                  item.criterion.id,
                                )
                              }
                            >
                              {t(
                                'Use feedback as user decision to pass this item',
                              )}
                            </Button>
                          )}
                      </div>
                    ))}
                    <h5 className="text-xs font-semibold">
                      {run.acceptanceChecklist
                        ? `${t('Additional checks')} · non-blocker`
                        : t('Historical checks (not classified)')}
                    </h5>
                    {(run.acceptanceChecklist
                      ? splitChecks(
                          run.acceptanceChecklist,
                          run.result.checks,
                          run.result.additionalChecks,
                        ).additional
                      : [
                          ...run.result.checks,
                          ...(run.result.additionalChecks ?? []),
                        ]
                    ).map((check, i) => (
                      <div key={i} className="text-sm text-muted-foreground">
                        <p>
                          {t(check.status)} · {check.summary}
                        </p>
                        {check.evidenceRefs.map((ref, j) => (
                          <p key={j} className="break-all text-xs">
                            {ref}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
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
              'Starting runs the Agent with project write access. Only this Action runs; you decide acceptance. GitHub status never starts the next Action.',
            )}
          </p>
          {profile.agent === 'codex' && (
            <p className="text-xs text-muted-foreground">
              {t(
                'Codex execution follows your local Full Access or read-only choice. Full Access relies on worktree and PR discipline, not an OS write barrier around main.',
              )}
            </p>
          )}
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
                  disabled={!enabled || !requiredPassed}
                  onClick={() => void send('accept')}
                >
                  <Check />
                  {t('Accept this output')}
                </Button>
              )}
          </div>
        </>
      )}
      {card.execution?.workspace &&
        !card.execution.acceptedActionIds.length &&
        latest &&
        (['failed', 'canceled'].includes(latest.status) ||
          (latest.status === 'succeeded' &&
            latest.result?.outcome !== 'delivered')) && (
          <Button
            variant="outline"
            disabled={pending || running}
            onClick={() => {
              setResetPreview(null);
              void resetCard();
            }}
          >
            {t('Restart this Card from its base')}
          </Button>
        )}
      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!pending) setResetOpen(open);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Restart this Card from its base')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {t(
              'Keep the confirmed Plan. Preserve this worktree and branch as a backup, then create a fresh Card worktree at its original base. No Action starts automatically.',
            )}
          </p>
          {resetPreview && (
            <>
              <p className="break-all text-xs">
                {resetPreview.path}
                <br />
                {resetPreview.branch}
                <br />
                {t('Base commit')}: {resetPreview.baseCommit.slice(0, 8)}
              </p>
              <p className="text-sm">
                {t(
                  'Main, GitHub repositories, PRs and installed apps are not reverted by this operation.',
                )}
              </p>
              {resetPreview.repositoryUrl && (
                <p className="break-all text-xs">
                  {resetPreview.repositoryUrl}
                </p>
              )}
              <Button
                disabled={pending}
                onClick={() => void resetCard(resetPreview.token)}
              >
                {t('Back up and restart Card workspace')}
              </Button>
            </>
          )}
          {pending && <p className="text-sm">{t('Working…')}</p>}
          {resetError && (
            <p role="alert" className="text-sm text-destructive">
              {resetError}
            </p>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setResetOpen(false)}
          >
            {t('Cancel')}
          </Button>
        </DialogContent>
      </Dialog>
      {error === 'EMPTY_REPOSITORY_CONFIRMATION_REQUIRED' && (
        <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <p>
            {t(
              'This empty project needs a local Git baseline. Confirm creating an empty commit on local main; no files are committed and nothing is pushed to GitHub.',
            )}
          </p>
          <Button
            disabled={pending}
            onClick={() => void send('start', latest?.id, true)}
          >
            {t('Create empty local main baseline and start')}
          </Button>
        </div>
      )}
      {error && error !== 'EMPTY_REPOSITORY_CONFIRMATION_REQUIRED' && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
