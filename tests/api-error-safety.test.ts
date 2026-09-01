import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  PublicApiError,
  apiErrorResponse,
  redactSecrets,
} from '../lib/api-errors.ts';

const LOCAL = 'localhost:3000';
const REGISTRY_HOME = mkdtempSync(path.join(os.tmpdir(), 'am-api-error-home-'));
process.env.AGENT_MANAGER_HOME = REGISTRY_HOME;

function captureDiagnostics<T>(run: () => T) {
  const captured: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => captured.push(parts.join(' '));
  try {
    return { result: run(), captured };
  } finally {
    console.error = original;
  }
}

async function captureDiagnosticsAsync<T>(run: () => Promise<T>) {
  const captured: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => captured.push(parts.join(' '));
  try {
    return { result: await run(), captured };
  } finally {
    console.error = original;
  }
}

void test('an explicit public error keeps its status, code and message', async () => {
  const { result, captured } = captureDiagnostics(() =>
    apiErrorResponse(
      new PublicApiError(
        'This Node already has an active Agent Run.',
        409,
        'run_active',
      ),
      'Could not start the Agent Run.',
      'POST /api/test',
    ),
  );
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), {
    error: 'This Node already has an active Agent Run.',
    code: 'run_active',
  });
  assert.deepEqual(captured, []);
});

void test('an unexpected error exposes no path, username, stack or raw message', async () => {
  const leak = new Error(
    "ENOENT: no such file or directory, realpath '/Users/someone/projects/secret-client/.agent-manager/context/product/notes.md'",
  );
  const { result } = await captureDiagnosticsAsync(async () =>
    apiErrorResponse(
      leak,
      'Could not read the source document.',
      'GET /api/test',
    ),
  );
  assert.equal(result.status, 500);
  const body = (await result.json()) as {
    error: string;
    correlationId: string;
  };
  assert.equal(body.error, 'Could not read the source document.');
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('/Users/'));
  assert.ok(!serialized.includes('someone'));
  assert.ok(!serialized.includes('secret-client'));
  assert.ok(!serialized.includes('ENOENT'));
  assert.ok(!serialized.includes('realpath'));
  assert.ok(!serialized.includes(leak.message));
  assert.match(body.correlationId, /^[0-9a-f]{12}$/);
});

void test('token-like values reach neither the response nor the Host diagnostic', async () => {
  const secrets = [
    'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB',
    'sk-0123456789abcdefghijklmnop',
    'xoxb-1234567890-abcdefghij',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  ];
  const leak = new Error(
    [
      `gh api failed: Authorization: Bearer ${secrets[0]}`,
      `token=${secrets[1]}`,
      `slack ${secrets[2]}`,
      `jwt ${secrets[3]}`,
      'password: hunter2seventeen',
      '--token super-secret-value',
    ].join(' | '),
  );

  const { result, captured } = await captureDiagnosticsAsync(async () =>
    apiErrorResponse(leak, 'Execution failed.', 'POST /api/test'),
  );

  const body = await result.text();
  const diagnostic = captured.join('\n');
  assert.ok(captured.length > 0);
  for (const secret of secrets) {
    assert.ok(!body.includes(secret), `response leaked ${secret.slice(0, 8)}`);
    assert.ok(
      !diagnostic.includes(secret),
      `diagnostic leaked ${secret.slice(0, 8)}`,
    );
  }
  assert.ok(!diagnostic.includes('hunter2seventeen'));
  assert.ok(!diagnostic.includes('super-secret-value'));
  assert.ok(diagnostic.includes('[redacted'));
});

void test('the response and the Host diagnostic share one correlation identifier', async () => {
  const { result, captured } = await captureDiagnosticsAsync(async () =>
    apiErrorResponse(
      new Error('internal detail'),
      'Could not read the log.',
      'GET /api/test',
    ),
  );
  const body = (await result.json()) as { correlationId: string };
  assert.equal(captured.length, 1);
  assert.ok(captured[0]!.includes(body.correlationId));
  assert.ok(captured[0]!.includes('GET /api/test'));
  assert.ok(!body.correlationId.includes('internal detail'));
});

void test('redaction leaves ordinary diagnostic text readable', () => {
  const text = 'EACCES: permission denied, open /tmp/example/config.json';
  assert.equal(redactSecrets(text), text);
});

void test('Request Boundary errors keep their Part 1 status codes', async () => {
  const { RequestBoundaryError } = await import('../lib/request-boundary.ts');
  for (const [status, message] of [
    [403, 'Cross-origin writes are not allowed.'],
    [415, 'This request must be sent as application/json.'],
    [421, 'This host is not allowed.'],
  ] as Array<[number, string]>) {
    const response = apiErrorResponse(
      new RequestBoundaryError(message, status),
      'Could not create project.',
      'POST /api/test',
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: message });
  }
});

void test('a real leaking Route now returns its route-owned generic 500', async () => {
  const registry = await import('../lib/project-registry.ts');
  const root = await mkdtemp(path.join(os.tmpdir(), 'am-api-error-project-'));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'error probe',
    description: '',
    rootPath: root,
  });
  const { GET } =
    await import('../app/api/projects/[projectId]/resources/route.ts');

  const { result, captured } = await captureDiagnosticsAsync(async () =>
    GET(
      new Request(
        'http://localhost:3000/api/resources?path=context/product/absent.md',
        { headers: { host: LOCAL } },
      ),
      { params: Promise.resolve({ projectId: project.id }) },
    ),
  );

  assert.equal(result.status, 500);
  const body = await result.text();
  assert.ok(!body.includes(root));
  assert.ok(!body.includes('/Users/'));
  assert.ok(!body.includes('/private/'));
  assert.ok(!body.includes('realpath'));
  assert.ok(!body.includes('ENOENT'));
  assert.ok(body.includes('Could not read the source document.'));
  assert.equal(captured.length, 1);
  assert.ok(captured[0]!.includes('ENOENT'));
});

void test('safe business validation stays exact and actionable', async () => {
  const { POST } = await import('../app/api/projects/route.ts');
  const response = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { host: LOCAL, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'standalone',
        name: '',
        description: '',
        rootPath: '/tmp',
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Project name is required.',
  });
});

void test('a rejected request creates no project and starts no Agent Run', async () => {
  const registry = await import('../lib/project-registry.ts');
  const before = (await registry.listProjects()).length;
  const root = await mkdtemp(path.join(os.tmpdir(), 'am-api-error-noop-'));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'no side effects',
    description: '',
    rootPath: root,
  });
  const { POST } =
    await import('../app/api/projects/[projectId]/decomposition-runs/route.ts');
  const body = new FormData();
  body.set('sourceNodeId', 'NODE-deadbeef');
  body.set('instruction', 'probe');
  body.set('agent', 'codex');

  const { result } = await captureDiagnosticsAsync(async () =>
    POST(
      new Request('http://localhost:3000/api/run', {
        method: 'POST',
        headers: { host: LOCAL },
        body,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    ),
  );

  assert.ok(result.status >= 400);
  const text = await result.text();
  assert.ok(!text.includes(root));
  assert.ok(!text.includes('/Users/'));
  await assert.rejects(() =>
    readdir(path.join(project.planningPath, 'task-decomposition', 'runs')),
  );
  assert.equal((await registry.listProjects()).length, before + 1);
});

const MESSAGE_READ = /\berror\s*\.\s*message\b/;
const NARROWED = /instanceof\s+[A-Z]\w*Error/;

function catchBlocks(source: string) {
  const blocks: Array<{ line: number; body: string }> = [];
  for (const match of source.matchAll(/catch\s*\(([^)]*)\)\s*\{/g)) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push({
      line: source.slice(0, match.index).split('\n').length,
      body: source.slice(match.index + match[0].length, index - 1),
    });
  }
  return blocks;
}

function publishedErrorExpressions(body: string) {
  return [...body.matchAll(/\berror\s*:\s*([^,}]+)/g)].map((m) => m[1]!.trim());
}

function exposesUnknownMessage(body: string) {
  const published = publishedErrorExpressions(body);
  for (const expression of published) {
    if (MESSAGE_READ.test(expression)) {
      const preceding = body.slice(0, body.indexOf(expression));
      if (!NARROWED.test(preceding)) return true;
      continue;
    }
    const identifier = /^[A-Za-z_$][\w$]*$/.test(expression)
      ? expression
      : null;
    if (!identifier) continue;
    const binding = new RegExp(
      `(?:const|let|var)\\s+${identifier}\\s*=([\\s\\S]*?);`,
    ).exec(body);
    if (binding && MESSAGE_READ.test(binding[1]!)) {
      const preceding = body.slice(0, binding.index);
      if (!NARROWED.test(preceding)) return true;
    }
  }
  return false;
}

function leakingHandlers(source: string, file = 'source') {
  return catchBlocks(source)
    .filter(({ body }) => exposesUnknownMessage(body))
    .map(({ line }) => `${file}:${line} publishes an unknown error message`);
}

async function apiRouteFiles(
  directory = new URL('../app/api/', import.meta.url),
) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory())
      files.push(
        ...(await apiRouteFiles(new URL(`${entry.name}/`, directory))),
      );
    else if (entry.name === 'route.ts')
      files.push(path.join(directory.pathname, entry.name));
  }
  return files;
}

void test('no API catch block publishes an unknown error message', async () => {
  const routes = await apiRouteFiles();
  assert.ok(routes.length >= 18);
  const findings: string[] = [];
  for (const file of routes)
    findings.push(...leakingHandlers(await readFile(file, 'utf8'), file));
  assert.deepEqual(findings, []);
});

void test('the leak assertion rejects a synthetic direct exposure', () => {
  const direct = `export async function GET() {
  try {
    return Response.json({});
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}`;
  const ternary = `export async function POST() {
  try {
    return Response.json({});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not act.';
    return Response.json({ error: message }, { status: 400 });
  }
}`;
  const narrowed = `export async function PATCH() {
  try {
    return Response.json({});
  } catch (error) {
    if (error instanceof NodeReferencedError)
      return Response.json({ error: error.message }, { status: 409 });
    return apiErrorResponse(error, 'Could not act.', 'PATCH /api/test');
  }
}`;
  const clean = `export async function DELETE() {
  try {
    return Response.json({});
  } catch (error) {
    return apiErrorResponse(error, 'Could not act.', 'DELETE /api/test');
  }
}`;

  assert.equal(leakingHandlers(direct, 'direct').length, 1);
  assert.equal(leakingHandlers(ternary, 'ternary').length, 1);
  assert.deepEqual(leakingHandlers(narrowed, 'narrowed'), []);
  assert.deepEqual(leakingHandlers(clean, 'clean'), []);
});
