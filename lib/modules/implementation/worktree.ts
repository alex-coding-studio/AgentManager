import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from '../../project-registry.ts';
import type { PlanningCard } from './planning-service.ts';
import { assertCardUuid } from './harness.ts';
import { PublicApiError } from '../../api-errors.ts';

const exec = promisify(execFile);
export type CardWorkspace = {
  path: string;
  repository: string;
  branch: string;
  baseCommit: string;
  gitDirectory: string;
};
export const bootstrapRequired = 'EMPTY_REPOSITORY_CONFIRMATION_REQUIRED';
function environment() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith('GIT_')) delete env[key];
  return env;
}
async function git(directory: string, ...args: string[]) {
  return (
    await exec('git', ['-C', directory, ...args], {
      timeout: 20000,
      maxBuffer: 2000000,
      env: environment(),
    })
  ).stdout.trim();
}
async function optionalGit(directory: string, ...args: string[]) {
  try {
    return await git(directory, ...args);
  } catch {
    return null;
  }
}
async function isAncestor(repository: string, ancestor: string, head: string) {
  try {
    await git(repository, 'merge-base', '--is-ancestor', ancestor, head);
    return true;
  } catch {
    return false;
  }
}
async function resolveCardBase(repository: string) {
  const currentHead = await git(repository, 'rev-parse', 'HEAD');
  if (!(await optionalGit(repository, 'remote', 'get-url', 'origin')))
    return currentHead;
  try {
    await git(repository, 'fetch', '--prune', 'origin');
  } catch {
    return currentHead;
  }
  const advertised = await optionalGit(
    repository,
    'ls-remote',
    '--symref',
    'origin',
    'HEAD',
  );
  const advertisedDefault = advertised?.match(
    /^ref: refs\/heads\/([^\s]+)\s+HEAD$/m,
  )?.[1];
  const remoteDefault = advertisedDefault
    ? `origin/${advertisedDefault}`
    : await optionalGit(
        repository,
        'symbolic-ref',
        '--short',
        'refs/remotes/origin/HEAD',
      );
  if (!remoteDefault?.startsWith('origin/')) return currentHead;
  const defaultBranch = remoteDefault.slice('origin/'.length);
  const remoteHead = await optionalGit(
    repository,
    'rev-parse',
    `refs/remotes/origin/${defaultBranch}`,
  );
  if (!remoteHead) return currentHead;
  const localHead = await optionalGit(
    repository,
    'rev-parse',
    `refs/heads/${defaultBranch}`,
  );
  if (!localHead || localHead === remoteHead) return remoteHead;
  if (await isAncestor(repository, localHead, remoteHead)) return remoteHead;
  if (await isAncestor(repository, remoteHead, localHead)) return localHead;
  throw new PublicApiError(
    'Local and remote default branches diverged. Reconcile them before starting a new Card.',
    409,
  );
}
async function regularDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Workspace ownership requires regular directories.');
}
async function sidecar(project: RegisteredProject, cardId: string) {
  return path.join(
    await realpath(project.planningPath),
    'implementation/cards',
    cardId,
    'workspace.json',
  );
}
async function save(
  project: RegisteredProject,
  cardId: string,
  workspace: CardWorkspace,
) {
  const file = await sidecar(project, cardId);
  if ((await realpath(path.dirname(file))) !== path.dirname(file))
    throw new Error('Linked Card store is not allowed.');
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(workspace), { flag: 'wx' });
  await rename(temp, file);
}
export async function verifyCardWorkspace(workspace: CardWorkspace) {
  await regularDirectory(workspace.path);
  const top = await git(workspace.path, 'rev-parse', '--show-toplevel');
  const common = await git(
    workspace.path,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  );
  if (
    (await realpath(top)) !== workspace.path ||
    (await realpath(common)) !== workspace.gitDirectory ||
    (await git(workspace.path, 'symbolic-ref', '--short', 'HEAD')) !==
      workspace.branch
  )
    throw new Error(
      'Card worktree identity changed. Restore its recorded branch and path before continuing.',
    );
  const repositoryCommon = await git(
    workspace.repository,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  );
  if ((await realpath(repositoryCommon)) !== workspace.gitDirectory)
    throw new Error('Card repository identity changed.');
}
async function create(
  project: RegisteredProject,
  cardId: string,
  repository: string,
  startCommit: string,
  cardBaseCommit = startCommit,
): Promise<CardWorkspace> {
  const generation = randomUUID().slice(0, 8);
  const branch = `praxis/card-${cardId}-${generation}`;
  const directory = path.join(
    path.dirname(repository),
    `.praxis-${path.basename(repository)}-${cardId}-${generation}`,
  );
  await git(
    repository,
    'worktree',
    'add',
    '-b',
    branch,
    directory,
    startCommit,
  );
  const workspace = {
    path: await realpath(directory),
    repository,
    baseCommit: cardBaseCommit,
    branch,
    gitDirectory: await realpath(
      await git(
        repository,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      ),
    ),
  };
  await verifyCardWorkspace(workspace);
  await save(project, cardId, workspace);
  return workspace;
}
export async function ensureCardWorkspace(
  project: RegisteredProject,
  card: PlanningCard,
  initializeRepository = false,
): Promise<CardWorkspace> {
  assertCardUuid(card.id);
  const file = await sidecar(project, card.id);
  let workspaceRecord: CardWorkspace | undefined;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('Invalid Card workspace record.');
    workspaceRecord = JSON.parse(await readFile(file, 'utf8')) as CardWorkspace;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (workspaceRecord) {
    if (
      workspaceRecord.repository !==
      (await realpath(project.codePath ?? project.rootPath))
    )
      throw new Error('Card workspace belongs to another repository.');
    if (
      card.execution?.workspace &&
      JSON.stringify(card.execution.workspace) !==
        JSON.stringify(workspaceRecord)
    )
      throw new Error('Card workspace record changed.');
    await verifyCardWorkspace(workspaceRecord);
    return workspaceRecord;
  }
  if (card.execution?.runs.length || card.execution?.workspace)
    throw new Error(
      'This Card has legacy or missing execution workspace state. Back up and reset it before starting a new worktree.',
    );
  const repository = await realpath(project.codePath ?? project.rootPath);
  let hasGit = false;
  try {
    await lstat(path.join(repository, '.git'));
    hasGit = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!hasGit) {
    const planning = await realpath(project.planningPath);
    const entries = (await readdir(repository)).filter(
      (name) => path.join(repository, name) !== planning,
    );
    if (project.kind !== 'standalone' || entries.length)
      throw new Error(
        'Initialize the existing project repository before starting Card execution. No existing files were changed.',
      );
    if (!initializeRepository)
      throw new PublicApiError(bootstrapRequired, 409, bootstrapRequired);
    await git(repository, 'init', '--initial-branch=main');
    await git(
      repository,
      '-c',
      'user.name=Praxis',
      '-c',
      'user.email=praxis@localhost',
      'commit',
      '--allow-empty',
      '-m',
      'Initialize empty local project baseline',
    );
    const exclude = path.join(repository, '.git/info/exclude');
    await writeFile(exclude, `${await readFile(exclude, 'utf8')}\n.praxis/\n`);
  }
  if (
    (await realpath(await git(repository, 'rev-parse', '--show-toplevel'))) !==
    repository
  )
    throw new Error('Registered code directory must be a repository root.');
  const base = await resolveCardBase(repository);
  return create(project, card.id, repository, base);
}
export function workspaceProject(
  project: RegisteredProject,
  workspace?: CardWorkspace,
): RegisteredProject {
  return workspace ? { ...project, codePath: workspace.path } : project;
}
export async function restartCardWorkspace(
  project: RegisteredProject,
  card: PlanningCard,
) {
  const workspace = card.execution?.workspace;
  if (!workspace) throw new Error('No Card worktree is available to reset.');
  return restartWorkspace(project, card, workspace.baseCommit);
}

export async function restartCardWorkspaceAt(
  project: RegisteredProject,
  card: PlanningCard,
  startCommit: string,
) {
  if (!/^[0-9a-f]{40,64}$/.test(startCommit))
    throw new Error('Invalid Action baseline commit.');
  return restartWorkspace(project, card, startCommit);
}

async function restartWorkspace(
  project: RegisteredProject,
  card: PlanningCard,
  startCommit: string,
) {
  const workspace = card.execution?.workspace;
  if (!workspace) throw new Error('No Card worktree is available to reset.');
  await verifyCardWorkspace(workspace);
  const head = await git(workspace.path, 'rev-parse', 'HEAD');
  if (head !== workspace.baseCommit) {
    let merged = false;
    try {
      await git(
        workspace.repository,
        'merge-base',
        '--is-ancestor',
        head,
        'HEAD',
      );
      merged = true;
    } catch (error) {
      if ((error as { code?: number }).code !== 1) throw error;
    }
    if (merged)
      throw new Error(
        'Card commits are already in the primary checkout history. Use the delivery revert workflow instead.',
      );
  }
  const backupPath = `${workspace.path}-backup-${randomUUID().slice(0, 8)}`;
  await git(
    workspace.repository,
    'worktree',
    'move',
    workspace.path,
    backupPath,
  );
  const archived = { ...workspace, path: backupPath };
  try {
    await save(project, card.id, archived);
    const fresh = await create(
      project,
      card.id,
      workspace.repository,
      startCommit,
      workspace.baseCommit,
    );
    return { workspace: fresh, backup: archived };
  } catch (error) {
    await git(
      workspace.repository,
      'worktree',
      'move',
      backupPath,
      workspace.path,
    );
    await save(project, card.id, workspace);
    throw error;
  }
}

export async function undoWorkspaceRestart(
  project: RegisteredProject,
  cardId: string,
  previous: CardWorkspace,
  current: CardWorkspace,
  backup: CardWorkspace,
  forceCurrent = false,
) {
  await verifyCardWorkspace(current);
  await git(
    current.repository,
    'worktree',
    'remove',
    ...(forceCurrent ? ['--force'] : []),
    current.path,
  );
  await git(
    previous.repository,
    'worktree',
    'move',
    backup.path,
    previous.path,
  );
  await save(project, cardId, previous);
  await git(
    current.repository,
    'branch',
    forceCurrent ? '-D' : '-d',
    current.branch,
  ).catch(() => undefined);
}

export async function cardGitWritePaths(workspace: CardWorkspace) {
  await verifyCardWorkspace(workspace);
  const common = workspace.gitDirectory;
  const admin = await realpath(
    await git(workspace.path, 'rev-parse', '--absolute-git-dir'),
  );
  if (!admin.startsWith(path.join(common, 'worktrees') + path.sep))
    throw new Error('Card Git metadata must belong to its linked worktree.');
  const ownRef = path.join(common, 'refs/heads', workspace.branch);
  const ownLog = path.join(common, 'logs/refs/heads', workspace.branch);
  return [
    admin,
    path.join(common, 'objects'),
    ownRef,
    `${ownRef}.lock`,
    ownLog,
    `${ownLog}.lock`,
    path.join(common, 'refs/remotes'),
    path.join(common, 'logs/refs/remotes'),
    path.join(common, 'FETCH_HEAD'),
    path.join(common, 'FETCH_HEAD.lock'),
    path.join(common, 'config'),
    path.join(common, 'config.lock'),
    path.join(common, 'info/exclude'),
  ];
}
