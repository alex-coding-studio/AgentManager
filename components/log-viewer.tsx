'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type {
  LogChunk,
  LogTargetMeta,
} from '@/lib/execution-observability/log-targets';
import {
  formatElapsed,
  statusPresentation,
} from '@/lib/execution-observability/status-presentation';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 1_500;

export function LogViewer({
  apiPath,
  initialMeta,
  initialChunk,
}: {
  apiPath: string;
  initialMeta: LogTargetMeta;
  initialChunk: LogChunk;
}) {
  const { t } = useUiText();
  const [meta, setMeta] = useState(initialMeta);
  const [text, setText] = useState(initialChunk.text);
  const [live, setLive] = useState(initialChunk.live);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(initialChunk.next);
  const busy = useRef(false);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const response = await fetch(`${apiPath}?offset=${offset.current}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const chunk = (await response.json()) as LogChunk & {
          meta: LogTargetMeta;
        };
        if (chunk.offset < offset.current) setText(chunk.text);
        else if (chunk.text) setText((current) => current + chunk.text);
        offset.current = chunk.next;
        setMeta(chunk.meta);
        setLive(chunk.live);
        setNow(Date.now());
      } catch {
      } finally {
        busy.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [apiPath, live]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [live]);

  const presentation =
    meta.status === 'unknown' ? null : statusPresentation(meta.status);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {}
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold">
                {meta.title ?? meta.subject}
              </h1>
              {presentation ? (
                <span
                  data-status={meta.status}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    presentation.badge,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-1.5 rounded-full',
                      presentation.dot,
                      presentation.pulse && 'animate-pulse',
                    )}
                  />
                  {t(presentation.label)}
                </span>
              ) : null}
            </div>
            {meta.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {meta.detail}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyLink}
            aria-label={t('Copy link')}
          >
            {copied ? <Check /> : <Copy />}
            {t(copied ? 'Link copied' : 'Copy link')}
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <Field label={t('Project')} value={meta.projectName} />
          <Field label={t(ownerLabel(meta.kind))} value={meta.ownerLabel} />
          <Field label={t('Subject')} value={meta.subject} />
          <Field label={t(idLabel(meta.kind))} value={meta.id} mono />
          {meta.agentProfile ? (
            <Field
              label={t('Agent profile')}
              value={`${meta.agentProfile.agent} · ${meta.agentProfile.model}${meta.agentProfile.effort ? ` · ${meta.agentProfile.effort}` : ''}`}
            />
          ) : null}
          {meta.startedAt ? (
            <Field label={t('Started')} value={meta.startedAt} mono />
          ) : null}
          {meta.endedAt ? (
            <Field label={t('Ended')} value={meta.endedAt} mono />
          ) : null}
          {meta.startedAt ? (
            <Field
              label={t(meta.endedAt ? 'Duration' : 'Elapsed time')}
              value={formatElapsed(meta.startedAt, meta.endedAt, now)}
              mono
            />
          ) : null}
        </dl>
        {meta.retained ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              'Retained: {files} modified files, {commits} commits, {prs} pull requests',
              {
                files: meta.retained.changedFiles,
                commits: meta.retained.commits.length,
                prs: meta.retained.pullRequests.length,
              },
            )}
            {meta.retained.checkpoint
              ? ` · ${t('checkpoint')} ${meta.retained.checkpoint.slice(0, 12)}`
              : ''}
          </p>
        ) : null}
        {meta.pullRequests.length || meta.jobLogs.length ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {meta.pullRequests.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-secondary"
              >
                <ExternalLink className="size-3" />
                {url.replace(/^https?:\/\/github\.com\//, '')}
              </a>
            ))}
            {meta.jobLogs.map((job) => (
              <a
                key={job.jobId}
                href={`/projects/${meta.projectId}/logs/jobs/${job.jobId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono hover:bg-secondary"
              >
                <ExternalLink className="size-3" />
                {t('Job log')} · {job.label}
              </a>
            ))}
          </div>
        ) : null}
        {meta.legacy ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              'This Run predates Run Logs; its recorded activity is shown in the same format.',
            )}
          </p>
        ) : null}
      </header>
      <section
        aria-label={t('Log')}
        aria-live={live ? 'polite' : undefined}
        className="rounded-2xl border border-border bg-card"
      >
        <pre className="max-h-[calc(100vh-16rem)] overflow-auto p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words">
          {text || t('No recorded activity.')}
        </pre>
      </section>
    </div>
  );
}

function ownerLabel(kind: LogTargetMeta['kind']) {
  return kind === 'card' ? 'Card' : kind === 'module' ? 'Module' : 'Owner';
}

function idLabel(kind: LogTargetMeta['kind']) {
  return kind === 'host'
    ? 'Operation ID'
    : kind === 'job'
      ? 'Job ID'
      : 'Run ID';
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('truncate', mono && 'font-mono')} title={value}>
        {value}
      </dd>
    </div>
  );
}
