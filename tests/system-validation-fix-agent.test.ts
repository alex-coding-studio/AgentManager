import assert from 'node:assert/strict';
import test from 'node:test';
import { runSystemValidationFixAgent } from '../lib/modules/implementation/system-validation-fix-agent.ts';
import type { startLocalAgentRun } from '../lib/agents/transport.ts';

void test('Optional UI Fix Agent receives one bounded failure packet', async () => {
  let prompt = '';
  const transport: typeof startLocalAgentRun = (_agent, input) => {
    prompt = input.prompt;
    return {
      completion: Promise.resolve({
        agentSessionId: 'fix-agent',
        usage: null,
        finalOutput: JSON.stringify({ status: 'not-actionable' }),
      }),
      cancel: () => {},
    };
  };
  const result = await runSystemValidationFixAgent(
    {
      packet: {
        version: 1,
        requestId: 'request',
        sourceRunId: 'run',
        candidateSha: 'a'.repeat(40),
        profileId: 'ui-regression',
        failedTestIds: ['AppUITests/Journey/testFlow'],
        logRef: '/tmp/ui.log',
        repairAttempt: 1,
        instructions: 'Repair one failure.',
      },
      workspace: '/tmp/workspace',
      profile: { agent: 'codex', model: 'fixture', effort: 'low' },
    },
    transport,
  );
  assert.equal(result.agentSessionId, 'fix-agent');
  assert.match(prompt, /AppUITests\/Journey\/testFlow/);
  assert.match(prompt, /not required code acceptance/);
  assert.match(prompt, /one bounded repair/);
});

void test('Optional UI Fix Agent rejects another automatic repair', async () => {
  await assert.rejects(
    runSystemValidationFixAgent(
      {
        packet: {
          version: 1,
          requestId: 'request',
          sourceRunId: 'run',
          candidateSha: 'a'.repeat(40),
          profileId: 'ui-regression',
          failedTestIds: [],
          logRef: '/tmp/ui.log',
          repairAttempt: 2 as 1,
          instructions: 'Repair again.',
        },
        workspace: '/tmp/workspace',
        profile: { agent: 'codex', model: 'fixture', effort: 'low' },
      },
      (() => {
        throw new Error('Transport should not start.');
      }) as typeof startLocalAgentRun,
    ),
    /one repair attempt/,
  );
});
