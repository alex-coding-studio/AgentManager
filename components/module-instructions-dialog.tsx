'use client';

import { LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useUiText } from '@/components/ui-language-provider';
import { ModuleContextTrigger } from '@/components/module-context-trigger';

export function ModuleInstructionsDialog({
  endpoint,
  title,
  description,
  disabled = false,
}: {
  endpoint: string;
  title: string;
  description: string;
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

  async function load(sequence: number) {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      if (sequence !== requestSequence.current) return;
      setInstructions(value.instructions);
      setLoaded(true);
    } catch (loadError) {
      if (sequence === requestSequence.current)
        setError(
          loadError instanceof Error
            ? loadError.message
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
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('Could not save Instructions.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModuleContextTrigger
        disabled={disabled}
        onClick={() => changeOpen(true)}
      />
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t(title)}</DialogTitle>
            <DialogDescription>{t(description)}</DialogDescription>
          </DialogHeader>
          {loading ? (
            <output className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              {t('Loading')}
            </output>
          ) : null}
          <Textarea
            aria-label={t(title)}
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
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              disabled={!loaded || loading || saving}
              onClick={() => void save()}
            >
              {t(saving ? 'Saving…' : 'Save')}
            </Button>
          </div>
          {saved ? (
            <output className="text-xs text-muted-foreground">
              {t('Saved. The next request will use these Instructions.')}
            </output>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
