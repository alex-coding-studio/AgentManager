import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isAllowedHost,
  isCrossOriginRequest,
  normalizeHostname,
} from '../lib/request-boundary.ts';

const LOCAL = 'localhost:3000';
const REGISTRY_HOME = mkdtempSync(path.join(os.tmpdir(), 'am-boundary-home-'));
process.env.AGENT_MANAGER_HOME = REGISTRY_HOME;

function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try {
    run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

void test('host headers normalize across IPv4, IPv6 and port forms', () => {
  assert.equal(normalizeHostname('localhost:3000'), 'localhost');
  assert.equal(normalizeHostname('LOCALHOST'), 'localhost');
  assert.equal(normalizeHostname('127.0.0.1:3100'), '127.0.0.1');
  assert.equal(normalizeHostname('[::1]:3000'), '[::1]');
  assert.equal(normalizeHostname('[::1]'), '[::1]');
  assert.equal(normalizeHostname('[2001:db8::1]:8443'), '[2001:db8::1]');
  assert.equal(
    normalizeHostname('device.tailnet.ts.net'),
    'device.tailnet.ts.net',
  );
  assert.equal(normalizeHostname(''), null);
  assert.equal(normalizeHostname(null), null);
});

void test('malformed host headers never normalize to an allowed hostname', () => {
  assert.equal(normalizeHostname('::1'), null);
  assert.equal(normalizeHostname('2001:db8::1'), null);
  assert.equal(normalizeHostname('localhost:notaport'), null);
  assert.equal(normalizeHostname('[::1'), null);
  assert.equal(normalizeHostname('[]'), null);
  assert.equal(normalizeHostname('[::1]junk'), null);
});

void test('loopback hosts are allowed and unknown hosts are rejected', () => {
  withEnvironment(
    {
      AGENT_MANAGER_ALLOWED_HOSTS: undefined,
      AGENT_MANAGER_ALLOWED_DEV_ORIGINS: undefined,
    },
    () => {
      assert.equal(isAllowedHost('localhost:3000'), true);
      assert.equal(isAllowedHost('127.0.0.1:3000'), true);
      assert.equal(isAllowedHost('[::1]:3000'), true);
      assert.equal(isAllowedHost('attacker.example.com'), false);
      assert.equal(isAllowedHost('device.tailnet.ts.net'), false);
      assert.equal(isAllowedHost(null), false);
    },
  );
});

void test('configured hostnames extend rather than replace loopback access', () => {
  withEnvironment(
    {
      AGENT_MANAGER_ALLOWED_HOSTS: ' device.tailnet.ts.net , ',
      AGENT_MANAGER_ALLOWED_DEV_ORIGINS: undefined,
    },
    () => {
      assert.equal(isAllowedHost('device.tailnet.ts.net'), true);
      assert.equal(isAllowedHost('device.tailnet.ts.net:3000'), true);
      assert.equal(isAllowedHost('localhost:3000'), true);
      assert.equal(isAllowedHost('other.tailnet.ts.net'), false);
    },
  );
});

void test('the documented Tailscale development variable keeps working', () => {
  withEnvironment(
    {
      AGENT_MANAGER_ALLOWED_HOSTS: undefined,
      AGENT_MANAGER_ALLOWED_DEV_ORIGINS: 'device.tailnet.ts.net',
    },
    () => {
      assert.equal(isAllowedHost('device.tailnet.ts.net'), true);
      assert.equal(isAllowedHost('attacker.example.com'), false);
    },
  );
});

void test('forwarded headers never widen the allowed host set', () => {
  withEnvironment(
    {
      AGENT_MANAGER_ALLOWED_HOSTS: undefined,
      AGENT_MANAGER_ALLOWED_DEV_ORIGINS: undefined,
    },
    () => {
      const request = new Request('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: {
          host: 'attacker.example.com',
          'x-forwarded-host': 'localhost',
        },
      });
      assert.equal(isAllowedHost(request.headers.get('host')), false);
    },
  );
});

void test('same-origin writes pass and foreign origins are cross-origin', () => {
  assert.equal(isCrossOriginRequest('http://localhost:3000', LOCAL), false);
  assert.equal(isCrossOriginRequest('https://evil.example', LOCAL), true);
  assert.equal(isCrossOriginRequest('http://localhost:3100', LOCAL), true);
  assert.equal(isCrossOriginRequest('null', LOCAL), true);
  assert.equal(isCrossOriginRequest('not a url', LOCAL), true);
});

void test('requests without an Origin header keep the native CLI path open', () => {
  assert.equal(isCrossOriginRequest(null, LOCAL), false);
  assert.equal(isCrossOriginRequest('', LOCAL), false);
});

void test('IPv6 origins compare by hostname and port, not raw string', () => {
  assert.equal(isCrossOriginRequest('http://[::1]:3000', '[::1]:3000'), false);
  assert.equal(isCrossOriginRequest('http://[::1]:3100', '[::1]:3000'), true);
});

void test('Proxy rejects foreign origins and unknown hosts before the route runs', async () => {
  const { proxy, config } = await import('../proxy.ts');
  assert.equal(config.matcher, '/api/:path*');

  const crossOrigin = proxy(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { host: LOCAL, origin: 'https://evil.example' },
    }) as never,
  );
  assert.equal(crossOrigin.status, 403);

  const foreignHost = proxy(
    new Request('http://localhost:3000/api/projects', {
      method: 'GET',
      headers: { host: 'attacker.example.com' },
    }) as never,
  );
  assert.equal(foreignHost.status, 421);

  const allowed = proxy(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { host: LOCAL, origin: 'http://localhost:3000' },
    }) as never,
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('x-middleware-next'), '1');
});

async function savedProjects() {
  try {
    const value = JSON.parse(
      await readFile(path.join(REGISTRY_HOME, 'config.json'), 'utf8'),
    ) as { projects: unknown[] };
    return value.projects;
  } catch {
    return [];
  }
}

void test('rejected project creation never reaches the filesystem', async () => {
  const before = (await savedProjects()).length;
  const { POST } = await import('../app/api/projects/route.ts');
  const target = await mkdtemp(path.join(os.tmpdir(), 'am-boundary-target-'));
  const payload = JSON.stringify({
    kind: 'standalone',
    name: 'boundary probe',
    description: '',
    rootPath: target,
  });

  const crossOrigin = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        host: LOCAL,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: payload,
    }),
  );
  assert.equal(crossOrigin.status, 403);

  const simpleContentType = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { host: LOCAL, 'content-type': 'text/plain;charset=UTF-8' },
      body: payload,
    }),
  );
  assert.equal(simpleContentType.status, 415);

  const foreignHost = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        host: 'attacker.example.com',
        'content-type': 'application/json',
      },
      body: payload,
    }),
  );
  assert.equal(foreignHost.status, 421);

  assert.equal((await savedProjects()).length, before);
  assert.deepEqual(await readdir(target), []);
});

void test('a same-origin JSON request still registers a project', async () => {
  const before = (await savedProjects()).length;
  const { POST } = await import('../app/api/projects/route.ts');
  const target = await mkdtemp(path.join(os.tmpdir(), 'am-boundary-ok-'));

  const response = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        host: LOCAL,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'standalone',
        name: 'allowed',
        description: '',
        rootPath: target,
      }),
    }),
  );

  assert.equal(response.status, 201);
  assert.equal((await savedProjects()).length, before + 1);
});

void test('the documented native path without an Origin header still registers', async () => {
  const before = (await savedProjects()).length;
  const { POST } = await import('../app/api/projects/route.ts');
  const target = await mkdtemp(path.join(os.tmpdir(), 'am-boundary-cli-'));

  const response = await POST(
    new Request('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: { host: LOCAL, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'standalone',
        name: 'native',
        description: '',
        rootPath: target,
      }),
    }),
  );

  assert.equal(response.status, 201);
  assert.equal((await savedProjects()).length, before + 1);
});

void test('a rejected decomposition request starts no Agent Run', async () => {
  const registry = await import('../lib/project-registry.ts');
  const before = (await savedProjects()).length;
  const root = await mkdtemp(path.join(os.tmpdir(), 'am-boundary-run-'));
  const project = await registry.createProject({
    kind: 'standalone',
    name: 'run probe',
    description: '',
    rootPath: root,
  });
  const { POST } =
    await import('../app/api/projects/[projectId]/decomposition-runs/route.ts');
  const params = Promise.resolve({ projectId: project.id });
  const body = new FormData();
  body.set('sourceNodeId', 'NODE-deadbeef');
  body.set('instruction', 'probe');
  body.set('agent', 'codex');

  const crossOrigin = await POST(
    new Request('http://localhost:3000/api/run', {
      method: 'POST',
      headers: { host: LOCAL, origin: 'https://evil.example' },
      body,
    }),
    { params },
  );
  assert.equal(crossOrigin.status, 403);

  const foreignHost = await POST(
    new Request('http://localhost:3000/api/run', {
      method: 'POST',
      headers: { host: 'attacker.example.com' },
      body,
    }),
    { params },
  );
  assert.equal(foreignHost.status, 421);

  await assert.rejects(() =>
    readdir(path.join(project.planningPath, 'task-decomposition', 'runs')),
  );
  assert.equal((await savedProjects()).length, before + 1);
});

const UNSAFE_HANDLER = /export async function (POST|PUT|PATCH|DELETE)\(/g;
const GUARD_CALL = /guard(?:Json)?Request\(request\)/;
const HANDLER_WORK = [
  /\bawait\b/,
  /\brequest\s*\.\s*(?:json|formData|text|arrayBuffer|blob|bytes|clone)\s*\(/,
  /\bgetProject\s*\(/,
  /\bparams\b/,
];

function handlerBody(source: string, parenthesis: number) {
  let depth = 0;
  let index = parenthesis;
  while (index < source.length) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    index += 1;
  }
  const open = source.indexOf('{', index);
  const next = source.indexOf('export async function', open);
  return source.slice(open + 1, next === -1 ? source.length : next);
}

function unguardedHandlers(source: string, file = 'source') {
  const findings: string[] = [];
  for (const match of source.matchAll(UNSAFE_HANDLER)) {
    const body = handlerBody(source, match.index + match[0].length - 1);
    const guard = GUARD_CALL.exec(body);
    if (!guard) {
      findings.push(`${file} ${match[1]} does not call the shared guard`);
      continue;
    }
    const firstWork = Math.min(
      ...HANDLER_WORK.map((pattern) => pattern.exec(body)?.index ?? Infinity),
    );
    if (guard.index > firstWork)
      findings.push(
        `${file} ${match[1]} calls the shared guard after other work`,
      );
  }
  return findings;
}

void test('every unsafe API handler calls the shared guard before any work', async () => {
  const routes = await apiRouteFiles();
  assert.ok(routes.length >= 18);
  const findings: string[] = [];
  for (const file of routes)
    findings.push(...unguardedHandlers(await readFile(file, 'utf8'), file));
  assert.deepEqual(findings, []);
});

void test('the handler assertion rejects a guard that runs after other work', () => {
  const missing = `export async function POST(request: Request) {
  return Response.json({ ok: true });
}`;
  const afterAwait = `export async function POST(request: Request) {
  const body = await request.formData();
  const denied = guardRequest(request);
  if (denied) return denied;
  return Response.json({ ok: Boolean(body) });
}`;
  const afterLookup = `export async function DELETE(request: Request, { params }) {
  const project = await getProject((await params).projectId);
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  return Response.json({ ok: Boolean(project) });
}`;
  const compliant = `export async function PATCH(request: Request, { params }) {
  const denied = guardJsonRequest(request);
  if (denied) return denied;
  const project = await getProject((await params).projectId);
  return Response.json({ ok: Boolean(project) });
}`;

  assert.deepEqual(unguardedHandlers(missing, 'missing'), [
    'missing POST does not call the shared guard',
  ]);
  assert.deepEqual(unguardedHandlers(afterAwait, 'after-await'), [
    'after-await POST calls the shared guard after other work',
  ]);
  assert.deepEqual(unguardedHandlers(afterLookup, 'after-lookup'), [
    'after-lookup DELETE calls the shared guard after other work',
  ]);
  assert.deepEqual(unguardedHandlers(compliant, 'compliant'), []);
});

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
