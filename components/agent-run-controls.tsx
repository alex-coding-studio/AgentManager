'use client';

import { Sparkles } from 'lucide-react';
import { AgentProfileSelector } from '@/components/agent-profile-selector';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type { AgentProfile } from '@/lib/agent-profile';

export function AgentRunControls({
  value,
  onChange,
  onRun,
  disabled = false,
  mode = 'live',
  label = 'Agent configuration',
  actionLabel = 'Ask',
}: {
  value: AgentProfile;
  onChange: (profile: AgentProfile) => void;
  onRun: () => void;
  disabled?: boolean;
  mode?: 'live' | 'demo';
  label?: string;
  actionLabel?: string;
}) {
  const { t } = useUiText();
  return (
    <div className="flex flex-col items-stretch gap-3">
      <AgentProfileSelector
        value={value}
        onChange={onChange}
        mode={mode}
        label={label}
        showStatus={false}
      />
      <Button
        size="sm"
        aria-label={t(actionLabel)}
        disabled={disabled}
        onClick={onRun}
      >
        <Sparkles className="size-3.5" />
        {t(actionLabel)}
      </Button>
    </div>
  );
}
