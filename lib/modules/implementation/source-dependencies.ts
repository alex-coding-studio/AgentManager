import type { PlanningCard } from './planning-service.ts';
import type { PlanningSource } from './planning-sources.ts';

export function unmetPlanningSourceDependencies(
  source: PlanningSource,
  cards: PlanningCard[],
  sources: PlanningSource[] = [],
) {
  return source.dependsOn
    .filter(
      (reference) =>
        !cards.some(
          (card) =>
            (card.source.uid === reference || card.source.id === reference) &&
            card.actions.length > 0 &&
            card.actions.every((action) =>
              card.execution?.acceptedActionIds.includes(action.id),
            ),
        ),
    )
    .map(
      (reference) =>
        sources.find(
          (candidate) =>
            candidate.uid === reference || candidate.id === reference,
        ) ?? {
          module: source.module,
          id: reference,
          uid: reference,
          title: reference,
          summary: '',
          dependsOn: [],
          outputPaths: [],
        },
    );
}
