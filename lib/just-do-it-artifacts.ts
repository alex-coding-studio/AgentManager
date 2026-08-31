import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath, readlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import type { RegisteredProject } from './project-registry.ts';

const exec = promisify(execFile);
const excluded = new Set([
  '.git',
  '.agent-manager',
  'node_modules',
  '.next',
  '.build',
  'DerivedData',
  'build',
  'dist',
  '.venv',
  'Pods',
]);
export type WorkspaceSnapshot = {
  root: string;
  files: Record<string, string>;
  head: string | null;
};

export async function snapshotWorkspace(
  project: RegisteredProject,
): Promise<WorkspaceSnapshot> {
  const root = await realpath(project.codePath ?? project.rootPath);
  if (root === path.parse(root).root || root === os.homedir())
    throw new Error(
      'Select a project directory, not a home or filesystem root.',
    );
  const planning = await realpath(project.planningPath);
  const files: Record<string, string> = {};
  let bytes = 0;
  let count = 0;
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (absolute === planning) continue;
      if (++count > 20000)
        throw new Error('Workspace snapshot exceeds the file limit.');
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        const target = await readlink(absolute, { encoding: 'buffer' });
        files[path.relative(root, absolute).split(path.sep).join('/')] =
          `link:${createHash('sha256').update(target).digest('hex')}`;
        continue;
      }
      if (stat.isDirectory()) await walk(absolute);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 256_000_000)
          throw new Error('Workspace snapshot exceeds the size limit.');
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(absolute))
          hash.update(chunk);
        files[path.relative(root, absolute).split(path.sep).join('/')] =
          `${stat.mode & 0o777}:${hash.digest('hex')}`;
      }
    }
  }
  await walk(root);
  let head: string | null = null;
  try {
    const top = (
      await exec('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
        timeout: 5000,
      })
    ).stdout.trim();
    if ((await realpath(top)) === root)
      head = (
        await exec('git', ['-C', root, 'rev-parse', 'HEAD'], { timeout: 5000 })
      ).stdout.trim();
  } catch {
    head = null;
  }
  return { root, files, head };
}

export function observedChanges(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
) {
  if (before.root !== after.root)
    throw new Error('Execution workspace changed.');
  const refs = Object.keys(after.files)
    .filter((name) => before.files[name] !== after.files[name])
    .map((name) => `file:${name}`);
  for (const name of Object.keys(before.files))
    if (!(name in after.files)) refs.push(`deleted:${name}`);
  if (after.head && after.head !== before.head) refs.push(`git:${after.head}`);
  return refs.sort();
}

export async function observedGitCommits(
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
) {
  if (before.root !== after.root)
    throw new Error('Execution workspace changed.');
  if (!after.head || after.head === before.head) return [];
  const args = ['-C', after.root, 'rev-list', '--max-count=1001', after.head];
  if (before.head) args.push(`^${before.head}`);
  const hashes = (
    await exec('git', args, { timeout: 5000, maxBuffer: 1000000 })
  ).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  if (hashes.length > 1000)
    throw new Error('Git output history exceeds the observation limit.');
  if (hashes.some((hash) => !/^[0-9a-f]{40,64}$/.test(hash)))
    throw new Error('Invalid Git history response.');
  return hashes.map((hash) => `git:${hash}`);
}

export async function verifiedGitVersionRefs(
  snapshot: WorkspaceSnapshot,
  claimed: string[],
) {
  if (!snapshot.head) return [];
  const candidates = [...new Set(claimed)].filter((ref) =>
    /^git:[0-9a-f]{40,64}$/.test(ref),
  );
  if (candidates.length > 20) return [];
  const verified: string[] = [];
  for (const ref of candidates) {
    const sha = ref.slice(4);
    try {
      const type = (
        await exec('git', ['-C', snapshot.root, 'cat-file', '-t', sha], {
          timeout: 5000,
        })
      ).stdout.trim();
      if (type !== 'commit') continue;
      await exec(
        'git',
        [
          '-C',
          snapshot.root,
          'merge-base',
          '--is-ancestor',
          sha,
          snapshot.head,
        ],
        { timeout: 5000 },
      );
      verified.push(ref);
    } catch {
      continue;
    }
  }
  return verified;
}

export async function verifiedOutputVersionRefs(
  snapshot: WorkspaceSnapshot,
  claimed: string[],
) {
  const files = claimed.filter(
    (ref) =>
      ref.startsWith('file:') && Object.hasOwn(snapshot.files, ref.slice(5)),
  );
  return [
    ...new Set([
      ...files,
      ...(await verifiedGitVersionRefs(snapshot, claimed)),
    ]),
  ];
}
