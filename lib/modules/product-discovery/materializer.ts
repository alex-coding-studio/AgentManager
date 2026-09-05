import { allocateCandidateAliases } from '../../graph/identity-store.ts';
import { resolveProposalCandidates } from '../../graph/proposal/resolve.ts';
import type { ProductExplorationMaterializationBasis } from './basis.ts';
import type {
  ProductExplorationCandidateRecord,
  ProductExplorationResult,
} from './contract.ts';
import { validateProductExplorationResult } from './validation.ts';

export type ProductExplorationMaterialization = {
  candidates: ProductExplorationCandidateRecord[];
  candidateAliases: Record<string, string> | null;
};

export async function materializeProductExplorationResult(
  basis: ProductExplorationMaterializationBasis,
  result: ProductExplorationResult,
): Promise<ProductExplorationMaterialization | null> {
  validateProductExplorationResult(basis, result);
  if (result.outcome !== 'proposal') return null;
  const { aliases, index } = await allocateCandidateAliases(
    basis.project.planningPath,
    basis.scope,
    {
      localKeys: result.candidates.map((candidate) => candidate.localKey),
      revisionTarget: basis.revisionTarget,
    },
    basis.identityFingerprint,
  );
  const resolved = resolveProposalCandidates(result.candidates, {
    aliases,
    index,
    revision: basis.revisionTarget ? basis.revisionTarget.revision + 1 : 1,
  });
  return {
    candidates: resolved.map((record, position) => ({
      ...record,
      outputMarkdown: result.candidates[position]!.outputMarkdown,
      layer: result.candidates[position]!.layer,
      artifactKind: result.candidates[position]!.artifactKind,
    })),
    candidateAliases: basis.revisionTarget ? null : Object.fromEntries(aliases),
  };
}
