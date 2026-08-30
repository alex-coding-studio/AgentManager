'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';

export function WhatsNextContextToolbar({
  projectId,
  disabled = false,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const { t } = useUiText();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const endpoint = `/api/projects/${projectId}/whats-next-context`;

  async function load(sequence: number) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      if (sequence !== requestSequence.current) return;
      setInstructions(value.instructions);
      setLoaded(true);
    } catch (err) {
      if (sequence === requestSequence.current)
        setError(
          err instanceof Error
            ? err.message
            : t('Could not load Instructions.'),
        );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  function changeOpen(value: boolean) {
    if (saving) return;
    setOpen(value);
    requestSequence.current += 1;
    if (value) {
      setLoading(true);
      setLoaded(false);
      setSaved(false);
      setError(null);
      void load(requestSequence.current);
    }
  }
  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setInstructions(value.instructions);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Could not save Instructions.'),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 lg:px-8">
        <h1 className="text-lg font-semibold">{t("What's Next")}</h1>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => changeOpen(true)}
        >
          <SlidersHorizontal />
          {t('Context')}
        </Button>
      </header>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("What's Next instructions")}</DialogTitle>
            <DialogDescription>
              {t(
                'Applies to the next request, including continued sessions. Running requests keep their original instructions. Leave blank to use only the Harness defaults.',
              )}
            </DialogDescription>
          </DialogHeader>
          {loading && (
            <output className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t('Loading')}
            </output>
          )}
          <Textarea
            aria-label={t("What's Next instructions")}
            className="min-h-64"
            maxLength={20_000}
            value={instructions}
            disabled={!loaded || loading || saving}
            onChange={(event) => {
              setInstructions(event.target.value);
              setSaved(false);
            }}
            placeholder={t(
              'Optional language, collaboration preferences, or project constraints.',
            )}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {instructions.length} / 20,000
            </span>
            <Button
              disabled={!loaded || loading || saving}
              onClick={() => void save()}
            >
              {t(saving ? 'Saving…' : 'Save')}
            </Button>
          </div>
          {saved && (
            <output className="text-xs text-muted-foreground">
              {t('Saved. The next request will use these Instructions.')}
            </output>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
