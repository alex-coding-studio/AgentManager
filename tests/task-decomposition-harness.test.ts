import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  TASK_DECOMPOSITION_HARNESS_ID,
  TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA,
  TASK_DECOMPOSITION_HARNESS_PROMPT,
  TASK_DECOMPOSITION_HARNESS_REVISION,
  HarnessResultValidationError,
  parseTaskDecompositionHarnessResult,
  validateTaskDecompositionHarnessResult,
} from '../lib/modules/scope-decomposition/harness.ts';

const request = {
  sessionId: 'SESSION-0001',
  requestId: 'REQUEST-0001',
  inputFingerprint: 'sha256:example',
};

const context = {
  request,
  knownNodeIds: ['NODE-00000001', 'NODE-00000002', 'NODE-00000003'],
  availableNodeContentIds: ['NODE-00000001', 'NODE-00000002'],
  knownResourcePaths: ['context/product/project.md'],
};

function baseResult() {
  return {
    schemaVersion: 1,
    harness: {
      id: TASK_DECOMPOSITION_HARNESS_ID,
      revision: TASK_DECOMPOSITION_HARNESS_REVISION,
    },
    request,
    impactReview: {
      reviewedNodeIds: ['NODE-00000002'],
      affectedNodeIds: ['NODE-00000002'],
      notes: ['The proposed module shares the same decomposition origin.'],
    },
  };
}

void test('keeps the always-loaded Harness compact', () => {
  assert.ok(TASK_DECOMPOSITION_HARNESS_PROMPT.length < 3_000);
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /Return only JSON/);
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /Never mutate/);
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /Atomicity is relative/);
  assert.match(
    TASK_DECOMPOSITION_HARNESS_PROMPT,
    /mechanical subdivision remains possible/,
  );
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /final judge/);
  assert.match(
    TASK_DECOMPOSITION_HARNESS_PROMPT,
    /may still contain multiple implementation steps/,
  );
  assert.match(
    TASK_DECOMPOSITION_HARNESS_PROMPT,
    /never a universal product-level limit/,
  );
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /Do not create sibling/);
  assert.match(TASK_DECOMPOSITION_HARNESS_PROMPT, /append-candidates/);
});

void test('exposes a machine-readable four-outcome contract', () => {
  assert.equal(TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA.oneOf.length, 4);
  assert.equal(
    TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA.$defs.candidate
      .additionalProperties,
    false,
  );
});

void test('accepts a supported Candidate proposal', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'proposal',
      candidates: [
        {
          candidateId: 'CANDIDATE-0001',
          revision: 1,
          type: 'module',
          title: 'Task Decomposition',
          summary: 'Owns bounded decomposition sessions and Candidate review.',
          derivedFrom: ['NODE-00000001'],
          dependsOn: ['NODE-00000003'],
          resources: [{ kind: 'context', path: 'context/product/project.md' }],
          typeTemplateRef: null,
          metadata: { acceptance: ['The user can inspect every Candidate.'] },
          presentation: { color: '#7c3aed' },
          assumptions: [],
        },
      ],
    },
    context,
  );

  assert.equal(result.outcome, 'proposal');
  assert.equal(result.candidates[0]?.revision, 1);
});

void test('accepts dependencies between Candidates in one proposal', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'proposal',
      candidates: [
        {
          candidateId: 'CANDIDATE-0001',
          revision: 1,
          type: 'module',
          title: 'Foundation',
          summary: 'Owns the shared foundation.',
          derivedFrom: ['NODE-00000001'],
          dependsOn: [],
          resources: [],
          typeTemplateRef: null,
          metadata: {},
          presentation: {},
          assumptions: [],
        },
        {
          candidateId: 'CANDIDATE-0002',
          revision: 1,
          type: 'module',
          title: 'Feature',
          summary: 'Builds on the shared foundation.',
          derivedFrom: ['NODE-00000001'],
          dependsOn: ['CANDIDATE-0001'],
          resources: [],
          typeTemplateRef: null,
          metadata: {},
          presentation: {},
          assumptions: [],
        },
      ],
    },
    context,
  );

  assert.equal(result.outcome, 'proposal');
  if (result.outcome === 'proposal') {
    assert.deepEqual(result.candidates[1]?.dependsOn, ['CANDIDATE-0001']);
  }
});

void test('accepts an immutable Candidate alias after its formal promotion', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'proposal',
      candidates: [
        {
          candidateId: 'CANDIDATE-0002',
          revision: 2,
          type: 'module',
          title: 'Revised feature',
          summary: 'Keeps its accepted prerequisite after revision.',
          derivedFrom: ['NODE-00000001'],
          dependsOn: ['CANDIDATE-0001'],
          resources: [],
          typeTemplateRef: null,
          metadata: {},
          presentation: {},
          assumptions: [],
        },
      ],
    },
    {
      ...context,
      acceptedCandidateIds: ['CANDIDATE-0001'],
      previousCandidateRevisions: { 'CANDIDATE-0002': 1 },
    },
  );

  assert.equal(result.outcome, 'proposal');
  if (result.outcome === 'proposal') {
    assert.deepEqual(result.candidates[0]?.dependsOn, ['CANDIDATE-0001']);
  }
});

void test('rejects unknown, self, and cyclic Candidate dependencies', () => {
  const candidate = {
    revision: 1,
    type: 'module',
    summary: 'A bounded module.',
    derivedFrom: ['NODE-00000001'],
    resources: [],
    typeTemplateRef: null,
    metadata: {},
    presentation: {},
    assumptions: [],
  };

  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              ...candidate,
              candidateId: 'CANDIDATE-0001',
              title: 'Unknown dependency',
              dependsOn: ['CANDIDATE-9999'],
            },
          ],
        },
        context,
      ),
    /unknown Node or Candidate/,
  );
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              ...candidate,
              candidateId: 'CANDIDATE-0001',
              title: 'Self dependency',
              dependsOn: ['CANDIDATE-0001'],
            },
          ],
        },
        context,
      ),
    /cannot depend on itself/,
  );
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              ...candidate,
              candidateId: 'CANDIDATE-0001',
              title: 'First cycle member',
              dependsOn: ['CANDIDATE-0002'],
            },
            {
              ...candidate,
              candidateId: 'CANDIDATE-0002',
              title: 'Second cycle member',
              dependsOn: ['CANDIDATE-0001'],
            },
          ],
        },
        context,
      ),
    /must not contain a cycle/,
  );
});

void test('requires the next revision for an existing Candidate', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              candidateId: 'CANDIDATE-0001',
              revision: 1,
              type: 'module',
              title: 'Task Decomposition',
              summary: 'Owns bounded decomposition sessions.',
              derivedFrom: ['NODE-00000001'],
              dependsOn: [],
              resources: [],
              typeTemplateRef: null,
              metadata: {},
              presentation: {},
              assumptions: [],
            },
          ],
        },
        {
          ...context,
          previousCandidateRevisions: { 'CANDIDATE-0001': 1 },
        },
      ),
    /revision 2/,
  );
});

void test('rejects a Candidate identifier already owned by another proposal', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              candidateId: 'CANDIDATE-0001',
              revision: 1,
              type: 'module',
              title: 'Duplicate module',
              summary: 'Attempts to reuse an existing Candidate identifier.',
              derivedFrom: ['NODE-00000001'],
              dependsOn: [],
              resources: [],
              typeTemplateRef: null,
              metadata: {},
              presentation: {},
              assumptions: [],
            },
          ],
        },
        { ...context, reservedCandidateIds: ['CANDIDATE-0001'] },
      ),
    /already exists/,
  );
});

void test('rejects an invented graph reference', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              candidateId: 'CANDIDATE-0002',
              revision: 1,
              type: 'module',
              title: 'Invented module',
              summary: 'References evidence that was not supplied.',
              derivedFrom: ['NODE-00009999'],
              dependsOn: [],
              resources: [],
              typeTemplateRef: null,
              metadata: {},
              presentation: {},
              assumptions: [],
            },
          ],
        },
        context,
      ),
    HarnessResultValidationError,
  );
});

void test('rejects an invented Resource reference', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          outcome: 'proposal',
          candidates: [
            {
              candidateId: 'CANDIDATE-0002',
              revision: 1,
              type: 'module',
              title: 'Invented module',
              summary: 'References evidence that was not supplied.',
              derivedFrom: ['NODE-00000001'],
              dependsOn: [],
              resources: [{ kind: 'context', path: 'context/unknown.md' }],
              typeTemplateRef: null,
              metadata: {},
              presentation: {},
              assumptions: [],
            },
          ],
        },
        context,
      ),
    /unknown Resource/,
  );
});

void test('rejects a review claim without available Node content', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          impactReview: {
            reviewedNodeIds: ['NODE-00000003'],
            affectedNodeIds: ['NODE-00000003'],
            notes: ['The dependency is affected.'],
          },
          outcome: 'insufficient-evidence',
          missingEvidence: ['The dependency details are required.'],
        },
        context,
      ),
    /must have full content available/,
  );
});

void test('accepts one bounded clarification with one recommendation', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'clarification',
      clarification: {
        question: 'Should delivery evidence belong to the task or its module?',
        options: [
          {
            id: 'task',
            label: 'Task evidence',
            effect: 'Each executable task owns its delivery evidence.',
            recommended: true,
          },
          {
            id: 'module',
            label: 'Module evidence',
            effect: 'The module aggregates evidence for all child tasks.',
            recommended: false,
          },
        ],
      },
    },
    context,
  );

  assert.equal(result.outcome, 'clarification');
  assert.equal(result.clarification.options.length, 2);
});

void test('accepts an explicit insufficient-evidence result', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'insufficient-evidence',
      missingEvidence: ['The selected source does not define the user goal.'],
    },
    context,
  );

  assert.equal(result.outcome, 'insufficient-evidence');
});

void test('accepts an explicit no-change result', () => {
  const result = validateTaskDecompositionHarnessResult(
    {
      ...baseResult(),
      outcome: 'no-change',
      reason: 'The supplemental evidence adds no new product boundary.',
    },
    context,
  );

  assert.equal(result.outcome, 'no-change');
});

void test('rejects a response from stale request input', () => {
  assert.throws(
    () =>
      validateTaskDecompositionHarnessResult(
        {
          ...baseResult(),
          request: { ...request, inputFingerprint: 'sha256:stale' },
          outcome: 'insufficient-evidence',
          missingEvidence: ['Current context is required.'],
        },
        context,
      ),
    /does not match the current request/,
  );
});

void test('rejects malformed Agent JSON before validation', () => {
  assert.throws(
    () => parseTaskDecompositionHarnessResult('{', context),
    /not valid JSON/,
  );
});

void test('the composed Harness output schema is byte-identical to the schema before fragment extraction', () => {
  const fixture = readFileSync(
    new URL(
      './fixtures/harness-schemas/task-decomposition.json',
      import.meta.url,
    ),
    'utf8',
  );
  assert.deepEqual(
    TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA,
    JSON.parse(fixture),
  );
  assert.equal(
    JSON.stringify(TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA),
    JSON.stringify(JSON.parse(fixture)),
  );
});
