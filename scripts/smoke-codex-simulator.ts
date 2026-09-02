import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readCodexSkills } from '../lib/local-agent-skills.ts';
import { buildCodexArguments } from '../lib/local-agent-transport.ts';

const exec = promisify(execFile);
const catalog = await readCodexSkills(process.cwd());
const args = buildCodexArguments(
  { workingDirectory: process.cwd(), prompt: '', access: 'workspace-write' },
  catalog,
);
if (!args.includes('danger-full-access'))
  throw new Error(
    'This smoke requires the user to have already selected local Full Access.',
  );
const directory = await mkdtemp(
  path.join(os.tmpdir(), 'codex-simulator-permission-'),
);
const run = async (command: string, arguments_: string[], timeout = 20000) =>
  exec(
    'codex',
    [
      'sandbox',
      '-P',
      ':danger-full-access',
      '-C',
      directory,
      '--',
      command,
      ...arguments_,
    ],
    { timeout, maxBuffer: 2000000 },
  );
try {
  const result = await run('xcrun', [
    'simctl',
    'list',
    'devices',
    'available',
    '--json',
  ]);
  const devices = Object.values(
    JSON.parse(result.stdout).devices,
  ).flat() as Array<{ name: string; udid: string; state: string }>;
  const device = devices.find(
    (item) => item.state === 'Booted' && item.name.startsWith('iPhone'),
  );
  if (!device)
    throw new Error(
      'No booted iPhone simulator is available; this smoke will not boot or reset user devices.',
    );
  console.log(
    `Simulator query passed: ${devices.length} available, using ${device.name}.`,
  );
  await mkdir(path.join(directory, 'Tests'));
  await writeFile(
    path.join(directory, 'Tests/PermissionSmokeTests.swift'),
    `import XCTest\n\nfinal class PermissionSmokeTests: XCTestCase {\n    func testRunsInIOSSimulator() {\n#if targetEnvironment(simulator)\n        XCTAssertGreaterThanOrEqual(ProcessInfo.processInfo.operatingSystemVersion.majorVersion, 18)\n#else\n        XCTFail("Expected the iOS simulator runtime")\n#endif\n    }\n}\n`,
  );
  await writeFile(
    path.join(directory, 'project.yml'),
    `name: SimulatorPermissionSmoke\noptions:\n  deploymentTarget:\n    iOS: "18.0"\nsettings:\n  base:\n    SWIFT_VERSION: "6.0"\n    CODE_SIGNING_ALLOWED: NO\ntargets:\n  PermissionSmokeTests:\n    type: bundle.unit-test\n    platform: iOS\n    sources: [Tests]\n    settings:\n      base:\n        PRODUCT_BUNDLE_IDENTIFIER: local.praxis.permission-smoke\n        GENERATE_INFOPLIST_FILE: YES\nschemes:\n  PermissionSmokeTests:\n    build:\n      targets:\n        PermissionSmokeTests: all\n    test:\n      targets: [PermissionSmokeTests]\n`,
  );
  await run('xcodegen', ['generate']);
  console.log(
    'Running isolated iOS Simulator XCTest fixture; no user project is built.',
  );
  const test = await run(
    'xcodebuild',
    [
      'test',
      '-project',
      'SimulatorPermissionSmoke.xcodeproj',
      '-scheme',
      'PermissionSmokeTests',
      '-destination',
      `platform=iOS Simulator,id=${device.udid}`,
      '-derivedDataPath',
      path.join(directory, 'DerivedData'),
      '-resultBundlePath',
      path.join(directory, 'Result.xcresult'),
      '-quiet',
    ],
    180000,
  );
  console.log(test.stdout.slice(-4000));
  console.log(
    'PASS: native Full Access can query, build and execute a test in the existing iPhone simulator.',
  );
} catch (error) {
  console.error(
    (error as { stderr?: string }).stderr?.slice(-6000) ?? String(error),
  );
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
