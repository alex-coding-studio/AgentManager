import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Context } from '@deepseek-ai/cordis';
import { deepseekEffort } from './models.ts';
import type { ReasoningEffort } from '../model-types.ts';

const require = createRequire(import.meta.url);

export type DeepseekTurnInput = {
  prompt: string;
  model?: string;
  effort?: '' | ReasoningEffort;
  resumeSessionId?: string;
  workingDirectory: string;
};

export type DeepseekTurnResult = {
  sessionId: string | null;
  finalOutput: string;
};

type DeepseekRuntime = {
  runTurn(
    input: DeepseekTurnInput,
    signal?: AbortSignal,
  ): Promise<DeepseekTurnResult>;
  close(): Promise<void>;
};

type DshAgent = {
  session: { id: unknown; seq: number; events: readonly unknown[] };
  whenIdle: () => Promise<void>;
  followup: (message: unknown) => void;
  cancel: (cause: { kind: 'user' }) => void;
};

type DshAgentHandle = { agent: DshAgent; dispose: () => Promise<void> };

export type DshModules = {
  boot: (
    name: string,
    configPath: string,
    patches: unknown[],
    prepare: undefined,
    baseUrl: string,
  ) => Promise<{
    fiber: { dispose: () => Promise<void> };
    get: (name: string) => unknown;
  }>;
  loadOverlayPatches: (name: string, file: string) => unknown[];
  SessionId: (id: string) => unknown;
  createUserMessage: (message: unknown) => unknown;
  ReasoningEffortId: (effort: string) => unknown;
  installModelSelection: (ctx: unknown, selection: unknown) => unknown;
};

const DISABLED_TOOL_ROWS = [
  'tool-bash',
  'tool-pwsh',
  'tool-jobs',
  'tool-fs',
  'tool-fs-search',
  'tool-skill',
  'tool-todo',
  'tool-goal',
  'tool-str-replace-editor',
  'tool-web',
  'tool-subagent',
  'tool-subagent-fork',
  'tool-subagent-control',
  'tool-subagent-list-agents',
  'tool-subagent-report',
  'tool-workflow',
  'tool-ralph',
];

export function buildDeepseekPatches(
  basePatches: unknown[],
  workingDirectory: string,
): unknown[] {
  return [
    ...basePatches,
    { id: 'hmr', disabled: true },
    {
      id: 'sandbox-policy',
      config: { mode: 'read-only', workspaceRoot: workingDirectory },
    },
    ...DISABLED_TOOL_ROWS.map((id) => ({ id, disabled: true })),
  ];
}

export async function renderDeepseekContext(workingDirectory: string) {
  const root = await realpath(workingDirectory);
  const indexPath = join(root, 'index.json');
  const indexInfo = await lstat(indexPath);
  if (
    !indexInfo.isFile() ||
    indexInfo.isSymbolicLink() ||
    indexInfo.size > 1_000_000
  )
    throw new Error('DeepSeek requires a valid frozen Context index.');
  const manifest = JSON.parse(await readFile(indexPath, 'utf8')) as {
    schemaVersion?: unknown;
    primary?: Array<{ logicalPath?: unknown; workspacePath?: unknown }>;
    related?: Array<{ logicalPath?: unknown; workspacePath?: unknown }>;
  };
  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.primary) ||
    !Array.isArray(manifest.related)
  )
    throw new Error('DeepSeek requires a valid frozen Context index.');
  const entries = [...manifest.primary, ...manifest.related];
  if (entries.length > 200)
    throw new Error('DeepSeek Context contains too many files.');
  let total = 0;
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      typeof entry.logicalPath !== 'string' ||
      typeof entry.workspacePath !== 'string' ||
      !entry.logicalPath ||
      !entry.workspacePath ||
      /[\r\n]/.test(entry.logicalPath) ||
      isAbsolute(entry.workspacePath) ||
      entry.workspacePath.split(/[\\/]/).includes('..')
    )
      throw new Error('DeepSeek Context contains an invalid file reference.');
    const requestedFile = join(root, entry.workspacePath);
    const info = await lstat(requestedFile);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error('DeepSeek Context entry is not a regular file.');
    const file = await realpath(requestedFile);
    const fromRoot = relative(root, file);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`))
      throw new Error('DeepSeek Context file escapes its frozen workspace.');
    if (seen.has(file)) continue;
    seen.add(file);
    total += info.size;
    if (total > 2_097_152)
      throw new Error('DeepSeek Context exceeds the size limit.');
    blocks.push(`## ${entry.logicalPath}\n\n${await readFile(file, 'utf8')}\n`);
  }
  return `\n\nFROZEN CONTEXT FILES\n\n${blocks.join('\n')}`;
}

function findNodeModules(start: string): string {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (dir.endsWith('node_modules')) return dir;
    dir = dirname(dir);
  }
  throw new Error('DeepSeek runtime could not locate node_modules.');
}

async function loadDshModules(): Promise<DshModules> {
  const appBoot = await import('@deepseek-ai/dsh-app-boot');
  const session = await import('@deepseek-ai/dsh-session');
  const llm = await import('@deepseek-ai/dsh-llm');
  const agent = await import('@deepseek-ai/dsh-agent');
  return {
    boot: appBoot.boot as unknown as DshModules['boot'],
    loadOverlayPatches:
      appBoot.loadOverlayPatches as unknown as DshModules['loadOverlayPatches'],
    SessionId: session.SessionId as unknown as DshModules['SessionId'],
    createUserMessage:
      llm.createUserMessage as unknown as DshModules['createUserMessage'],
    ReasoningEffortId:
      llm.ReasoningEffortId as unknown as DshModules['ReasoningEffortId'],
    installModelSelection:
      agent.installModelSelection as unknown as DshModules['installModelSelection'],
  };
}

export async function bootRuntime(
  workingDirectory: string,
  load: () => Promise<DshModules> = loadDshModules,
): Promise<DeepseekRuntime> {
  const dsh = await load();
  const patchFile = require.resolve(
    ['@deepseek-ai', 'dsh-base', 'cordis.patch.yml'].join('/'),
  );
  const patches = buildDeepseekPatches(
    dsh.loadOverlayPatches('praxis', patchFile),
    workingDirectory,
  );
  const baseUrl = pathToFileURL(
    join(findNodeModules(dirname(patchFile)), '/'),
  ).href;

  const configDir = await mkdtemp(join(tmpdir(), 'praxis-dsh-'));
  const configPath = join(configDir, 'cordis.yml');
  await writeFile(configPath, '[]\n');

  let ctx: Awaited<ReturnType<DshModules['boot']>>;
  try {
    ctx = await dsh.boot('praxis', configPath, patches, undefined, baseUrl);
  } catch (error) {
    await rm(configDir, { recursive: true, force: true });
    throw error;
  }
  const agents = ctx.get('agents') as
    | {
        create: (options: unknown) => Promise<DshAgentHandle>;
        resume: (options: unknown) => Promise<DshAgentHandle>;
      }
    | undefined;
  const sessions = ctx.get('sessions') as
    | { flush: (session: unknown) => Promise<unknown> }
    | undefined;
  if (agents === undefined || sessions === undefined) {
    await ctx.fiber.dispose();
    await rm(configDir, { recursive: true, force: true });
    throw new Error('DeepSeek runtime booted without its Agent services.');
  }

  return {
    async runTurn(input, signal) {
      const provider = 'deepseek-official';
      const model = input.model || 'deepseek-v4-flash';
      const effort = deepseekEffort(input.effort ?? '');
      const selection = {
        provider,
        model,
        ...(effort === undefined
          ? {}
          : { reasoningEffort: dsh.ReasoningEffortId(effort) }),
      };
      const setup = (agentCtx: Context) => {
        dsh.installModelSelection(agentCtx, {
          current: selection,
          assembled: undefined,
        });
      };
      const handle = input.resumeSessionId
        ? await agents.resume({
            resumeSessionId: dsh.SessionId(input.resumeSessionId),
            agentOptions: { provider, model },
            setup,
          })
        : await agents.create({
            sessionId: dsh.SessionId(`session-${randomUUID()}`),
            meta: { cwd: input.workingDirectory },
            agentOptions: { provider, model },
            setup,
          });
      const { agent } = handle;
      const cancel = () => agent.cancel({ kind: 'user' });
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
      try {
        await agent.whenIdle();
        if (signal?.aborted) throw new Error('The Agent Run was canceled.');
        const firstSeq = agent.session.seq;
        agent.followup(
          dsh.createUserMessage({
            content: [{ type: 'text', text: input.prompt }],
            source: { kind: 'user' },
          }),
        );
        await agent.whenIdle();
        if (signal?.aborted) throw new Error('The Agent Run was canceled.');
        await sessions.flush(agent.session);
        return {
          sessionId: String(agent.session.id),
          finalOutput: summarize(agent.session.events, firstSeq),
        };
      } finally {
        signal?.removeEventListener('abort', cancel);
        await handle.dispose();
      }
    },
    async close() {
      await ctx.fiber.dispose();
      await rm(configDir, { recursive: true, force: true });
    },
  };
}

export function summarize(
  events: readonly unknown[],
  firstSeq: number,
): string {
  let started = false;
  let text = '';
  for (const raw of events) {
    const event = raw as {
      seq?: number;
      type?: string;
      data?: {
        message?: { content?: Array<{ type?: string; text?: string }> };
      };
    };
    if ((event.seq ?? 0) < firstSeq) continue;
    if (event.type === 'turn/start') {
      started = true;
      continue;
    }
    if (!started) continue;
    if (event.type === 'assistant/message') {
      const joined = (event.data?.message?.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      if (joined !== '') text = joined;
    }
  }
  return text;
}
