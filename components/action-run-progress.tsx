'use client';
import { useEffect, useState } from 'react';
import { useUiText } from '@/components/ui-language-provider';
import type { ActionRun } from '@/lib/just-do-it-execution-types';
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function ActionRunProgress({ run }: { run: ActionRun }) {
  const { t } = useUiText();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return (
    <dl className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
      <div className="flex gap-2">
        <dt className="text-muted-foreground">{t('Elapsed time')}</dt>
        <dd aria-live="off">
          {now === null ? '—' : duration(now - Date.parse(run.startedAt))}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">
          {t('Current activity')}
        </dt>
        <dd className="min-w-0 break-words" aria-live="polite">
          {run.progress && (
            <span className="mr-1 font-medium">
              {t(
                ['prepare', 'qualify'].includes(run.progress.phase)
                  ? 'Coordinator'
                  : 'Worker',
              )}{' '}
              ·
            </span>
          )}
          {run.progress?.summary ?? t('Preparing coordinated execution.')}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-muted-foreground">{t('Last update')}</dt>
        <dd aria-live="off">
          {now === null
            ? '—'
            : duration(
                now - Date.parse(run.progress?.updatedAt ?? run.startedAt),
              )}{' '}
          {t('ago')}
        </dd>
      </div>
    </dl>
  );
}
