'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type { AgentProfile } from '@/lib/agent-profile';
import type { LocalModel, ModelCatalog } from '@/lib/local-agent-model-types';

export function AgentProfileSelector({
  value,
  onChange,
  disabled = false,
  mode = 'live',
  label = 'Agent configuration',
}: {
  value: AgentProfile;
  onChange: (profile: AgentProfile) => void;
  disabled?: boolean;
  mode?: 'live' | 'demo';
  label?: string;
}) {
  const { t } = useUiText();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedAgent, setResolvedAgent] = useState<
    AgentProfile['agent'] | null
  >(null);
  const [manual, setManual] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode === 'demo') return;
    const controller = new AbortController();
    fetch(`/api/agents/models?agent=${value.agent}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Model catalog unavailable.');
        const data = (await response.json()) as ModelCatalog;
        if (!controller.signal.aborted) {
          setCatalog(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setResolvedAgent(value.agent);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [value.agent, retry, mode]);
  const demoModels: LocalModel[] = [
    {
      id: 'reasoning-demo',
      name: t('Reasoning model · demo'),
      description: '',
      efforts: ['low', 'medium', 'high'],
    },
    {
      id: 'efficient-demo',
      name: t('Lightweight model · demo'),
      description: '',
      efforts: ['low', 'medium', 'high'],
    },
  ];
  const models =
    mode === 'demo'
      ? demoModels
      : catalog?.agent === value.agent
        ? catalog.models
        : [];
  const selected = models.find((item) => item.id === value.model);
  const reading = loading || resolvedAgent !== value.agent;
  const custom =
    mode === 'live' &&
    (manual || Boolean(value.model && !selected && !reading));
  const efforts =
    selected?.efforts ??
    (mode === 'demo'
      ? ['low', 'medium', 'high']
      : ['low', 'medium', 'high', 'xhigh']);
  const selectClass =
    'mt-2 h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2';
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <fieldset
        disabled={disabled}
        aria-label={t(label)}
        className="grid gap-3 sm:grid-cols-3"
      >
        <label className="min-w-0 text-xs">
          Agent
          <select
            aria-label={`${t(label)} · Agent`}
            className={selectClass}
            value={value.agent}
            onChange={(event) => {
              setCatalog(null);
              setLoading(true);
              setFailed(false);
              setManual(false);
              onChange({
                agent: event.target.value as AgentProfile['agent'],
                model: '',
                effort: '',
              });
            }}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
          </select>
        </label>
        <div className="min-w-0 text-xs">
          <label>
            {t('Model')}
            <select
              aria-label={`${t(label)} · ${t('Model')}`}
              className={selectClass}
              value={custom ? '__custom' : value.model}
              onChange={(event) => {
                const id = event.target.value;
                setManual(id === '__custom');
                onChange({
                  ...value,
                  model: id === '__custom' ? '' : id,
                  effort: '',
                });
              }}
            >
              <option value="">{t('Agent default')}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
              {reading && value.model && !selected && (
                <option value={value.model}>{value.model}</option>
              )}
              {mode === 'live' && (
                <option value="__custom">{t('Custom model…')}</option>
              )}
            </select>
          </label>
          {custom && (
            <Input
              aria-label={t('Custom model ID')}
              className="mt-2 h-9"
              value={value.model}
              placeholder={t('Custom model ID')}
              onChange={(event) =>
                onChange({ ...value, model: event.target.value })
              }
            />
          )}
        </div>
        <label className="min-w-0 text-xs">
          {t('Reasoning effort')}
          <select
            aria-label={`${t(label)} · ${t('Reasoning effort')}`}
            className={selectClass}
            value={value.effort}
            onChange={(event) =>
              onChange({
                ...value,
                effort: event.target.value as AgentProfile['effort'],
              })
            }
          >
            <option value="">{t('Agent default')}</option>
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
            {value.effort && !efforts.includes(value.effort) && (
              <option value={value.effort}>
                {value.effort} · {t('Previously selected')}
              </option>
            )}
          </select>
        </label>
      </fieldset>
      <div className="text-xs text-muted-foreground" aria-live="polite">
        {mode === 'demo' ? (
          t(
            'Demo profiles only, not a live model catalog. Nothing is sent to a provider.',
          )
        ) : reading ? (
          t('Loading local models…')
        ) : failed ? (
          <span>
            {t(
              'Could not load models. Use Agent default or enter a custom model.',
            )}{' '}
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setLoading(true);
                setRetry((old) => old + 1);
              }}
            >
              {t('Retry')}
            </Button>
          </span>
        ) : models.length === 0 ? (
          t('No models returned. Use Agent default or enter a custom model.')
        ) : (
          t(
            'Models reported by your local Agent. Availability is checked when running.',
          )
        )}
      </div>
    </div>
  );
}
