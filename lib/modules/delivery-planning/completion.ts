import type { PlanningCard } from '../implementation/planning-service.ts';
import type { PlanningSource } from '../implementation/planning-sources.ts';

export function completedContractUids(
  cards: PlanningCard[],
  sources: PlanningSource[],
) {
  return sources
    .filter(
      (source) =>
        source.module === 'what-to-do' &&
        cards.some(
          (card) =>
            card.source.module === 'what-to-do' &&
            card.source.uid === source.uid &&
            card.source.version === source.version &&
            card.plan?.status === 'finalized' &&
            card.actions.length > 0 &&
            card.actions.every((action) =>
              card.execution?.acceptedActionIds.includes(action.id),
            ),
        ),
    )
    .map((source) => source.uid);
}

export function contractDeliveryStates(
  cards: PlanningCard[],
  sources: PlanningSource[],
): Record<string, 'in-progress' | 'completed'> {
  const completed = new Set(completedContractUids(cards, sources));
  return Object.fromEntries(
    sources
      .filter(
        (source) =>
          source.module === 'what-to-do' &&
          cards.some(
            (card) =>
              card.source.module === 'what-to-do' &&
              card.source.uid === source.uid &&
              card.source.version === source.version,
          ),
      )
      .map((source) => [
        source.uid,
        completed.has(source.uid) ? 'completed' : 'in-progress',
      ]),
  );
}
