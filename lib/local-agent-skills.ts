import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

export type LocalSkill = {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
};
export type SkillCatalog = { skills: LocalSkill[] };
type Launch = (cwd: string, args: string[]) => ChildProcessWithoutNullStreams;

const launch: Launch = (cwd, args) => {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  return spawn('codex', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
};

export function parseSkillCatalog(value: unknown, cwd: string): SkillCatalog {
  const data = (value as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) throw new Error('Invalid Skills catalog.');
  const entry = data.find((item) => (item as { cwd?: string })?.cwd === cwd) as
    | { skills?: unknown[]; errors?: unknown[] }
    | undefined;
  if (!entry || !Array.isArray(entry.skills) || !Array.isArray(entry.errors))
    throw new Error('Skills catalog did not include this project.');
  if (entry.errors.length)
    throw new Error(
      'Some installed Skills could not be loaded. Check the local Codex installation before retrying.',
    );
  const skills = entry.skills.map((item) => {
    const skill = item as LocalSkill;
    if (
      !skill ||
      typeof skill.name !== 'string' ||
      !skill.name ||
      typeof skill.description !== 'string' ||
      typeof skill.path !== 'string' ||
      !path.isAbsolute(skill.path) ||
      typeof skill.enabled !== 'boolean'
    )
      throw new Error('Invalid Skills catalog entry.');
    return {
      name: skill.name,
      description: skill.description,
      path: skill.path,
      enabled: skill.enabled,
    };
  });
  if (Buffer.byteLength(JSON.stringify(skills)) > 200000)
    throw new Error('Skills catalog is too large.');
  return { skills };
}

export function readCodexSkills(
  cwd: string,
  options: { signal?: AbortSignal; start?: Launch; timeoutMs?: number } = {},
): Promise<SkillCatalog> {
  if (options.signal?.aborted)
    return Promise.reject(new Error('Skills discovery canceled.'));
  return new Promise((resolve, reject) => {
    const child = (options.start ?? launch)(cwd, [
      'app-server',
      '--listen',
      'stdio://',
    ]);
    let done = false;
    let buffer = '';
    let bytes = 0;
    const finish = (error?: Error, result?: SkillCatalog) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      child.stdin.end();
      child.kill('SIGTERM');
      const force = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
      }, 1000);
      force.unref();
      child.once('exit', () => clearTimeout(force));
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(new Error('Skills discovery canceled.'));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Skills discovery timed out. No Agent execution was started.',
          ),
        ),
      options.timeoutMs ?? 15000,
    );
    const send = (message: unknown) =>
      child.stdin.write(`${JSON.stringify(message)}\n`);
    options.signal?.addEventListener('abort', cancel, { once: true });
    child.on('error', () =>
      finish(new Error('Could not start Codex Skills discovery.')),
    );
    child.stdin.on('error', () =>
      finish(new Error('Could not query Codex Skills.')),
    );
    child.on('exit', () => {
      if (!done) finish(new Error('Codex exited before returning Skills.'));
    });
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (done) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2000000)
        return finish(new Error('Skills catalog response is too large.'));
      buffer += chunk;
      let index;
      while (!done && (index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        try {
          const message = JSON.parse(line);
          if (message.id !== 1 && message.id !== 2) continue;
          if (message.error)
            throw new Error('Codex could not discover enabled Skills.');
          if (message.id === 1) {
            send({ method: 'initialized' });
            send({
              id: 2,
              method: 'skills/list',
              params: { cwds: [cwd], forceReload: true },
            });
          } else finish(undefined, parseSkillCatalog(message.result, cwd));
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error('Invalid Skills response.'),
          );
        }
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'agent_manager_skills', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

export function withSkillCatalog(prompt: string, catalog: SkillCatalog) {
  const available = catalog.skills
    .filter((skill) => skill.enabled)
    .map(({ name, description, path }) => ({ name, description, path }));
  return `${prompt}\n\n<available_skills>\nThe following catalog was discovered by the local Codex runtime for this project. These are available capabilities, not a request to invoke them. Select Skills only when requested or relevant to the current task. Read the selected SKILL.md and resolve its references relative to that file; do not guess installation paths or read every Skill. Listing a Skill does not enable any associated tools, hooks, or permissions. Existing stage and execution boundaries still apply. Report inaccessible Skills or unavailable dependencies instead of assuming they are installed or broadening access.\n${JSON.stringify(available)}\n</available_skills>`;
}
