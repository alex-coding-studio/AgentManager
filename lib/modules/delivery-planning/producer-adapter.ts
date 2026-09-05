import { MaterializationError } from '../../materialization/receipt.ts';
import type {
  DeliveryContractReference,
  DeliveryMapContract,
  DeliveryMapRecomposeEffect,
  DeliveryMapResult,
  DeliveryMapSourceClaim,
  DeliveryMapSourceClaimUpdate,
  WhatToDoContractCandidate,
  WhatToDoSourceClaim,
} from './contract.ts';
import type { WhatToDoHarnessResult } from './harness.ts';

export type DeliveryMapAdapterBasis = {
  formalContractIdByCandidateId: Readonly<Record<string, string>>;
};

function contractReference(
  candidateId: string,
  basis: DeliveryMapAdapterBasis,
  proposalKeys: ReadonlySet<string>,
): DeliveryContractReference {
  const formalId = basis.formalContractIdByCandidateId[candidateId];
  if (formalId) return { kind: 'contract', id: formalId };
  if (proposalKeys.has(candidateId))
    return { kind: 'proposal', localKey: candidateId };
  throw new MaterializationError(
    'validation',
    `${candidateId} is neither a current Delivery Contract nor a proposed one.`,
  );
}

function toContract(
  candidate: WhatToDoContractCandidate,
  basis: DeliveryMapAdapterBasis,
  proposalKeys: ReadonlySet<string>,
): DeliveryMapContract {
  const { candidateId, revision: _revision, dependsOn, ...content } = candidate;
  return {
    ...content,
    localKey: candidateId,
    dependsOn: dependsOn.map((value) =>
      contractReference(value, basis, proposalKeys),
    ),
  };
}

function toClaim(
  claim: WhatToDoSourceClaim,
  basis: DeliveryMapAdapterBasis,
  proposalKeys: ReadonlySet<string>,
): DeliveryMapSourceClaim {
  return {
    claimId: claim.claimId,
    source: { kind: 'source', path: claim.sourcePath },
    anchor: claim.anchor,
    summary: claim.summary,
    disposition: claim.disposition,
    contracts: claim.contractCandidateIds.map((value) =>
      contractReference(value, basis, proposalKeys),
    ),
    exclusionReason: claim.exclusionReason,
    exclusionAuthority: claim.exclusionAuthority
      ? { anchor: claim.exclusionAuthority.anchor }
      : null,
  };
}

export function toDeliveryMapSemanticResult(
  envelope: WhatToDoHarnessResult,
  basis: DeliveryMapAdapterBasis,
): DeliveryMapResult {
  if (envelope.outcome === 'clarification')
    return { outcome: 'clarification', clarification: envelope.clarification };
  if (envelope.outcome === 'insufficient-evidence')
    return {
      outcome: 'insufficient-evidence',
      missingEvidence: envelope.missingEvidence,
    };
  if (envelope.outcome === 'no-change')
    return { outcome: 'no-change', reason: envelope.reason };
  const proposalKeys = new Set(
    envelope.candidates
      .map((candidate) => candidate.candidateId)
      .filter(
        (candidateId) => !basis.formalContractIdByCandidateId[candidateId],
      ),
  );
  const reference = (value: string) =>
    contractReference(value, basis, proposalKeys);
  const result: Extract<DeliveryMapResult, { outcome: 'map-proposal' }> = {
    outcome: 'map-proposal',
    contracts: envelope.candidates.map((candidate) =>
      toContract(candidate, basis, proposalKeys),
    ),
    sourceClaims: envelope.sourceClaims.map((claim) =>
      toClaim(claim, basis, proposalKeys),
    ),
  };
  if (envelope.sourceClaimUpdates) {
    const updates: DeliveryMapSourceClaimUpdate[] =
      envelope.sourceClaimUpdates.map((update) => ({
        claimId: update.claimId,
        disposition: update.disposition,
        contracts: update.contractCandidateIds.map(reference),
        exclusionReason: update.exclusionReason,
        exclusionAuthority: update.exclusionAuthority
          ? { anchor: update.exclusionAuthority.anchor }
          : null,
      }));
    result.sourceClaimUpdates = updates;
  }
  if (envelope.contractDependencyUpdates) {
    result.contractDependencyUpdates = envelope.contractDependencyUpdates.map(
      (update) => ({
        contract: reference(update.candidateId),
        dependsOn: update.dependsOn.map(reference),
      }),
    );
  }
  if (envelope.recomposition) {
    const effects: DeliveryMapRecomposeEffect[] =
      envelope.recomposition.effects.map((effect) => ({
        kind: effect.kind,
        from: effect.from.map(reference),
        to: effect.to.map(reference),
      }));
    result.recomposition = { effects };
  }
  return result;
}
