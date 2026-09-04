import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function configuredOrigins(additional: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        "import config from './next.config.ts'; console.log(JSON.stringify(config.allowedDevOrigins));",
      ],
      {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8',
        env: { ...process.env, PRAXIS_ALLOWED_DEV_ORIGINS: additional },
      },
    ),
  );
}

void test('loopback and local network hosts can load interactive development assets by default', () => {
  const origins = configuredOrigins('');
  assert.ok(origins.includes('localhost'));
  assert.ok(origins.includes('127.0.0.1'));
  for (const addresses of Object.values(networkInterfaces()))
    for (const address of addresses ?? [])
      if (!address.internal && address.family === 'IPv4')
        assert.ok(origins.includes(address.address));
});

void test('explicit remote development origins extend rather than replace local access', () => {
  assert.deepEqual(
    configuredOrigins(
      ' example.tailnet.test, 127.0.0.1, , example.tailnet.test ',
    ),
    [...configuredOrigins(''), 'example.tailnet.test'],
  );
});
