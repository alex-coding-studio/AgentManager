'use client';

import { Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AgentGraphComposerCard } from '@/components/agent-graph-composer-card';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type { AgentProfile } from '@/lib/agent-profile';

export function AgentGraphRunningCard({
  agent,
  startedAt,
  activity,
  fallback,
  onCancel,
  className,
}: {
  agent: AgentProfile['agent'];
  startedAt: string;
  activity: Array<{ summary: string }>;
  fallback: string;
  onCancel: () => void;
  className?: string;
}) {
  const { t } = useUiText();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return (
    <AgentGraphComposerCard
      className={className}
      title={
        <span className="flex items-center gap-3 text-sm">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-sky-500" />
          </span>
          {t('{agent} is running', {
            agent: agent === 'codex' ? 'Codex' : 'Claude',
          })}{' '}
          · {formatDuration(elapsed)}
        </span>
      }
      description={t(latestReadableAgentActivity(activity, fallback))}
      action={
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Square className="size-3.5" /> {t('Cancel')}
        </Button>
      }
    />
  );
}

export function latestReadableAgentActivity(
  activity: Array<{ summary: string }>,
  fallback: string,
) {
  return (
    activity.findLast(
      (item) =>
        !/^(?:Running|Finished):\s/.test(item.summary) &&
        !['Agent report received.', 'Agent call completed.'].includes(
          item.summary,
        ),
    )?.summary ?? fallback
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
