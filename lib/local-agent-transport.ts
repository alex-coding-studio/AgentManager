import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

export type LocalAgentKind = 'codex' | 'claude';

export type LocalAgentUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type LocalAgentResult = {
  agentSessionId: string | null;
  finalOutput: string;
  usage: LocalAgentUsage | null;
};

export type LocalAgentRun = {
  completion: Promise<LocalAgentResult>;
  cancel: () => void;
};

type LocalAgentRunInput = {
  workingDirectory: string;
  prompt: string;
  resumeSessionId?: string;
};

type CodexEvent =
  | { type: 'thread.started'; thread_id: string }
  | {
      type: 'item.completed';
      item: { type: string; text?: string };
    }
  | {
      type: 'turn.completed';
      usage?: {
        input_tokens?: number;
        cached_input_tokens?: number;
        cache_write_input_tokens?: number;
        output_tokens?: number;
        reasoning_output_tokens?: number;
      };
    }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string };

type ClaudeEvent =
  | { type: 'system'; subtype: string; session_id?: string }
  | {
      type: 'result';
      subtype: string;
      is_error?: boolean;
      result?: string;
      session_id?: string;
      usage?: {
        input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
        output_tokens?: number;
        output_tokens_details?: { thinking_tokens?: number };
      };
    }
  | { type: string };

export function startLocalAgentRun(
  agent: LocalAgentKind,
  input: LocalAgentRunInput,
): LocalAgentRun {
  return agent === 'claude' ? startClaudeRun(input) : startCodexRun(input);
}

export function parseLocalAgentEvent(line: string): unknown {
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function parseCodexEvent(line: string): CodexEvent | null {
  return parseLocalAgentEvent(line) as CodexEvent | null;
}

export function parseClaudeEvent(line: string): ClaudeEvent | null {
  return parseLocalAgentEvent(line) as ClaudeEvent | null;
}

function startCodexRun(input: LocalAgentRunInput): LocalAgentRun {
  const child = spawnCodex(input.workingDirectory, input.resumeSessionId);
  child.stdin.end(input.prompt);
  return trackLocalAgentRun(child, consumeCodexRun);
}

function startClaudeRun(input: LocalAgentRunInput): LocalAgentRun {
  const child = spawnClaude(input.workingDirectory, input.resumeSessionId);
  child.stdin.end(input.prompt);
  return trackLocalAgentRun(child, consumeClaudeRun);
}

function trackLocalAgentRun(
  child: ChildProcessWithoutNullStreams,
  consume: (
    child: ChildProcessWithoutNullStreams,
    wasCanceled: () => boolean,
  ) => Promise<LocalAgentResult>,
): LocalAgentRun {
  let canceled = false;
  const completion = consume(child, () => canceled);

  return {
    completion,
    cancel: () => {
      if (canceled || child.exitCode !== null) return;
      canceled = true;
      child.kill('SIGTERM');
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 2_000);
      forceTimer.unref();
    },
  };
}

function spawnCodex(workingDirectory: string, resumeSessionId?: string) {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;

  const arguments_ = resumeSessionId
    ? [
        'exec',
        'resume',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--json',
        resumeSessionId,
        '-',
      ]
    : [
        'exec',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--json',
        '-C',
        workingDirectory,
        '-',
      ];
  return spawn('codex', arguments_, {
    cwd: workingDirectory,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export function buildClaudeArguments(resumeSessionId?: string) {
  return [
    '--print',
    '--safe-mode',
    '--restricted',
    '--tools',
    'Read,Glob,Grep',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
  ];
}

function spawnClaude(workingDirectory: string, resumeSessionId?: string) {
  const environment = { ...process.env };
  delete environment.ANTHROPIC_API_KEY;

  return spawn('claude', buildClaudeArguments(resumeSessionId), {
    cwd: workingDirectory,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function consumeCodexRun(
  child: ChildProcessWithoutNullStreams,
  wasCanceled: () => boolean,
) {
  let agentSessionId: string | null = null;
  let finalOutput = '';
  let usage: LocalAgentUsage | null = null;
  let reportedError = '';
  const stderr = collectStderr(child);
  const exit = watchExit(child);

  const lines = readline.createInterface({ input: child.stdout });
  for await (const line of lines) {
    const event = parseCodexEvent(line);
    if (!event) continue;
    if (event.type === 'thread.started') {
      agentSessionId = event.thread_id;
    } else if (
      event.type === 'item.completed' &&
      event.item.type === 'agent_message' &&
      typeof event.item.text === 'string'
    ) {
      finalOutput = event.item.text;
    } else if (event.type === 'turn.completed') {
      usage = normalizeCodexUsage(event.usage);
    } else if (event.type === 'turn.failed') {
      reportedError = event.error?.message ?? 'The Codex turn failed.';
    } else if (event.type === 'error') {
      reportedError = event.message ?? 'Codex reported an error.';
    }
  }

  const exitCode = await exit;
  if (wasCanceled()) throw new Error('The Agent Run was canceled.');
  if (exitCode !== 0 || reportedError) {
    throw new Error(
      reportedError || stderr.read().trim() || 'Codex did not complete.',
    );
  }
  if (!finalOutput) throw new Error('Codex returned no final output.');
  return { agentSessionId, finalOutput, usage };
}

async function consumeClaudeRun(
  child: ChildProcessWithoutNullStreams,
  wasCanceled: () => boolean,
) {
  let agentSessionId: string | null = null;
  let finalOutput = '';
  let usage: LocalAgentUsage | null = null;
  let reportedError = '';
  const stderr = collectStderr(child);
  const exit = watchExit(child);

  const lines = readline.createInterface({ input: child.stdout });
  for await (const line of lines) {
    const event = parseClaudeEvent(line);
    if (!event) continue;
    if (
      event.type === 'system' &&
      'subtype' in event &&
      event.subtype === 'init' &&
      typeof event.session_id === 'string'
    ) {
      agentSessionId = event.session_id;
    } else if (event.type === 'result' && 'subtype' in event) {
      usage = normalizeClaudeUsage(event.usage);
      if (event.is_error || event.subtype !== 'success') {
        reportedError =
          typeof event.result === 'string' && event.result
            ? event.result
            : `Claude ended the turn with ${event.subtype}.`;
      } else if (typeof event.result === 'string') {
        finalOutput = event.result;
      }
    }
  }

  const exitCode = await exit;
  if (wasCanceled()) throw new Error('The Agent Run was canceled.');
  if (exitCode !== 0 || reportedError) {
    throw new Error(
      reportedError || stderr.read().trim() || 'Claude did not complete.',
    );
  }
  if (!finalOutput) throw new Error('Claude returned no final output.');
  return { agentSessionId, finalOutput, usage };
}

function collectStderr(child: ChildProcessWithoutNullStreams) {
  let buffered = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    buffered = `${buffered}${chunk}`.slice(-4_000);
  });
  return { read: () => buffered };
}

function watchExit(child: ChildProcessWithoutNullStreams) {
  return new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
}

function normalizeCodexUsage(
  usage: Extract<CodexEvent, { type: 'turn.completed' }>['usage'],
): LocalAgentUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.cached_input_tokens ?? 0,
    cacheWriteInputTokens: usage.cache_write_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningOutputTokens: usage.reasoning_output_tokens ?? 0,
  };
}

export function normalizeClaudeUsage(
  usage: Extract<ClaudeEvent, { type: 'result' }>['usage'],
): LocalAgentUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteInputTokens: usage.cache_creation_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningOutputTokens: usage.output_tokens_details?.thinking_tokens ?? 0,
  };
}
