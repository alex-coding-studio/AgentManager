import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cli = path.join(packageRoot, 'bin', 'praxis.mjs');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(
        address && typeof address === 'object',
        'expected a bound port',
      );
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function isolatedEnv() {
  const scope = mkdtempSync(path.join(tmpdir(), 'praxis-cli-'));
  const stub = path.join(scope, 'stub.mjs');
  writeFileSync(stub, 'console.log("READY");\nsetInterval(() => {}, 1000);\n');
  return {
    ...process.env,
    PRAXIS_HOME: path.join(scope, 'home'),
    PRAXIS_SERVER_STUB: stub,
  };
}

function run(args: Array<string>, env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], {
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

void test('help lists the lifecycle commands', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  for (const fragment of [
    'praxis stop',
    'praxis restart',
    'praxis status',
    'praxis logs',
    '--detach',
  ]) {
    assert.ok(
      result.stdout.includes(fragment),
      `help should mention ${fragment}`,
    );
  }
});

void test('an unknown command fails with usage', () => {
  const result = run(['stopx']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: stopx/);
});

void test('stop without a managed server fails', () => {
  const result = run(['stop', '--port', '34501'], isolatedEnv());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No managed Praxis server on port 34501/);
});

void test('start without a build fails before launching', async () => {
  if (existsSync(path.join(packageRoot, '.next', 'BUILD_ID'))) {
    return;
  }
  const port = await freePort();
  const result = run(['start', '--port', String(port)]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has not been built yet/);
});

void test('start, status, logs, restart and stop manage one detached server', async () => {
  const env = isolatedEnv();
  const port = String(await freePort());
  const stop = (extra = []) => run(['stop', '--port', port, ...extra], env);
  try {
    const started = run(['start', '-d', '--port', port], env);
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, new RegExp(`http://localhost:${port}`));

    const duplicate = run(['start', '-d', '--port', port], env);
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /already running/);

    const status = run(['status', '--port', port], env);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /running \(start, detached\)/);

    const logs = run(['logs', '--port', port], env);
    assert.equal(logs.status, 0);
    assert.match(logs.stdout, /READY/);

    const restarted = run(['restart', '--port', port], env);
    assert.equal(restarted.status, 0, restarted.stderr);

    const stopped = stop();
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.match(stopped.stdout, /Stopped Praxis/);

    const after = run(['status', '--port', port], env);
    assert.equal(after.status, 1);
    assert.match(after.stdout, /No managed Praxis server/);
  } finally {
    stop();
  }
});

void test('dev mode is recorded on the managed server', async () => {
  const env = isolatedEnv();
  const port = String(await freePort());
  try {
    const started = run(['dev', '-d', '--port', port], env);
    assert.equal(started.status, 0, started.stderr);
    const status = run(['status', '--port', port], env);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /running \(dev, detached\)/);
  } finally {
    run(['stop', '--port', port], env);
  }
});
