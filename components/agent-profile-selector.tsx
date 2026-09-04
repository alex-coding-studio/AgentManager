'use client';

import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUiText } from '@/components/ui-language-provider';
import type { AgentProfile } from '@/lib/agents/profile';
import type { LocalModel, ModelCatalog } from '@/lib/agents/model-types';
import { cn } from '@/lib/utils';

const catalogPromises = new Map<AgentProfile['agent'], Promise<ModelCatalog>>();
const catalogValues = new Map<AgentProfile['agent'], ModelCatalog>();
const allAgents: readonly AgentProfile['agent'][] = [
  'codex',
  'claude',
  'deepseek',
];

function agentLabel(agent: AgentProfile['agent']) {
  if (agent === 'codex') return 'Codex';
  if (agent === 'deepseek') return 'DeepSeek';
  return 'Claude';
}

function loadCatalog(agent: AgentProfile['agent']) {
  const existing = catalogPromises.get(agent);
  if (existing) return existing;
  const request = fetch(`/api/agents/models?agent=${agent}`, {
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok) throw new Error('Model catalog unavailable.');
    const catalog = (await response.json()) as ModelCatalog;
    catalogValues.set(agent, catalog);
    return catalog;
  });
  catalogPromises.set(agent, request);
  return request;
}

export function preferredEffort(model: LocalModel | undefined) {
  if (!model) return 'low';
  return model.efforts.includes('low') ? 'low' : (model.efforts[0] ?? '');
}

function firstProfile(
  agent: AgentProfile['agent'],
  catalog: ModelCatalog | null,
): AgentProfile {
  const model = catalog?.models[0];
  return {
    agent,
    model: model?.id ?? '',
    effort: preferredEffort(model),
  };
}

export function AgentProfileSelector({
  value,
  onChange,
  disabled = false,
  mode = 'live',
  label = 'Agent configuration',
  showStatus = true,
  agents = allAgents,
  triggerClassName,
}: {
  value: AgentProfile;
  onChange: (profile: AgentProfile) => void;
  disabled?: boolean;
  mode?: 'live' | 'demo';
  label?: string;
  showStatus?: boolean;
  agents?: readonly AgentProfile['agent'][];
  triggerClassName?: string;
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
    let current = true;
    const request =
      mode === 'demo'
        ? Promise.resolve<ModelCatalog | null>(null)
        : loadCatalog(value.agent);
    void request
      .then((data) => {
        if (!current) return;
        if (data) {
          setCatalog(data);
          const selectedModel = data.models.find(
            (model) => model.id === value.model,
          );
          if (!value.model && !manual) {
            onChange(firstProfile(value.agent, data));
          } else if (value.model) {
            const normalizedEffort = preferredEffort(selectedModel);
            if (
              (!value.effort && normalizedEffort) ||
              (selectedModel &&
                value.effort &&
                !selectedModel.efforts.includes(value.effort))
            ) {
              onChange({ ...value, effort: normalizedEffort });
            }
          }
        }
        setFailed(false);
      })
      .catch(() => {
        if (current) setFailed(true);
      })
      .finally(() => {
        if (!current) return;
        setResolvedAgent(value.agent);
        setLoading(false);
      });
    if (mode === 'live')
      for (const agent of agents)
        if (agent !== value.agent)
          void loadCatalog(agent).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [value, retry, mode, manual, onChange, agents]);
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
  const effortOptions: AgentProfile['effort'][] = [
    ...efforts,
    ...(value.effort && !efforts.includes(value.effort) ? [value.effort] : []),
  ];
  const selectedEffort = value.effort || preferredEffort(selected);
  const effortIndex = Math.max(0, effortOptions.indexOf(selectedEffort));
  const selectedAgentLabel = agentLabel(value.agent);
  const modelLabel =
    selected?.name ??
    (value.model ||
      (manual
        ? t('Custom model…')
        : reading
          ? t('Loading local models…')
          : (models[0]?.name ?? '')));
  const effortLabel = selectedEffort ? t(selectedEffort) : '';
  const choiceClass =
    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-accent';
  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label={t(label)}
        className={cn(
          'group flex h-8 min-w-0 max-w-64 items-center gap-2 rounded-lg px-2 text-left outline-none transition hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[10px] leading-4 text-muted-foreground">
          {selectedAgentLabel} · {modelLabel}
          {effortLabel ? ` · ${effortLabel}` : ''}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>
      <PopoverContent aria-label={t(label)}>
        <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
          <section className="min-w-0">
            <p className="px-2.5 pb-1.5 text-[10px] font-medium text-muted-foreground">
              {t('Provider')}
            </p>
            <div className="space-y-0.5">
              {agents.map((agent) => (
                <button
                  key={agent}
                  type="button"
                  className={cn(
                    choiceClass,
                    value.agent === agent && 'bg-accent font-medium',
                  )}
                  onClick={() => {
                    const cached = catalogValues.get(agent) ?? null;
                    setCatalog(cached);
                    setResolvedAgent(cached ? agent : null);
                    setLoading(!cached);
                    setFailed(false);
                    setManual(false);
                    onChange(firstProfile(agent, cached));
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {agentLabel(agent)}
                  </span>
                  {value.agent === agent ? (
                    <Check className="size-3.5" />
                  ) : null}
                </button>
              ))}
            </div>
          </section>
          <section className="min-w-0 border-l border-border pl-3">
            <p className="px-2.5 pb-1.5 text-[10px] font-medium text-muted-foreground">
              {t('Model')}
            </p>
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={cn(
                    choiceClass,
                    !custom &&
                      value.model === model.id &&
                      'bg-accent font-medium',
                  )}
                  onClick={() => {
                    setManual(false);
                    onChange({
                      ...value,
                      model: model.id,
                      effort: preferredEffort(model),
                    });
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{model.name}</span>
                  {!custom && value.model === model.id ? (
                    <Check className="size-3.5" />
                  ) : null}
                </button>
              ))}
              {mode === 'live' ? (
                <button
                  type="button"
                  className={cn(choiceClass, custom && 'bg-accent font-medium')}
                  onClick={() => {
                    setManual(true);
                    onChange({ ...value, model: '', effort: 'low' });
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {t('Custom model…')}
                  </span>
                  {custom ? <Check className="size-3.5" /> : null}
                </button>
              ) : null}
            </div>
            {custom ? (
              <Input
                aria-label={t('Custom model ID')}
                className="mt-2 h-8"
                value={value.model}
                placeholder={t('Custom model ID')}
                onChange={(event) =>
                  onChange({ ...value, model: event.target.value })
                }
              />
            ) : null}
          </section>
        </div>
        {effortOptions.length > 0 ? (
          <section className="mt-3 border-t border-border pt-3">
            <div className="relative flex min-h-7 items-center justify-center px-8">
              <div className="min-w-0 truncate text-center text-xs">
                <span className="font-medium">{modelLabel}</span>
                <span className="text-muted-foreground"> · {effortLabel}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-0"
                disabled={value.effort === preferredEffort(selected)}
                aria-label={t('Reset reasoning effort')}
                onClick={() =>
                  onChange({ ...value, effort: preferredEffort(selected) })
                }
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
            <div className="relative mt-2 h-9">
              <div className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full bg-secondary shadow-inner">
                <div
                  className="h-full rounded-l-full bg-foreground/20"
                  style={{
                    width: `${effortOptions.length > 1 ? (effortIndex / (effortOptions.length - 1)) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
                {effortOptions.map((effort, index) => (
                  <span
                    key={effort}
                    className={cn(
                      'size-1.5 rounded-full bg-muted-foreground/35',
                      index <= effortIndex && 'bg-foreground/45',
                    )}
                  />
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, effortOptions.length - 1)}
                step={1}
                value={effortIndex}
                disabled={effortOptions.length < 2}
                aria-label={`${t(label)} · ${t('Reasoning effort')}`}
                className="absolute inset-0 h-9 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-50 [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                onChange={(event) =>
                  onChange({
                    ...value,
                    effort:
                      effortOptions[Number(event.target.value)] ??
                      preferredEffort(selected),
                  })
                }
              />
            </div>
          </section>
        ) : null}
        {showStatus || failed ? (
          <div
            className="mt-3 text-[10px] leading-4 text-muted-foreground"
            aria-live="polite"
          >
            {mode === 'demo' ? (
              t(
                'Demo profiles only, not a live model catalog. Nothing is sent to a provider.',
              )
            ) : reading ? (
              t('Loading local models…')
            ) : failed ? (
              <span>
                {t('Could not load models. Retry or enter a custom model.')}{' '}
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={disabled}
                  onClick={() => {
                    setLoading(true);
                    catalogPromises.delete(value.agent);
                    catalogValues.delete(value.agent);
                    setRetry((old) => old + 1);
                  }}
                >
                  {t('Retry')}
                </Button>
              </span>
            ) : models.length === 0 ? (
              t('No models returned. Enter a custom model.')
            ) : (
              t(
                'Models reported by your local Agent. Availability is checked when running.',
              )
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
