import assert from 'node:assert/strict';
import test from 'node:test';
import {
  materializeWhatToDoDeliveryMap,
  renderWhatToDoContract,
  whatToDoContractCandidateId,
} from '../lib/what-to-do-map.ts';
import type { WhatToDoHarnessResult } from '../lib/what-to-do-harness.ts';

const result: Extract<WhatToDoHarnessResult, { outcome: 'map-proposal' }> = {
  schemaVersion: 1,
  harness: { id: 'praxis.what-to-do', revision: 1 },
  request: {
    sessionId: 'SESSION-1',
    requestId: 'RUN-1',
    inputFingerprint: '0'.repeat(64),
  },
  responseMarkdown: '# Delivery Map',
  repositorySummary: { markdown: '# Repository', evidencePaths: ['facts'] },
  reviewedEvidence: [{ path: 'facts', reason: 'Read facts.' }],
  outcome: 'map-proposal',
  candidates: [
    {
      candidateId: 'CANDIDATE-0001',
      revision: 1,
      title: 'Foundation',
      summary: 'Establish the boundary.',
      outcome: 'The boundary exists.',
      includedScope: ['Boundary'],
      excludedScope: [],
      productRules: ['Keep it stable.'],
      domainImpact: { kind: 'reuse', reason: 'Reuse it.', evidencePaths: [] },
      requiredExperienceStates: ['Ready'],
      repositoryConstraints: [],
      dependsOn: [],
      acceptanceCriteria: [
        {
          id: 'AC-1',
          condition: 'The boundary exists.',
          passCondition: 'It is usable.',
          evidence: 'A focused check.',
        },
      ],
      validationExpectations: ['Run checks.'],
      sourceClaimIds: ['CLAIM-1'],
      openDecisions: [],
      deliveryStrategy: {
        kind: 'foundation-first',
        reason: 'Dependents require it.',
      },
    },
    {
      candidateId: 'CANDIDATE-0002',
      revision: 1,
      title: 'Experience',
      summary: 'Deliver the experience.',
      outcome: 'The experience works.',
      includedScope: ['Experience'],
      excludedScope: [],
      productRules: ['Keep it coherent.'],
      domainImpact: { kind: 'none', reason: 'UI only.', evidencePaths: [] },
      requiredExperienceStates: ['Ready'],
      repositoryConstraints: [],
      dependsOn: ['CANDIDATE-0001'],
      acceptanceCriteria: [
        {
          id: 'AC-2',
          condition: 'The experience works.',
          passCondition: 'It is usable.',
          evidence: 'A focused check.',
        },
      ],
      validationExpectations: ['Run checks.'],
      sourceClaimIds: ['CLAIM-1'],
      openDecisions: [],
      deliveryStrategy: {
        kind: 'vertical-slice',
        reason: 'Deliver it end to end.',
      },
    },
  ],
  sourceClaims: [
    {
      claimId: 'CLAIM-1',
      sourcePath: 'feature.md',
      sourceSha256: '1'.repeat(64),
      anchor: 'Feature',
      summary: 'Deliver the feature.',
      disposition: 'in-scope',
      contractCandidateIds: ['CANDIDATE-0001', 'CANDIDATE-0002'],
      exclusionReason: null,
      exclusionAuthority: null,
    },
  ],
};

void test('a validated Agent result becomes one formal terminal Delivery Map', () => {
  const uids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  const map = materializeWhatToDoDeliveryMap(
    {
      runId: 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: '2026-09-02T00:00:00.000Z',
      sourceUids: ['feature-1', 'feature-1'],
      result,
      sourceSnapshots: [
        {
          logicalPath: 'feature.md',
          sha256: '1'.repeat(64),
          storedPath:
            'what-to-do/runs/RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/context/primary/feature.md',
        },
      ],
    },
    () => uids.shift()!,
  );
  assert.deepEqual(map.sourceUids, ['feature-1']);
  assert.equal(map.contracts.length, 2);
  assert.equal(map.contracts[0]!.id, 'NODE-11111111');
  assert.deepEqual(map.contracts[1]!.dependsOn, [map.contracts[0]!.id]);
  assert.deepEqual(map.contracts[1]!.relations.dependsOn, [
    map.contracts[0]!.uid,
  ]);
  assert.equal('candidateId' in map.contracts[0]!, false);
  assert.equal('revision' in map.contracts[0]!, false);
  assert.deepEqual(map.sourceClaims[0]!.contractIds, [
    map.contracts[0]!.id,
    map.contracts[1]!.id,
  ]);
  assert.match(
    renderWhatToDoContract(map.contracts[1]!),
    new RegExp(map.contracts[0]!.id),
  );
});

void test('a retained Contract preserves formal identity across terminal Map updates', () => {
  const uids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ];
  const sourceSnapshots = [
    {
      logicalPath: 'feature.md',
      sha256: '1'.repeat(64),
      storedPath:
        'what-to-do/runs/RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/context/primary/feature.md',
    },
  ];
  const currentMap = materializeWhatToDoDeliveryMap(
    {
      runId: 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: '2026-09-02T00:00:00.000Z',
      sourceUids: ['feature-1'],
      result,
      sourceSnapshots,
    },
    () => uids.shift()!,
  );
  const retainedIds = currentMap.contracts.map(whatToDoContractCandidateId);
  const adjusted = materializeWhatToDoDeliveryMap(
    {
      runId: 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      updatedAt: '2026-09-02T01:00:00.000Z',
      sourceUids: ['feature-1'],
      currentMap,
      sourceSnapshots,
      result: {
        ...result,
        candidates: [],
        sourceClaims: [
          { ...result.sourceClaims[0]!, contractCandidateIds: retainedIds },
        ],
        recomposition: {
          effects: retainedIds.map((candidateId) => ({
            kind: 'retain' as const,
            from: [candidateId],
            to: [candidateId],
          })),
        },
      },
    },
    () => {
      throw new Error(
        'A retained Contract must not allocate another identity.',
      );
    },
  );
  assert.deepEqual(
    adjusted.contracts.map((contract) => [
      contract.id,
      contract.uid,
      contract.outputPath,
    ]),
    currentMap.contracts.map((contract) => [
      contract.id,
      contract.uid,
      contract.outputPath,
    ]),
  );
});
