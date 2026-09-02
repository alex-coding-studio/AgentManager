import assert from 'node:assert/strict';
import test from 'node:test';
import { requestProjectReveal } from '../lib/project-reveal.ts';

void test('project reveal reports transport and malformed-response failures', async () => {
  await assert.rejects(
    () =>
      requestProjectReveal('project', (() =>
        Promise.reject(new Error('offline'))) as typeof fetch),
    /Could not open project location/,
  );
  await assert.rejects(
    () =>
      requestProjectReveal('project', (() =>
        Promise.resolve(new Response('not json'))) as typeof fetch),
    /Could not open project location/,
  );
});

void test('project reveal preserves a public failure and accepts success', async () => {
  await assert.rejects(
    () =>
      requestProjectReveal('project', (() =>
        Promise.resolve(
          Response.json(
            { error: 'Project location was not found.' },
            { status: 404 },
          ),
        )) as typeof fetch),
    /Project location was not found/,
  );
  await assert.doesNotReject(() =>
    requestProjectReveal('project', (() =>
      Promise.resolve(Response.json({ opened: true }))) as typeof fetch),
  );
});
