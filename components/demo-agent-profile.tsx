'use client';

import { useUiText } from '@/components/ui-language-provider';
import type { DemoProfile } from '@/lib/just-do-it-demo';

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
  const style =
    'mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground';
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 rounded-xl border border-border p-3"
    >
      <legend className="px-1 text-xs font-medium">{t(label)}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Agent
          <select
            aria-label={`${t(label)} · Agent`}
            className={style}
            value={value.agent}
            onChange={(event) =>
              onChange({
                agent: event.target.value as DemoProfile['agent'],
                model: 'default',
                effort: 'default',
              })
            }
          >
            <option>Codex</option>
            <option>Claude</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          {t('Model')}
          <select
            aria-label={`${t(label)} · ${t('Model')}`}
            className={style}
            value={value.model}
            onChange={(event) =>
              onChange({
                ...value,
                model: event.target.value as DemoProfile['model'],
              })
            }
          >
            <option value="default">{t('Provider default')}</option>
            <option value="reasoning-demo">
              {t('Reasoning model · demo')}
            </option>
            <option value="efficient-demo">
              {t('Lightweight model · demo')}
            </option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          {t('Reasoning effort')}
          <select
            aria-label={`${t(label)} · ${t('Reasoning effort')}`}
            className={style}
            value={value.effort}
            onChange={(event) =>
              onChange({
                ...value,
                effort: event.target.value as DemoProfile['effort'],
              })
            }
          >
            {['default', 'low', 'medium', 'high'].map((effort) => (
              <option key={effort} value={effort}>
                {t(effort === 'default' ? 'Provider default' : effort)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        {t(
          'Demo profiles only, not a live model catalog. Nothing is sent to a provider.',
        )}
      </p>
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
