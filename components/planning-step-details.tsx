'use client';

import { CheckDetails } from '@/components/check-details';
import type { ActionContract } from '@/lib/just-do-it-harness';
import { useUiText } from '@/components/ui-language-provider';

export function PlanningStepDetails({
  step,
}: {
  step: Pick<
    ActionContract,
    'input' | 'output' | 'validation' | 'acceptanceCriteria'
  >;
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
      <section className="space-y-2">
        <h3 className="mb-2 text-xs font-semibold">{t('Required checks')}</h3>
        {step.acceptanceCriteria?.length ? (
          step.acceptanceCriteria.map((item) => (
            <CheckDetails key={item.id} title={item.criterion}>
              <p>{item.id}</p>
              <p>
                {t('Pass condition')}: {item.passCondition}
              </p>
              <p className="text-muted-foreground">
                {t('Evidence')}: {item.evidence}
              </p>
            </CheckDetails>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('No fixed checklist. Define it before execution.')}
          </p>
        )}
      </section>
    </div>
  );
}
