import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createJsonStore } from './atomic-json-store.ts';

export type ProjectKind = 'standalone' | 'repository';

export type RegisteredProject = {
  id: string;
  kind: ProjectKind;
  name: string;
  description: string;
  rootPath: string;
  codePath: string | null;
  planningPath: string;
  createdAt: string;
};

type Registry = {
  schemaVersion: 1;
  projects: RegisteredProject[];
};

const managerHome = process.env.AGENT_MANAGER_HOME
  ? path.resolve(process.env.AGENT_MANAGER_HOME)
  : path.join(homedir(), '.agent-manager');
const registryPath = path.join(managerHome, 'config.json');

function emptyRegistry(): Registry {
  return { schemaVersion: 1, projects: [] };
}

const registryStore = createJsonStore<Registry>(registryPath, emptyRegistry);

function expandHome(value: string) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

async function ensureLocalGitExclusion(codePath: string) {
  let excludePath: string;
  try {
    excludePath = execFileSync(
      'git',
      ['-C', codePath, 'rev-parse', '--git-path', 'info/exclude'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return;
  }
  if (!path.isAbsolute(excludePath)) {
    excludePath = path.resolve(codePath, excludePath);
  }
  const current = await readFile(excludePath, 'utf8').catch(() => '');
  const entries = current.split(/\r?\n/).map((entry) => entry.trim());
  if (!entries.includes('.agent-manager/')) {
    const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    await appendFile(excludePath, `${prefix}.agent-manager/\n`);
  }
}

export async function listProjects() {
  return (await registryStore.read()).projects;
}

export async function getProject(projectId: string) {
  return (
    (await listProjects()).find((project) => project.id === projectId) ?? null
  );
}

export function getGitHubRepositoryUrl(project: RegisteredProject) {
  const directory = project.codePath ?? project.rootPath;
  let remoteUrl: string;
  try {
    const top = execFileSync(
      'git',
      ['-C', directory, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (realpathSync(top) !== realpathSync(directory)) return null;
    remoteUrl = execFileSync(
      'git',
      ['-C', directory, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return null;
  }

  const scpMatch = remoteUrl.match(
    /^git@github\.com:([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/,
  );
  if (scpMatch) return `https://github.com/${scpMatch[1]}`;

  try {
    const url = new URL(remoteUrl);
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const repositoryPath = url.pathname
      .replace(/^\//, '')
      .replace(/\.git$/, '')
      .replace(/\/$/, '');
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repositoryPath)) {
      return null;
    }
    return `https://github.com/${repositoryPath}`;
  } catch {
    return null;
  }
}

export async function createProject(input: {
  kind: ProjectKind;
  name: string;
  description: string;
  rootPath?: string;
}) {
  if (!input.rootPath?.trim()) {
    throw new Error('A local project directory is required.');
  }
  const rootPath = path.resolve(expandHome(input.rootPath.trim()));
  const directory = await stat(rootPath).catch(() => null);
  if (!directory?.isDirectory()) {
    throw new Error('The project path must be an existing directory.');
  }

  return registryStore.update<RegisteredProject>(async (registry) => {
    if (registry.projects.some((project) => project.rootPath === rootPath)) {
      throw new Error('This project directory is already registered.');
    }

    const planningPath = path.join(rootPath, '.agent-manager');
    const project: RegisteredProject = {
      id: randomUUID(),
      kind: input.kind,
      name: input.name,
      description: input.description,
      rootPath,
      codePath: input.kind === 'repository' ? rootPath : null,
      planningPath,
      createdAt: new Date().toISOString(),
    };
    const projectFile = path.join(planningPath, 'project.json');

    await mkdir(planningPath, { recursive: true });
    await ensureLocalGitExclusion(rootPath);
    await writeFile(
      projectFile,
      `${JSON.stringify({ schemaVersion: 1, ...project }, null, 2)}\n`,
    );

    return {
      next: { ...registry, projects: [project, ...registry.projects] },
      result: project,
      rollback: () => rm(projectFile, { force: true }),
    };
  });
}
