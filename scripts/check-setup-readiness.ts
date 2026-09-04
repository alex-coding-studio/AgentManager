import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const [infraRoot, installedSkill, revision] = process.argv.slice(2);
if (!infraRoot || !installedSkill || !revision)
  throw new Error(
    'Usage: check-setup-readiness.ts INFRA_ROOT INSTALLED_SETUP_SKILL_DIR EXPECTED_GIT_REVISION',
  );
const files = [
  [
    'tooling/ios/scripts/bootstrap-project.py',
    path.join(infraRoot, 'tooling/ios/scripts/bootstrap-project.py'),
  ],
  [
    'tooling/ios/githooks/pre-push',
    path.join(infraRoot, 'tooling/ios/githooks/pre-push'),
  ],
  [
    'plugins/ios-dev-agent/skills/setup/SKILL.md',
    path.join(installedSkill, 'SKILL.md'),
  ],
  [
    'plugins/ios-dev-agent/skills/setup/references/bootstrap-and-tooling.md',
    path.join(installedSkill, 'references/bootstrap-and-tooling.md'),
  ],
];
const commit = execFileSync(
  'git',
  ['-C', infraRoot, 'rev-parse', '--verify', `${revision}^{commit}`],
  { encoding: 'utf8' },
).trim();
const mismatches = files.flatMap(([source, installed]) => {
  const expected = execFileSync('git', [
    '-C',
    infraRoot,
    'show',
    `${commit}:${source}`,
  ]);
  try {
    return readFileSync(installed).equals(expected) ? [] : [source];
  } catch {
    return [source];
  }
});
process.stdout.write(
  `${JSON.stringify({ ready: mismatches.length === 0, revision: commit, mismatches }, null, 2)}\n`,
);
if (mismatches.length) process.exitCode = 1;
