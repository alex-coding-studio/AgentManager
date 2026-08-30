'use client';

import Link from 'next/link';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { useUiText } from '@/components/ui-language-provider';

export function JustDoItEntry({ projectId }: { projectId: string }) {
  const { t } = useUiText();
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 lg:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Just Do It</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t('Real planning and execution are not connected yet.')}
      </p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <FlaskConical className="size-4" />
          {t('Preview mode')}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t(
            'Explore the agreed workflow with sample data. No Agent, GitHub, or project writes. Changes reset when you reload or leave preview.',
          )}
        </p>
        <Link
          href={`/projects/${projectId}/implementation?preview=just-do-it`}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t('Open preview')}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
