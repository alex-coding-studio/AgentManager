'use client';

import type { ActionContract } from '@/lib/just-do-it-harness';
import { useUiText } from '@/components/ui-language-provider';

export function PlanningStepDetails({
  step,
}: {
  step: Pick<ActionContract, 'input' | 'output' | 'validation'>;
}) {
  const { t } = useUiText();
  return (
    <div className="space-y-5">
      {(
        [
          ['Input', step.input],
          ['Expected output', step.output],
          ['Validation', step.validation],
        ] as const
      ).map(([label, content]) => (
        <section key={label}>
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
            {t(label)}
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-7">{content}</p>
        </section>
      ))}
    </div>
  );
}
