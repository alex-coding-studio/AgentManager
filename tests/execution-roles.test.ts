import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executionRoleInstructions,
  executionRoleResponsibilities,
} from '../lib/modules/implementation/execution-responsibilities.ts';
import { candidatePublicationTool } from '../lib/agents/event-driven-transport.ts';
import type {
  CandidatePublication,
  CardEnvironmentManifest,
} from '../lib/card-host-operations.ts';

void test('Roles compose responsibilities with the General baseline once and enforce eligibility', () => {
  assert.deepEqual(
    executionRoleResponsibilities('worker', ['mechanical', 'ios-development']),
    ['draft-publication', 'mechanical', 'ios-development'],
  );
  const instructions = executionRoleInstructions('worker', [
    'general',
    'mechanical',
    'ios-development',
  ]);
  assert.equal(
    instructions.match(/Execution responsibility general:/g)?.length,
    1,
  );
  assert.deepEqual(executionRoleResponsibilities('coordinator'), [
    'coordination',
    'github-delivery',
    'result-reporting',
  ]);
  assert.throws(
    () => executionRoleResponsibilities('worker', ['github-delivery']),
    /not available/,
  );
  assert.throws(
    () => executionRoleResponsibilities('reviewer', ['draft-publication']),
    /not available/,
  );
});

void test('Worker publication cannot promote Ready even when an old session supplies ready=true', async () => {
  const receipt = {
    headSha: 'a'.repeat(40),
    pullRequest: { draft: true },
  } as CandidatePublication;
  let reported: CandidatePublication | undefined;
  const tool = candidatePublicationTool(
    {
      environment: {
        workspace: { baseCommit: 'base', headSha: 'head' },
      } as CardEnvironmentManifest,
      actionId: 'action',
      roundId: 'round',
      onPublished: (value) => {
        reported = value;
      },
    },
    async (request) => {
      assert.equal(request.draft, true);
      assert.equal(request.finalizeOnly, undefined);
      assert.equal(request.actionId, 'action');
      return receipt;
    },
  );
  await tool.call({ title: 'Draft', body: 'Worker result', ready: true });
  assert.equal(reported, receipt);
});
