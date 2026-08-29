import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_REVISION,
  WhatsNextResultValidationError,
  parseWhatsNextHarnessResult,
  validateWhatsNextHarnessResult,
} from '../lib/whats-next-harness.ts';

const request = {
  sessionId: 'SESSION-0001',
  requestId: 'REQUEST-0001',
  inputFingerprint: 'sha256:example',
};

const context = {
  request,
  knownNodeIds: ['NODE-0001', 'NODE-0002'],
  knownResourcePaths: ['task-graph/nodes/NODE-0001/resources/idea.md'],
};

function baseResult() {
  return {
    schemaVersion: 1,
    harness: {
      id: WHATS_NEXT_HARNESS_ID,
      revision: WHATS_NEXT_HARNESS_REVISION,
    },
    request,
    exploration: {
      consideredNodeIds: ['NODE-0001'],
      notes: ['The Start carries only the stated idea.'],
    },
  };
}

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    candidateId: id,
    revision: 1,
    type: 'module',
    title: `Direction ${id}`,
    summary: 'One possible next step grown from the Start.',
    derivedFrom: ['NODE-0001'],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
    ...overrides,
  };
}

function proposal(candidates: unknown[]) {
  return { ...baseResult(), outcome: 'proposal', candidates };
}

void test('accepts a proposal of distinct directions', () => {
  const result = validateWhatsNextHarnessResult(
    proposal([candidate('CANDIDATE-0001'), candidate('CANDIDATE-0002')]),
    context,
  );
  assert.equal(result.outcome, 'proposal');
});

void test('rejects a single-direction proposal', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([candidate('CANDIDATE-0001')]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects more than five directions', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal(
          Array.from({ length: 6 }, (_, index) =>
            candidate(`CANDIDATE-000${index + 1}`),
          ),
        ),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects an unknown origin Node', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', { derivedFrom: ['NODE-9999'] }),
          candidate('CANDIDATE-0002'),
        ]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('accepts several origins on one direction', () => {
  const result = validateWhatsNextHarnessResult(
    proposal([
      candidate('CANDIDATE-0001', { derivedFrom: ['NODE-0001', 'NODE-0002'] }),
      candidate('CANDIDATE-0002'),
    ]),
    context,
  );
  assert.equal(result.outcome, 'proposal');
});

void test('rejects a dependency cycle between directions', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', { dependsOn: ['CANDIDATE-0002'] }),
          candidate('CANDIDATE-0002', { dependsOn: ['CANDIDATE-0001'] }),
        ]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects an unknown Resource reference', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', {
            resources: [{ kind: 'context', path: 'context/product/absent.md' }],
          }),
          candidate('CANDIDATE-0002'),
        ]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects a response for a different request', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        {
          ...proposal([
            candidate('CANDIDATE-0001'),
            candidate('CANDIDATE-0002'),
          ]),
          request: { ...request, requestId: 'REQUEST-0002' },
        },
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('requires the next revision when revising one direction', () => {
  const revising = {
    ...context,
    previousCandidateRevisions: { 'CANDIDATE-0001': 1 },
  };
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([candidate('CANDIDATE-0001'), candidate('CANDIDATE-0002')]),
        revising,
      ),
    WhatsNextResultValidationError,
  );
  const result = validateWhatsNextHarnessResult(
    proposal([
      candidate('CANDIDATE-0001', { revision: 2 }),
      candidate('CANDIDATE-0002'),
    ]),
    revising,
  );
  assert.equal(result.outcome, 'proposal');
});

void test('does not offer an insufficient-evidence outcome', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        {
          ...baseResult(),
          outcome: 'insufficient-evidence',
          missingEvidence: ['Nothing to go on.'],
        },
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('accepts a no-change outcome', () => {
  const result = validateWhatsNextHarnessResult(
    {
      ...baseResult(),
      outcome: 'no-change',
      reason: 'The origin is exhausted.',
    },
    context,
  );
  assert.equal(result.outcome, 'no-change');
});

void test('rejects a non-JSON result', () => {
  assert.throws(
    () => parseWhatsNextHarnessResult('not json', context),
    WhatsNextResultValidationError,
  );
});
