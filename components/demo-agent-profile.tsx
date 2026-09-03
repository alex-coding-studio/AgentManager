'use client';

import { useUiText } from '@/components/ui-language-provider';
import { AgentProfileSelector } from '@/components/agent-profile-selector';
import type { DemoProfile } from '@/lib/modules/implementation/demo';

const demoAgents = ['codex', 'claude'] as const;

export function DemoAgentProfile({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: DemoProfile;
  onChange: (value: DemoProfile) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useUiText();
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 rounded-xl border border-border p-3"
    >
      <legend className="px-1 text-xs font-medium">{t(label)}</legend>
      <AgentProfileSelector
        mode="demo"
        label={label}
        disabled={disabled}
        agents={demoAgents}
        value={{
          agent: value.agent === 'Claude' ? 'claude' : 'codex',
          model: value.model === 'default' ? '' : value.model,
          effort: value.effort === 'default' ? '' : value.effort,
        }}
        onChange={(profile) =>
          onChange({
            agent: profile.agent === 'claude' ? 'Claude' : 'Codex',
            model: (profile.model || 'default') as DemoProfile['model'],
            effort: (profile.effort || 'default') as DemoProfile['effort'],
          })
        }
      />
    </fieldset>
  );
}

export function DemoProfileSummary({ value }: { value?: DemoProfile }) {
  const { t } = useUiText();
  if (!value) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      {t('Requested profile')}: {value.agent} ·{' '}
      {t(
        value.model === 'default'
          ? 'Provider default'
          : value.model === 'reasoning-demo'
            ? 'Reasoning model · demo'
            : 'Lightweight model · demo',
      )}{' '}
      · {t(value.effort === 'default' ? 'Provider default' : value.effort)}
    </p>
  );
}
