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
        meaning: `${entityName(model, containment.sourceEntityId)} ${inheritance.label} ${entityName(model, containment.targetEntityId)} · ${entityName(model, containment.sourceEntityId)} ${containment.label} ${entityName(model, containment.targetEntityId)}`,
        provenance: 'derived',
        derivedFrom: [containment.id, inheritance.id],
      });
  }
  return derived;
}

function entityName(model: DomainModel, id: string) {
  return model.entities.find((item) => item.id === id)?.name ?? id;
}

export function domainModelTopologyKey(model: DomainModel) {
  return [
    ...model.entities.map((item) => item.id).sort(),
    ...model.relationships
      .map(
        (item) =>
          `${item.id}:${item.sourceEntityId}:${item.targetEntityId}:${item.semanticRole}`,
      )
      .sort(),
  ].join('|');
}
