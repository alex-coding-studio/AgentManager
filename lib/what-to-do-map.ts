import { randomUUID } from 'node:crypto';
import type {
  WhatToDoContractCandidate,
  WhatToDoHarnessResult,
  WhatToDoSourceClaim,
} from './what-to-do-harness.ts';

export type WhatToDoDeliveryContract = Omit<
  WhatToDoContractCandidate,
  'candidateId' | 'revision' | 'dependsOn'
> & {
  id: string;
  uid: string;
  relations: { derivedFrom: string[]; dependsOn: string[] };
  dependsOn: string[];
  outputPath: string;
};

export type WhatToDoMapSourceClaim = Omit<
  WhatToDoSourceClaim,
  'contractCandidateIds'
> & { contractIds: string[] };

export type WhatToDoDeliveryMap = {
  schemaVersion: 1;
  runId: string;
  updatedAt: string;
  sourceUids: string[];
  contracts: WhatToDoDeliveryContract[];
  sourceClaims: WhatToDoMapSourceClaim[];
};

export function materializeWhatToDoDeliveryMap(
  input: {
    runId: string;
    updatedAt: string;
    sourceUids: string[];
    result: Extract<WhatToDoHarnessResult, { outcome: 'map-proposal' }>;
  },
  createUid: () => string = randomUUID,
): WhatToDoDeliveryMap {
  const aliases = new Set<string>();
  const identities = new Map(
    input.result.candidates.map((candidate) => {
      const uid = createUid();
      const compact = uid.replaceAll('-', '');
      let id = '';
      for (let length = 8; length <= compact.length; length += 4) {
        const candidateId = `NODE-${compact.slice(-length)}`;
        if (!aliases.has(candidateId)) {
          id = candidateId;
          aliases.add(candidateId);
          break;
        }
      }
      if (!id) throw new Error('Cannot allocate a Delivery Contract identity.');
      return [candidate.candidateId, { uid, id }] as const;
    }),
  );
  const contracts = input.result.candidates.map((candidate) => {
    const identity = identities.get(candidate.candidateId)!;
    const dependencyIdentities = candidate.dependsOn.map((dependency) =>
      identities.get(dependency)!,
    );
    const {
      candidateId: _candidateId,
      revision: _revision,
      dependsOn: _dependsOn,
      ...content
    } = candidate;
    return {
      ...content,
      id: identity.id,
      uid: identity.uid,
      relations: {
        derivedFrom: [],
        dependsOn: dependencyIdentities.map((dependency) => dependency.uid),
      },
      dependsOn: dependencyIdentities.map((dependency) => dependency.id),
      outputPath: `what-to-do/runs/${input.runId}/contracts/${identity.id}/output.md`,
    };
  });
  return {
    schemaVersion: 1,
    runId: input.runId,
    updatedAt: input.updatedAt,
    sourceUids: [...new Set(input.sourceUids)],
    contracts,
    sourceClaims: input.result.sourceClaims.map((claim) => {
      const { contractCandidateIds, ...content } = claim;
      return {
        ...content,
        contractIds: contractCandidateIds.map(
          (candidateId) => identities.get(candidateId)!.id,
        ),
      };
    }),
  };
}

export function renderWhatToDoContract(contract: WhatToDoDeliveryContract) {
  const list = (items: string[]) =>
    items.map((item) => `- ${item}`).join('\n') || '- None';
  return `# ${contract.title}\n\n${contract.summary}\n\n## Outcome\n\n${contract.outcome}\n\n## Included scope\n\n${list(contract.includedScope)}\n\n## Excluded scope\n\n${list(contract.excludedScope)}\n\n## Product rules\n\n${list(contract.productRules)}\n\n## Acceptance\n\n${contract.acceptanceCriteria.map((item) => `- **${item.id}** ${item.condition}\n  - Pass: ${item.passCondition}\n  - Evidence: ${item.evidence}`).join('\n')}\n\n## Dependencies\n\n${list(contract.dependsOn)}\n`;
}
