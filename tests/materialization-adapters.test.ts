import assert from 'node:assert/strict';
import test from 'node:test';
import { toProductExplorationSemanticResult } from '../lib/modules/product-discovery/producer-adapter.ts';
import { PRODUCT_EXPLORATION_RESULT_CONTRACT } from '../lib/modules/product-discovery/contract.ts';
import { toScopeDecompositionSemanticResult } from '../lib/modules/scope-decomposition/producer-adapter.ts';
import { SCOPE_DECOMPOSITION_RESULT_CONTRACT } from '../lib/modules/scope-decomposition/contract.ts';
import { toDomainModelSemanticResult } from '../lib/modules/domain-modeling/producer-adapter.ts';
import type { DomainModelEnvelope } from '../lib/modules/domain-modeling/harness.ts';
import { DOMAIN_MODEL_RESULT_CONTRACT } from '../lib/modules/domain-modeling/contract.ts';
import { toDeliveryMapSemanticResult } from '../lib/modules/delivery-planning/producer-adapter.ts';
import { DELIVERY_MAP_RESULT_CONTRACT } from '../lib/modules/delivery-planning/contract.ts';
import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_REVISION,
  type WhatsNextHarnessResult,
} from '../lib/modules/product-discovery/harness.ts';
import {
  TASK_DECOMPOSITION_HARNESS_ID,
  TASK_DECOMPOSITION_HARNESS_REVISION,
  type TaskDecompositionHarnessResult,
} from '../lib/modules/scope-decomposition/harness.ts';
import {
  WHAT_TO_DO_HARNESS_ID,
  WHAT_TO_DO_HARNESS_REVISION,
  type WhatToDoHarnessResult,
} from '../lib/modules/delivery-planning/harness.ts';
import { validateGraphProposal } from '../lib/graph/proposal/validate.ts';
import type { GraphProposalBasis } from '../lib/graph/proposal/basis.ts';
import type { GraphProposalCandidate } from '../lib/graph/proposal/contract.ts';

const request = {
  sessionId: 'SESSION-1',
  requestId: 'REQUEST-1',
  inputFingerprint: 'sha256:request',
};

function graphCandidate(candidateId: string, dependsOn: string[] = []) {
  return {
    candidateId,
    revision: 1,
    type: 'module',
    title: `Candidate ${candidateId}`,
    summary: 'One bounded result.',
    derivedFrom: ['NODE-00000001'],
    dependsOn,
    resources: [{ kind: 'context', path: 'context/product/project.md' }],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
  };
}

void test('the Product Exploration adapter states every reference kind explicitly', () => {
  const envelope: WhatsNextHarnessResult = {
    schemaVersion: 1,
    harness: {
      id: WHATS_NEXT_HARNESS_ID,
      revision: WHATS_NEXT_HARNESS_REVISION,
    },
    request,
    reflection: {
      markdown: 'Reflection.',
      continuationAdvice: {
        action: 'continue',
        recommendedFocus: 'concretize',
        reason: 'Keep exploring.',
      },
    },
    exploration: { consideredNodeIds: [], notes: [] },
    outcome: 'proposal',
    candidates: [
      {
        ...graphCandidate('CANDIDATE-0001'),
        outputMarkdown: '# Candidate CANDIDATE-0001\n',
        layer: 'discovery',
        artifactKind: 'direction',
      },
      {
        ...graphCandidate('CANDIDATE-0002', [
          'CANDIDATE-0001',
          'NODE-00000002',
          'CANDIDATE-0900',
        ]),
        outputMarkdown: '# Candidate CANDIDATE-0002\n',
        layer: 'discovery',
        artifactKind: 'direction',
      },
    ],
  };
  const result = toProductExplorationSemanticResult(envelope);
  assert.equal(result.outcome, 'proposal');
  if (result.outcome !== 'proposal') return;
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.localKey),
    ['CANDIDATE-0001', 'CANDIDATE-0002'],
  );
  assert.deepEqual(result.candidates[1]!.dependsOn, [
    { kind: 'proposal', localKey: 'CANDIDATE-0001' },
    { kind: 'node', id: 'NODE-00000002' },
    { kind: 'candidate', id: 'CANDIDATE-0900' },
  ]);
  assert.deepEqual(result.candidates[0]!.derivedFrom, [
    { kind: 'node', id: 'NODE-00000001' },
  ]);
  assert.equal('revision' in result.candidates[0]!, false);
  assert.doesNotThrow(() =>
    PRODUCT_EXPLORATION_RESULT_CONTRACT.validateStructure(result),
  );
});

void test('the Scope Decomposition adapter classifies recomposition effect endpoints', () => {
  const envelope: TaskDecompositionHarnessResult = {
    schemaVersion: 1,
    harness: {
      id: TASK_DECOMPOSITION_HARNESS_ID,
      revision: TASK_DECOMPOSITION_HARNESS_REVISION,
    },
    request,
    impactReview: { reviewedNodeIds: [], affectedNodeIds: [], notes: [] },
    outcome: 'proposal',
    candidates: [graphCandidate('CANDIDATE-0002')],
    recomposition: {
      effects: [
        { kind: 'retain', from: ['CANDIDATE-0900'], to: ['CANDIDATE-0900'] },
        { kind: 'replace', from: ['CANDIDATE-0901'], to: ['CANDIDATE-0002'] },
      ],
    },
  };
  const result = toScopeDecompositionSemanticResult(envelope);
  assert.equal(result.outcome, 'proposal');
  if (result.outcome !== 'proposal') return;
  assert.deepEqual(result.recomposition?.effects[0], {
    kind: 'retain',
    from: [{ kind: 'candidate', id: 'CANDIDATE-0900' }],
    to: [{ kind: 'candidate', id: 'CANDIDATE-0900' }],
  });
  assert.deepEqual(result.recomposition?.effects[1]!.to, [
    { kind: 'proposal', localKey: 'CANDIDATE-0002' },
  ]);
  assert.doesNotThrow(() =>
    SCOPE_DECOMPOSITION_RESULT_CONTRACT.validateStructure(result),
  );
});

void test('the Domain Model adapter reports a requested change rather than a committed one', () => {
  const patch = {
    upsertEntities: [],
    removeEntityIds: [],
    removeFieldIds: [],
    upsertRelationships: [],
    removeRelationshipIds: [],
    upsertConstraints: [],
    removeConstraintIds: [],
  };
  const envelope: DomainModelEnvelope = {
    harnessVersion: 2,
    requestId: 'REQUEST-1',
    baseVersion: 3,
    inputFingerprint: 'sha256:request',
    outcome: 'applied',
    summary: 'Adds nothing.',
    patch,
  };
  const result = toDomainModelSemanticResult(envelope);
  assert.deepEqual(result, {
    outcome: 'model-change',
    summary: 'Adds nothing.',
    change: { kind: 'patch', patch },
  });
  assert.doesNotThrow(() =>
    DOMAIN_MODEL_RESULT_CONTRACT.validateStructure(result),
  );
});

void test('the Delivery Map adapter references current Contracts by formal identifier', () => {
  const candidate = (candidateId: string, dependsOn: string[] = []) => ({
    candidateId,
    revision: 1,
    title: `Contract ${candidateId}`,
    summary: 'One independently deliverable result.',
    outcome: 'The behavior is available.',
    includedScope: ['One outcome.'],
    excludedScope: [],
    productRules: ['Preserve accepted behavior.'],
    domainImpact: {
      kind: 'none' as const,
      reason: 'Presentation only.',
      evidencePaths: [],
    },
    requiredExperienceStates: [],
    repositoryConstraints: [],
    dependsOn,
    acceptanceCriteria: [
      {
        id: `AC-${candidateId}`,
        condition: 'The user reaches the result.',
        passCondition: 'The result is visible.',
        evidence: 'A behavior check.',
      },
    ],
    validationExpectations: ['Run the project checks.'],
    sourceClaimIds: ['CLAIM-1'],
    openDecisions: [],
    deliveryStrategy: {
      kind: 'vertical-slice' as const,
      reason: 'Independently usable.',
    },
  });
  const envelope: WhatToDoHarnessResult = {
    schemaVersion: 1,
    harness: {
      id: WHAT_TO_DO_HARNESS_ID,
      revision: WHAT_TO_DO_HARNESS_REVISION,
    },
    request,
    responseMarkdown: '# Delivery Map\n',
    repositorySummary: {
      markdown: '# Repository\n',
      evidencePaths: ['a.json'],
    },
    reviewedEvidence: [],
    outcome: 'map-proposal',
    candidates: [candidate('CANDIDATE-0002', ['CANDIDATE-0001'])],
    sourceClaims: [
      {
        claimId: 'CLAIM-1',
        sourcePath: 'docs/source.md',
        sourceSha256: 'a'.repeat(64),
        anchor: '## Accepted behavior',
        summary: 'The source asks for it.',
        disposition: 'in-scope',
        contractCandidateIds: ['CANDIDATE-0002'],
        exclusionReason: null,
        exclusionAuthority: null,
      },
    ],
  };
  const basis = {
    formalContractIdByCandidateId: { 'CANDIDATE-0001': 'NODE-00000001' },
  };
  const result = toDeliveryMapSemanticResult(envelope, basis);
  assert.equal(result.outcome, 'map-proposal');
  if (result.outcome !== 'map-proposal') return;
  assert.equal(result.contracts[0]!.localKey, 'CANDIDATE-0002');
  assert.deepEqual(result.contracts[0]!.dependsOn, [
    { kind: 'contract', id: 'NODE-00000001' },
  ]);
  assert.deepEqual(result.sourceClaims[0]!.source, {
    kind: 'source',
    path: 'docs/source.md',
  });
  assert.equal('sourceSha256' in result.sourceClaims[0]!, false);
  assert.doesNotThrow(() =>
    DELIVERY_MAP_RESULT_CONTRACT.validateStructure(result),
  );
});

void test('the Delivery Map adapter rejects a reference that is neither current nor proposed', () => {
  assert.throws(
    () =>
      toDeliveryMapSemanticResult(
        {
          outcome: 'map-proposal',
          candidates: [],
          sourceClaims: [],
          contractDependencyUpdates: [
            { candidateId: 'CANDIDATE-0404', dependsOn: [] },
          ],
        } as never,
        { formalContractIdByCandidateId: {} },
      ),
    /neither a current Delivery Contract nor a proposed one/,
  );
});

function basis(
  overrides: Partial<GraphProposalBasis> = {},
): GraphProposalBasis {
  return {
    project: { id: 'PROJECT-1', planningPath: '/tmp/planning' },
    module: 'task-graph',
    operation: 'propose',
    contract: { id: 'praxis.test', version: 1, hash: 'a'.repeat(64) },
    fingerprint: 'b'.repeat(64),
    preparedAt: '2026-09-05T00:00:00.000Z',
    scope: 'task-graph',
    knownNodeIds: ['NODE-00000001', 'NODE-00000002'],
    acceptedCandidateIds: [],
    knownResourcePaths: ['context/product/project.md'],
    reservedCandidateIds: [],
    currentCandidates: [],
    revisionTarget: null,
    identityFingerprint: 'absent',
    ...overrides,
  };
}

function semanticCandidate(
  localKey: string,
  overrides: Partial<GraphProposalCandidate> = {},
): GraphProposalCandidate {
  return {
    localKey,
    type: 'module',
    title: `Candidate ${localKey}`,
    summary: 'One bounded result.',
    derivedFrom: [{ kind: 'node', id: 'NODE-00000001' }],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
    ...overrides,
  };
}

void test('the shared graph proposal validator accepts a resolvable proposal', () => {
  assert.doesNotThrow(() =>
    validateGraphProposal(basis(), [
      semanticCandidate('first'),
      semanticCandidate('second', {
        dependsOn: [{ kind: 'proposal', localKey: 'first' }],
      }),
    ]),
  );
});

void test('the shared graph proposal validator rejects unresolvable references', () => {
  const cases: Array<[string, () => void]> = [
    [
      'declared more than once',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('same'),
          semanticCandidate('same'),
        ]),
    ],
    [
      'depends on an unknown Node',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'node', id: 'NODE-00009999' }],
          }),
        ]),
    ],
    [
      'depends on an unknown proposal key',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'proposal', localKey: 'missing' }],
          }),
        ]),
    ],
    [
      'depends on an unknown Candidate',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'candidate', id: 'CANDIDATE-0900' }],
          }),
        ]),
    ],
    [
      'cannot depend on itself',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'proposal', localKey: 'first' }],
          }),
        ]),
    ],
    [
      'must not contain a cycle',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'proposal', localKey: 'second' }],
          }),
          semanticCandidate('second', {
            dependsOn: [{ kind: 'proposal', localKey: 'first' }],
          }),
        ]),
    ],
    [
      'is already allocated',
      () =>
        validateGraphProposal(basis({ reservedCandidateIds: ['taken'] }), [
          semanticCandidate('taken'),
        ]),
    ],
    [
      'derives from an unknown Node',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            derivedFrom: [{ kind: 'node', id: 'NODE-00009999' }],
          }),
        ]),
    ],
    [
      'references an unknown Resource',
      () =>
        validateGraphProposal(basis(), [
          semanticCandidate('first', {
            resources: [{ kind: 'context', path: 'context/missing.md' }],
          }),
        ]),
    ],
  ];
  for (const [expected, run] of cases) {
    assert.throws(run, new RegExp(expected), `expected rejection: ${expected}`);
  }
});

void test('the shared graph proposal validator resolves against current Candidates', () => {
  assert.doesNotThrow(() =>
    validateGraphProposal(
      basis({
        currentCandidates: [
          { candidateId: 'CANDIDATE-0900', revision: 1, dependsOn: [] },
        ],
      }),
      [
        semanticCandidate('first', {
          dependsOn: [{ kind: 'candidate', id: 'CANDIDATE-0900' }],
        }),
      ],
    ),
  );
  assert.throws(
    () =>
      validateGraphProposal(
        basis({
          currentCandidates: [
            {
              candidateId: 'CANDIDATE-0900',
              revision: 1,
              dependsOn: ['first'],
            },
          ],
        }),
        [
          semanticCandidate('first', {
            dependsOn: [{ kind: 'candidate', id: 'CANDIDATE-0900' }],
          }),
        ],
      ),
    /must not contain a cycle/,
  );
});
