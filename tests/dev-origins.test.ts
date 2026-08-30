import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

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
        env: { ...process.env, AGENT_MANAGER_ALLOWED_DEV_ORIGINS: additional },
      },
    ),
  );
}

void test('both loopback hostnames can load interactive development assets by default', () => {
  assert.deepEqual(configuredOrigins(''), ['localhost', '127.0.0.1']);
});

void test('explicit remote development origins extend rather than replace local access', () => {
  assert.deepEqual(
    configuredOrigins(
      ' example.tailnet.test, 127.0.0.1, , example.tailnet.test ',
    ),
    ['localhost', '127.0.0.1', 'example.tailnet.test'],
  );
});
