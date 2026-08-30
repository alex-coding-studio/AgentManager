'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';
import { isUiLanguage, type UiLanguage } from '@/lib/ui-language';

export function SettingsWorkspace() {
  const { language, setLanguage, t } = useUiText();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  async function changeLanguage(next: UiLanguage) {
    if (saving || next === language) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: next }),
      });
      const result = await response.json();
      if (!response.ok || !isUiLanguage(result.language))
        throw new Error('Could not save settings.');
      setLanguage(result.language);
      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not save settings.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl px-5 py-9 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t('Settings')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('Personal settings for this local AgentManager installation.')}
      </p>
      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">{t('General')}</h2>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-lg gap-3">
            <Languages className="mt-0.5 size-5 shrink-0" />
            <div>
              <label
                htmlFor="interface-language"
                className="text-sm font-medium"
              >
                {t('Interface language')}
              </label>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {t(
                  'Only website menus, buttons, and messages change. Your input, Agent responses, Markdown, and JSON stay exactly as they are.',
                )}
              </p>
            </div>
          </div>
          <select
            id="interface-language"
            value={language}
            disabled={saving}
            onChange={(event) => {
              if (isUiLanguage(event.target.value))
                void changeLanguage(event.target.value);
            }}
            className="h-10 min-w-40 rounded-lg border border-border bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
          >
            <option value="en" lang="en">
              English
            </option>
            <option value="zh-CN" lang="zh-CN">
              简体中文
            </option>
          </select>
        </div>
        <output className="mt-5 block text-xs text-muted-foreground">
          {t(
            saving
              ? 'Saving…'
              : saved
                ? 'Saved'
                : 'Saved automatically on this computer.',
          )}
        </output>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {t(error)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
