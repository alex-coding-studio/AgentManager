import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const modules = [
  'whats-next',
  'task-decomposition',
  'domain-model',
  'what-to-do',
];

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function readResponses(home) {
  const registry = await readJson(path.join(home, 'config.json'), {
    projects: [],
  });
  const result = [];
  for (const project of registry.projects) {
    const directories = modules.map((module) =>
      path.join(project.planningPath, module),
    );
    const cards = path.join(project.planningPath, 'implementation/cards');
    try {
      for (const entry of await readdir(cards, { withFileTypes: true })) {
        if (entry.isDirectory()) directories.push(path.join(cards, entry.name));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const directory of directories) {
      const response = await readJson(
        path.join(directory, 'latest-response.json'),
      );
      if (response)
        result.push({ ...response, key: directory, projectName: project.name });
    }
  }
  return result;
}

export function notificationTransitions(previous, responses, initialized) {
  const notifications = [];
  const next = new Map(previous);
  for (const response of responses) {
    const old = previous.get(response.key);
    const terminal = ['completed', 'warning', 'fail'].includes(response.status);
    const seen = old?.runId === response.runId && old.notified;
    const canceled = response.title === 'Canceled';
    if (
      initialized &&
      terminal &&
      !seen &&
      !canceled &&
      (old?.runId !== response.runId || old?.status === 'running')
    ) {
      notifications.push(response);
    }
    next.set(response.key, {
      runId: response.runId,
      status: response.status,
      notified: terminal || Boolean(seen),
    });
  }
  return { next, notifications };
}

export function localNavigation(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export class DesktopService {
  constructor(config, home, invoke = exec) {
    this.config = config;
    this.home = home;
    this.invoke = invoke;
    this.owned = null;
  }

  state() {
    return readJson(
      path.join(this.home, 'run', `praxis-${this.config.port}.json`),
    );
  }

  async command(command, ...args) {
    return this.invoke(
      this.config.node,
      [
        path.join(this.config.root, 'bin/praxis.mjs'),
        command,
        '--port',
        String(this.config.port),
        ...args,
      ],
      {
        cwd: this.config.root,
        env: { ...process.env, PRAXIS_HOME: this.home },
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
  }

  async start() {
    let stdout;
    try {
      ({ stdout } = await this.command('status'));
    } catch (error) {
      if (
        error.code !== 1 ||
        !error.stdout?.includes('No managed background Praxis server')
      )
        throw error;
      stdout = error.stdout;
    }
    const existing = await this.state();
    if (existing && /PID:/.test(stdout)) return 'connected';
    await this.command(this.config.mode, '-d', '--lan');
    this.owned = await this.state();
    if (!this.owned)
      throw new Error('Praxis started without a process record.');
    return 'started';
  }

  async stop() {
    if (!this.owned) return;
    const current = await this.state();
    if (!current) {
      this.owned = null;
      return;
    }
    if (
      current?.pid !== this.owned.pid ||
      current?.startMarker !== this.owned.startMarker
    ) {
      throw new Error(
        'The service was replaced outside this app; it has been left running.',
      );
    }
    await this.command('stop');
    this.owned = null;
  }
}
