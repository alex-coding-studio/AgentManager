import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import {
  isModelId,
  reasoningEfforts,
  type LocalModel,
  type ModelCatalog,
} from './local-agent-model-types.ts';

type Agent = ModelCatalog['agent'];
type Launch = (agent: Agent, args: string[]) => ChildProcessWithoutNullStreams;

export function parseModels(agent: Agent, raw: unknown): LocalModel[] {
  if (!Array.isArray(raw)) throw new Error('Invalid model catalog.');
  const models = new Map<string, LocalModel>();
  for (const value of raw) {
    if (!value || typeof value !== 'object' || value.hidden === true) continue;
    const id = agent === 'codex' ? value.model : value.value;
    if (typeof id !== 'string' || !isModelId(id)) continue;
    const levels =
      agent === 'codex'
        ? value.supportedReasoningEfforts?.map(
            (item: { reasoningEffort?: string }) => item?.reasoningEffort,
          )
        : value.supportedEffortLevels;
    models.set(id, {
      id,
      name: typeof value.displayName === 'string' ? value.displayName : id,
      description:
        typeof value.description === 'string' ? value.description : '',
      efforts: reasoningEfforts.filter(
        (level) => Array.isArray(levels) && levels.includes(level),
      ),
    });
  }
  return [...models.values()];
}

const launch: Launch = (agent, args) => {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  return spawn(agent, args, {
    cwd: os.homedir(),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

export function readLocalModels(
  agent: Agent,
  start: Launch = launch,
  timeoutMs = 12000,
): Promise<ModelCatalog> {
  return new Promise((resolve, reject) => {
    const args =
      agent === 'codex'
        ? [
            'app-server',
            '--listen',
            'stdio://',
            '-c',
            'model_provider="openai"',
          ]
        : [
            '--print',
            '--safe-mode',
            '--restricted',
            '--tools',
            '',
            '--strict-mcp-config',
            '--no-session-persistence',
            '--input-format',
            'stream-json',
            '--output-format',
            'stream-json',
            '--verbose',
          ];
    const child = start(agent, args);
    let done = false;
    let buffer = '';
    let bytes = 0;
    let pageId = 2;
    const models = new Map<string, LocalModel>();
    const cursors = new Set<string>();
    const timer = setTimeout(
      () => finish(new Error('Model catalog timed out.')),
      timeoutMs,
    );
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill('SIGTERM');
      const force = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
      }, 1000);
      force.unref();
      child.once('exit', () => clearTimeout(force));
      if (error) reject(error);
      else resolve({ agent, models: [...models.values()] });
    };
    const send = (message: unknown) => {
      if (!done) child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    child.on('error', () => finish(new Error('Could not start local Agent.')));
    child.stdin.on('error', () =>
      finish(new Error('Could not read model catalog.')),
    );
    child.on('exit', () => {
      if (!done) finish(new Error('Agent exited before returning models.'));
    });
    child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (done) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2_000_000)
        return finish(new Error('Model catalog is too large.'));
      buffer += chunk;
      let newline;
      while (!done && (newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (agent === 'claude') {
            if (
              message.type !== 'control_response' ||
              message.response?.request_id !== 'catalog'
            )
              continue;
            if (message.response.subtype !== 'success')
              throw new Error('Agent rejected model discovery.');
            for (const model of parseModels(
              agent,
              message.response.response?.models,
            ))
              models.set(model.id, model);
            finish();
          } else if (message.id === 1) {
            if (message.error) throw new Error('Agent initialization failed.');
            send({ method: 'initialized', params: {} });
            send({
              id: pageId,
              method: 'model/list',
              params: { includeHidden: false, limit: 100 },
            });
          } else if (message.id === pageId) {
            if (message.error)
              throw new Error('Agent rejected model discovery.');
            for (const model of parseModels(agent, message.result?.data))
              models.set(model.id, model);
            const cursor = message.result?.nextCursor;
            if (!cursor) finish();
            else {
              if (
                typeof cursor !== 'string' ||
                cursors.has(cursor) ||
                cursors.size >= 10
              )
                throw new Error('Invalid model pagination.');
              cursors.add(cursor);
              send({
                id: ++pageId,
                method: 'model/list',
                params: { cursor, includeHidden: false, limit: 100 },
              });
            }
          }
        } catch {
          finish(new Error('Could not parse local model catalog.'));
        }
      }
    });
    send(
      agent === 'codex'
        ? {
            id: 1,
            method: 'initialize',
            params: {
              clientInfo: { name: 'agent_manager_models', version: '0.1.0' },
            },
          }
        : {
            type: 'control_request',
            request_id: 'catalog',
            request: { subtype: 'initialize' },
          },
    );
  });
}

export function createModelCatalogCache(
  read = readLocalModels,
  now = Date.now,
) {
  const entries = new Map<
    Agent,
    { expires: number; promise: Promise<ModelCatalog> }
  >();
  return (agent: Agent) => {
    const current = entries.get(agent);
    if (current && current.expires > now()) return current.promise;
    const entry = { expires: now() + 60000, promise: read(agent) };
    entries.set(agent, entry);
    void entry.promise.catch(() => {
      entry.expires = now() + 3000;
    });
    return entry.promise;
  };
}

export const getLocalModels = createModelCatalogCache();
