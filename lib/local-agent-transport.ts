import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

export type LocalAgentUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type LocalAgentResult = {
  threadId: string | null;
  finalOutput: string;
  usage: LocalAgentUsage | null;
};

export type LocalAgentRun = {
  completion: Promise<LocalAgentResult>;
  cancel: () => void;
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

export function startCodexRun(input: {
  workingDirectory: string;
  prompt: string;
  resumeThreadId?: string;
}): LocalAgentRun {
  const child = spawnCodex(input.workingDirectory, input.resumeThreadId);
  child.stdin.end(input.prompt);

  let canceled = false;
  const completion = consumeCodexRun(child, () => canceled);

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

export function parseCodexEvent(line: string): CodexEvent | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    return value as CodexEvent;
  } catch {
    return null;
  }
}

function spawnCodex(workingDirectory: string, resumeThreadId?: string) {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;

  const arguments_ = resumeThreadId
    ? [
        'exec',
        'resume',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--json',
        resumeThreadId,
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
  return spawn(
    'codex',
    arguments_,
    {
      cwd: workingDirectory,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
}

async function consumeCodexRun(
  child: ChildProcessWithoutNullStreams,
  wasCanceled: () => boolean,
) {
  let threadId: string | null = null;
  let finalOutput = '';
  let usage: LocalAgentUsage | null = null;
  let reportedError = '';
  let stderr = '';
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });

  const lines = readline.createInterface({ input: child.stdout });
  for await (const line of lines) {
    const event = parseCodexEvent(line);
    if (!event) continue;
    if (event.type === 'thread.started') {
      threadId = event.thread_id;
    } else if (
      event.type === 'item.completed' &&
      event.item.type === 'agent_message' &&
      typeof event.item.text === 'string'
    ) {
      finalOutput = event.item.text;
    } else if (event.type === 'turn.completed') {
      usage = normalizeUsage(event.usage);
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
      reportedError || stderr.trim() || 'Codex did not complete.',
    );
  }
  if (!finalOutput) throw new Error('Codex returned no final output.');
  return { threadId, finalOutput, usage };
}

function normalizeUsage(
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
