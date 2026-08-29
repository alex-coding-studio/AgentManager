import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATS_NEXT_HARNESS_ID,
  WHATS_NEXT_HARNESS_PROMPT,
  WHATS_NEXT_HARNESS_REVISION,
  WhatsNextResultValidationError,
  parseWhatsNextHarnessResult,
  validateWhatsNextHarnessResult,
} from '../lib/whats-next-harness.ts';
import { renderWhatsNextResponseMarkdown } from '../lib/whats-next-response.ts';

void test('ships the settled Reflection and Markdown Harness contract', () => {
  assert.match(WHATS_NEXT_HARNESS_PROMPT, /user-facing Reflection/);
  assert.match(WHATS_NEXT_HARNESS_PROMPT, /Why this direction/);
  assert.match(WHATS_NEXT_HARNESS_PROMPT, /For refine-candidate/);
  assert.match(WHATS_NEXT_HARNESS_PROMPT, /exactly one semantic level/);
  assert.match(WHATS_NEXT_HARNESS_PROMPT, /protected comparison Context/);
  assert.doesNotMatch(WHATS_NEXT_HARNESS_PROMPT, /placeholder/);
});

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
    reflection: {
      markdown:
        '# Reflection\n\nThe user most needs a bounded way to make the idea concrete.',
      continuationAdvice: {
        action: 'continue',
        recommendedFocus: 'concretize',
        reason: 'Several useful starting directions remain unexplored.',
      },
    },
    exploration: {
      consideredNodeIds: ['NODE-0001'],
      notes: ['The Start carries only the stated idea.'],
    },
  };
}

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  const title = `Direction ${id}`;
  return {
    candidateId: id,
    revision: 1,
    type: 'module',
    title,
    summary: 'One possible next step grown from the Start.',
    derivedFrom: ['NODE-0001'],
    dependsOn: [],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
    outputMarkdown: `# ${title}

One possible next step grown from the Start.

## Why this direction

- The origin describes a broad product idea that still needs a concrete entry point.
- This direction provides one bounded possibility the user can inspect.

## Assumptions

- None`,
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

void test('requires a machine-readable progressive continuation focus', () => {
  const value = proposal([
    candidate('CANDIDATE-0001'),
    candidate('CANDIDATE-0002'),
  ]);
  delete (value.reflection.continuationAdvice as { recommendedFocus?: string })
    .recommendedFocus;
  assert.throws(
    () => validateWhatsNextHarnessResult(value, context),
    WhatsNextResultValidationError,
  );
});

void test('renders one readable Response from Reflection and Candidates', () => {
  const result = validateWhatsNextHarnessResult(
    proposal([candidate('CANDIDATE-0001'), candidate('CANDIDATE-0002')]),
    context,
  );
  const markdown = renderWhatsNextResponseMarkdown(result);
  assert.match(markdown, /# Reflection/);
  assert.match(markdown, /## Suggested next step/);
  assert.match(markdown, /Make this direction one level more concrete/);
  assert.match(markdown, /# Candidate Proposals/);
  assert.match(markdown, /## Direction CANDIDATE-0001/);
});

void test('accepts a heading-free Reflection and ordered rationale', () => {
  const value = proposal([
    candidate('CANDIDATE-0001', {
      outputMarkdown: `# Direction CANDIDATE-0001

One possible next step grown from the Start.

## Why this direction

1. The origin still needs a concrete entry point.
2. The user can inspect this direction independently.

## Assumptions

- None`,
    }),
    candidate('CANDIDATE-0002'),
  ]);
  value.reflection.markdown =
    'The current idea contains several connected but unsettled values.';
  assert.equal(
    validateWhatsNextHarnessResult(value, context).outcome,
    'proposal',
  );
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
    operation: 'refine-candidate' as const,
    revisionCandidateId: 'CANDIDATE-0001',
    revisionTarget: candidate('CANDIDATE-0001'),
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
    proposal([candidate('CANDIDATE-0001', { revision: 2 })]),
    revising,
  );
  assert.equal(result.outcome, 'proposal');
});

void test('rejects Candidate Markdown without a bounded rationale', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', {
            outputMarkdown: '# Direction CANDIDATE-0001\n\nNo rationale.',
          }),
          candidate('CANDIDATE-0002'),
        ]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects assumptions that drift from Candidate Markdown', () => {
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', {
            assumptions: ['A hidden assumption.'],
          }),
          candidate('CANDIDATE-0002'),
        ]),
        context,
      ),
    WhatsNextResultValidationError,
  );
});

void test('rejects graph changes during one-to-one Refine', () => {
  const original = candidate('CANDIDATE-0001');
  assert.throws(
    () =>
      validateWhatsNextHarnessResult(
        proposal([
          candidate('CANDIDATE-0001', {
            revision: 2,
            dependsOn: ['NODE-0002'],
          }),
        ]),
        {
          ...context,
          operation: 'refine-candidate',
          revisionCandidateId: 'CANDIDATE-0001',
          revisionTarget: original,
          previousCandidateRevisions: { 'CANDIDATE-0001': 1 },
        },
      ),
    WhatsNextResultValidationError,
  );
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
