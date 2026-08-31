'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import type { PlanningProfile } from '@/lib/just-do-it-planning-service';
import type { ModelCatalog } from '@/lib/local-agent-model-types';

export function LocalAgentProfile({
  value,
  onChange,
  disabled,
}: {
  value: PlanningProfile;
  onChange: (profile: PlanningProfile) => void;
  disabled: boolean;
}) {
  const { t } = useUiText();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
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
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [value.agent, retry]);
  const models = catalog?.agent === value.agent ? catalog.models : [];
  const selected = models.find((item) => item.id === value.model);
  const custom = manual || Boolean(value.model && !selected && !loading);
  const efforts = selected?.efforts ?? ['low', 'medium', 'high', 'xhigh'];
  const selectClass =
    'mt-2 h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2';
  return (
    <div className="space-y-2">
      <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-xs">
          Agent
          <select
            className={selectClass}
            value={value.agent}
            onChange={(event) => {
              setCatalog(null);
              setLoading(true);
              setFailed(false);
              setManual(false);
              onChange({
                agent: event.target.value as PlanningProfile['agent'],
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
              {loading && value.model && !selected && (
                <option value={value.model}>{value.model}</option>
              )}
              <option value="__custom">{t('Custom model…')}</option>
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
            className={selectClass}
            value={value.effort}
            onChange={(event) =>
              onChange({
                ...value,
                effort: event.target.value as PlanningProfile['effort'],
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
        {loading ? (
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
