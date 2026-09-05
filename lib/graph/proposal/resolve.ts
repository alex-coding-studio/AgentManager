import { identifyEntity, type GraphIdentityIndex } from '../identity.ts';
import { MaterializationError } from '../../materialization/receipt.ts';
import type {
  GraphCandidateRecord,
  GraphProposalCandidate,
} from './contract.ts';
import type { GraphReference } from './reference.ts';

export type ProposalResolution = {
  aliases: ReadonlyMap<string, string>;
  index: GraphIdentityIndex;
  revision: number;
};

function aliasOf(localKey: string, aliases: ReadonlyMap<string, string>) {
  const alias = aliases.get(localKey);
  if (!alias) {
    throw new MaterializationError(
      'identity',
      `Proposal key ${localKey} has no allocated Candidate identifier.`,
    );
  }
  return alias;
}

function resolveReference(
  reference: GraphReference,
  aliases: ReadonlyMap<string, string>,
) {
  return reference.kind === 'proposal'
    ? aliasOf(reference.localKey, aliases)
    : reference.id;
}

export function resolveProposalCandidates(
  candidates: readonly GraphProposalCandidate[],
  resolution: ProposalResolution,
): GraphCandidateRecord[] {
  return candidates.map((candidate) =>
    identifyEntity(
      {
        candidateId: aliasOf(candidate.localKey, resolution.aliases),
        revision: resolution.revision,
        type: candidate.type,
        title: candidate.title,
        summary: candidate.summary,
        derivedFrom: candidate.derivedFrom.map((reference) => reference.id),
        dependsOn: candidate.dependsOn.map((reference) =>
          resolveReference(reference, resolution.aliases),
        ),
        resources: candidate.resources.map((resource) => ({ ...resource })),
        typeTemplateRef: candidate.typeTemplateRef?.id ?? null,
        metadata: candidate.metadata,
        presentation: candidate.presentation,
        assumptions: candidate.assumptions,
      },
      resolution.index,
    ),
  );
}
