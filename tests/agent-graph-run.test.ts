import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  agentGraphErrorMessage,
  createAgentGraphActivityRecorder,
  initialAgentGraphActivity,
  initializeAgentGraphActivity,
  writeAgentGraphRunEvidence,
} from '../lib/agent-graph-run.ts';

void test('shared Agent Graph errors are bounded and redacted', () => {
  const message = agentGraphErrorMessage(
    new Error(`token=ghp_abcdefghijklmnop ${'x'.repeat(3_000)}`),
    'The Agent Run failed.',
  );
  assert.match(message, /token=\[redacted\]/);
  assert.doesNotMatch(message, /ghp_abcdefghijklmnop/);
  assert.equal(message.length, 2_000);
});

void test('shared Agent Graph evidence is bounded, redacted and readable', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-graph-run-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const activity = initialAgentGraphActivity(
    'Generating a proposal.',
    '2026-09-02T00:00:00.000Z',
  );
  await initializeAgentGraphActivity(directory, activity);
  const recorder = createAgentGraphActivityRecorder(directory, activity);
  recorder.onActivity({
    kind: 'message',
    summary: 'token=ghp_abcdefghijklmnop inspected the graph.',
  });
  await recorder.flush();
  await writeAgentGraphRunEvidence(directory, {
    activity,
    agentOutput: 'api_key=sk-abcdefghijklmnop\nproposal complete',
    summary: '# Summary\n\nProposal complete.\n',
    response: '# Response\n\nReview the proposal.\n',
  });

  const activityText = await readFile(
    path.join(directory, 'activity.jsonl'),
    'utf8',
  );
  const output = await readFile(
    path.join(directory, 'agent-output.txt'),
    'utf8',
  );
  assert.match(activityText, /Generating a proposal/);
  assert.match(activityText, /token=\[redacted\]/);
  assert.doesNotMatch(activityText, /ghp_abcdefghijklmnop/);
  assert.match(output, /api_key=\[redacted\]/);
  assert.doesNotMatch(output, /sk-abcdefghijklmnop/);
  assert.match(
    await readFile(path.join(directory, 'summary.md'), 'utf8'),
    /Proposal complete/,
  );
  assert.match(
    await readFile(path.join(directory, 'response.md'), 'utf8'),
    /Review the proposal/,
  );
});
