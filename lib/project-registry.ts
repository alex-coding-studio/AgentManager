import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

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

function expandHome(value: string) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

async function readRegistry() {
  try {
    return JSON.parse(await readFile(registryPath, 'utf8')) as Registry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyRegistry();
    }
    throw error;
  }
}

async function writeRegistry(registry: Registry) {
  await mkdir(managerHome, { recursive: true });
  const temporaryPath = `${registryPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`);
  await rename(temporaryPath, registryPath);
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
  return (await readRegistry()).projects;
}

export async function getProject(projectId: string) {
  return (
    (await listProjects()).find((project) => project.id === projectId) ?? null
  );
}

export async function createProject(input: {
  kind: ProjectKind;
  name: string;
  description: string;
  rootPath?: string;
}) {
  const registry = await readRegistry();
  if (!input.rootPath?.trim()) {
    throw new Error('A local project directory is required.');
  }
  const rootPath = path.resolve(expandHome(input.rootPath.trim()));
  const directory = await stat(rootPath).catch(() => null);
  if (!directory?.isDirectory()) {
    throw new Error('The project path must be an existing directory.');
  }
  if (registry.projects.some((project) => project.rootPath === rootPath)) {
    throw new Error('This project directory is already registered.');
  }

  const planningPath = path.join(rootPath, '.agent-manager');
  await mkdir(planningPath, { recursive: true });
  await ensureLocalGitExclusion(rootPath);
  const codePath = input.kind === 'repository' ? rootPath : null;

  const project: RegisteredProject = {
    id: randomUUID(),
    kind: input.kind,
    name: input.name,
    description: input.description,
    rootPath,
    codePath,
    planningPath,
    createdAt: new Date().toISOString(),
  };

  await writeFile(
    path.join(planningPath, 'project.json'),
    `${JSON.stringify({ schemaVersion: 1, ...project }, null, 2)}\n`,
  );
  registry.projects.unshift(project);
  await writeRegistry(registry);
  return project;
}
