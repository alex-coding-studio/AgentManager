import type { DerivedDomainRelationship, DomainModel } from './domain-model.ts';

export function deriveDomainRelationships(
  model: DomainModel,
): DerivedDomainRelationship[] {
  const derived: DerivedDomainRelationship[] = [];
  for (const containment of model.relationships.filter(
    (item) => item.semanticRole === 'containment',
  )) {
    const inheritance = model.relationships.find(
      (item) =>
        item.semanticRole === 'inheritance' &&
        item.sourceEntityId === containment.sourceEntityId &&
        item.targetEntityId === containment.targetEntityId,
    );
    if (
      inheritance &&
      containment.sourceEntityId !== containment.targetEntityId &&
      !model.relationships.some(
        (item) =>
          item.semanticRole === 'containment' &&
          item.sourceEntityId === containment.sourceEntityId &&
          item.targetEntityId === containment.sourceEntityId,
      )
    )
      derived.push({
        ...containment,
        id: `DERIVED-${containment.id}`,
        targetEntityId: containment.sourceEntityId,
        meaning: `Derived because ${containment.sourceEntityId} inherits from ${containment.targetEntityId}.`,
        provenance: 'derived',
        derivedFrom: [containment.id, inheritance.id],
      });
  }
  return derived;
}
