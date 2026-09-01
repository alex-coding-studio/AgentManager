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

void test('environment-variable secret forms are redacted in Host diagnostics', () => {
  const cases: Array<[string, string]> = [
    ['DB_PASSWORD=hunter2', 'DB_PASSWORD=[redacted]'],
    ['ACCESS_TOKEN=abc123secret', 'ACCESS_TOKEN=[redacted]'],
    ['AWS_SECRET_ACCESS_KEY=secretvalue', 'AWS_SECRET_ACCESS_KEY=[redacted]'],
    ['GITHUB_TOKEN=ghp_realistic_value_here', 'GITHUB_TOKEN=[redacted]'],
    ['my_api_key: swordfish', 'my_api_key: [redacted]'],
  ];
  for (const [input, expected] of cases)
    assert.equal(redactSecrets(input), expected, input);

  const environmentDump =
    'spawn gh ENOENT (env: PATH=/usr/bin GITHUB_TOKEN=ghp_abcdefghijklmnop DB_PASSWORD=hunter2 HOME=/Users/someone)';
  const redacted = redactSecrets(environmentDump);
  assert.ok(!redacted.includes('ghp_abcdefghijklmnop'));
  assert.ok(!redacted.includes('hunter2'));
  assert.ok(redacted.includes('spawn gh ENOENT'));
  assert.ok(redacted.includes('PATH=/usr/bin'));
});

void test('a caught start-node guard keeps its exact actionable 400', async () => {
  const registry = await import('../lib/project-registry.ts');
  const root = await mkdtemp(path.join(os.tmpdir(), 'am-api-error-node-'));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'guard probe',
    description: '',
    rootPath: root,
  });
  const { POST } =
    await import('../app/api/projects/[projectId]/nodes/route.ts');
  const body = new FormData();
  body.set('title', 'A node with no source');

  const response = await POST(
    new Request('http://localhost:3000/api/nodes', {
      method: 'POST',
      headers: { host: LOCAL },
      body,
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error:
      'Write a starting idea, or select or upload at least one source document.',
  });
});

void test('a caught Run guard keeps its exact actionable 400', async () => {
  const registry = await import('../lib/project-registry.ts');
  const root = await mkdtemp(path.join(os.tmpdir(), 'am-api-error-run-'));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'run guard probe',
    description: '',
    rootPath: root,
  });
  const { POST } =
    await import('../app/api/projects/[projectId]/decomposition-runs/route.ts');
  const body = new FormData();
  body.set('sourceNodeId', 'NODE-abcdef12');
  body.set('instruction', '');
  body.set('agent', 'codex');

  const response = await POST(
    new Request('http://localhost:3000/api/run', {
      method: 'POST',
      headers: { host: LOCAL },
      body,
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'An Instruction is required.',
  });
});

const INTERNAL_FAILURE_MESSAGES = [
  'Expected a Planning response.',
  'Expected an execution response.',
  'Expected an execution report.',
  'A revision must return exactly the requested Candidate identifier.',
  'Refine must return exactly the requested Candidate identifier.',
  'Candidate stable identity is missing.',
  'Invalid Planning Card state.',
  'Invalid Planning storage directory.',
  'Invalid recorded output file.',
  'Card storage ownership changed.',
  'Original report evidence is unavailable.',
  'Instructions directory escapes the project.',
  'This run is owned by another server process.',
  'Execution is owned by another server.',
  'Could not choose a unique Run Resource name.',
  'Could not choose a unique Markdown file name.',
  'Could not choose a unique source file name.',
];

void test('an internal failure never reaches the client, only the fallback and an id', async () => {
  for (const message of INTERNAL_FAILURE_MESSAGES) {
    const { result, captured } = await captureDiagnosticsAsync(async () =>
      apiErrorResponse(
        new Error(message),
        'Planning request failed.',
        '/api/projects/[projectId]/planning',
      ),
    );
    assert.equal(result.status, 500, message);
    const body = (await result.json()) as {
      error: string;
      correlationId: string;
    };
    assert.equal(body.error, 'Planning request failed.');
    assert.ok(!JSON.stringify(body).includes(message), message);
    assert.match(body.correlationId, /^[0-9a-f]{12}$/);
    assert.ok(captured.join('\n').includes(message));
  }
});

void test('internal failures are not thrown as PublicApiError anywhere in lib', async () => {
  const directory = new URL('../lib/', import.meta.url);
  const files = (await readdir(directory)).filter((name) =>
    name.endsWith('.ts'),
  );
  const misclassified: string[] = [];
  for (const name of files) {
    const source = await readFile(new URL(name, directory), 'utf8');
    for (const message of INTERNAL_FAILURE_MESSAGES) {
      const escaped = message.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`throw new PublicApiError\\(\\s*'${escaped}'`);
      if (pattern.test(source)) misclassified.push(`${name}: ${message}`);
    }
  }
  assert.deepEqual(misclassified, []);
});

void test('deliberate request validation is still thrown as PublicApiError', async () => {
  const directory = new URL('../lib/', import.meta.url);
  const expected: Array<[string, string]> = [
    ['task-graph.ts', 'A start-node title is required.'],
    ['task-graph.ts', 'Upload no more than 20 Markdown files at once.'],
    ['task-decomposition-runs.ts', 'An Instruction is required.'],
    ['whats-next-runs.ts', 'Select at least one origin Node.'],
    ['project-registry.ts', 'The project path must be an existing directory.'],
    ['product-context.ts', 'Only Markdown files can be imported right now.'],
  ];
  for (const [name, message] of expected) {
    const source = await readFile(new URL(name, directory), 'utf8');
    const escaped = message.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      source,
      new RegExp(`throw new PublicApiError\\(\\s*'${escaped}'`),
      `${name} should keep ${message} public`,
    );
  }
});

const MESSAGE_READ = /\berror\s*\.\s*message\b/g;
const NARROWING = /if\s*\(\s*error instanceof ([A-Z]\w*Error)\s*\)/g;

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

// Conservative rule: an API catch block may not read error.message at all,
// except inside a branch already narrowed to a known error class. No data-flow
// tracing, so no alias depth, template interpolation or field name can bypass it.
function narrowedRanges(body: string) {
  const ranges: Array<[number, number]> = [];
  NARROWING.lastIndex = 0;
  for (const match of body.matchAll(NARROWING)) {
    let index = match.index + match[0].length;
    while (index < body.length && /\s/.test(body[index]!)) index += 1;
    if (body[index] === '{') {
      let depth = 0;
      let cursor = index;
      while (cursor < body.length) {
        if (body[cursor] === '{') depth += 1;
        else if (body[cursor] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
        cursor += 1;
      }
      ranges.push([index, cursor]);
      continue;
    }
    const terminator = body.indexOf(';', index);
    ranges.push([index, terminator === -1 ? body.length : terminator]);
  }
  return ranges;
}

function leakingHandlers(source: string, file = 'source') {
  const findings: string[] = [];
  for (const { line, body } of catchBlocks(source)) {
    const allowed = narrowedRanges(body);
    MESSAGE_READ.lastIndex = 0;
    for (const usage of body.matchAll(MESSAGE_READ)) {
      const inNarrowedBranch = allowed.some(
        ([from, to]) => usage.index >= from && usage.index <= to,
      );
      if (!inNarrowedBranch)
        findings.push(
          `${file}:${line} reads error.message outside a narrowed branch`,
        );
    }
  }
  return findings;
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

void test('the leak assertion rejects every publication form including multi-hop aliases', () => {
  const cases: Array<[string, string]> = [
    [
      'direct',
      `catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }`,
    ],
    [
      'aliased',
      `catch (error) {
    const message = error instanceof Error ? error.message : 'Could not act.';
    return Response.json({ error: message }, { status: 400 });
  }`,
    ],
    [
      'other-field',
      `catch (error) {
    return Response.json({ error: 'Could not act.', detail: error.message });
  }`,
    ],
    [
      'raw-response',
      `catch (error) {
    return new Response(error.message, { status: 500 });
  }`,
    ],
    [
      'interpolated',
      `catch (error) {
    return new Response(\`Could not act: \${error.message}\`, { status: 500 });
  }`,
    ],
    [
      'two-hop-alias',
      `catch (error) {
    const message = error.message;
    const payload = { detail: message };
    return Response.json(payload);
  }`,
    ],
    [
      'three-hop-alias',
      `catch (error) {
    const first = error.message;
    const second = first;
    const payload = { detail: second };
    return Response.json(payload);
  }`,
    ],
    [
      'logged-then-published',
      `catch (error) {
    const captured = String(error.message).slice(0, 200);
    return Response.json({ error: captured });
  }`,
    ],
  ];

  for (const [label, body] of cases) {
    const findings = leakingHandlers(
      `export async function GET() {
  try {
    return Response.json({});
  } ${body}
}`,
      label,
    );
    assert.ok(findings.length >= 1, `${label} should be reported`);
  }

  const narrowed = `export async function PATCH() {
  try {
    return Response.json({});
  } catch (error) {
    if (error instanceof NodeReferencedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
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

  assert.deepEqual(leakingHandlers(narrowed, 'narrowed'), []);
  assert.deepEqual(leakingHandlers(clean, 'clean'), []);
});
