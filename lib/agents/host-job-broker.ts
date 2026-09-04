import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rename, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type HostJobRequest = {
  label: string;
  executable: string;
  arguments: string[];
  workingDirectory: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
};
export type HostJobEvent = {
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  label: string;
  command: string;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  logRef: string;
};
export type HostJob = {
  id: string;
  completion: Promise<HostJobEvent>;
  cancel: () => void;
};
export type HostJobProgress = {
  jobId: string;
  label: string;
  outputTail: string;
};

export function hostJobCompletionPrompt(result: HostJobEvent) {
  const evidence =
    result.status === 'completed' && result.exitCode === 0
      ? "When the assignment defines the exit status as the result, cite this event's jobId, status, exitCode, signal and logRef directly without opening or copying the log. Continue immediately with separately assigned work outside this command, or return when none remains."
      : 'The job did not complete successfully. Inspect logRef only when needed to report the original failure; do not diagnose, modify, or rerun the command unless the assignment explicitly requires it.';
  return `HOST_JOB_COMPLETED\n${JSON.stringify(result)}\nThe Host ran this command exactly once. Do not rerun it merely to obtain the result. ${evidence} If another long command is actually required, use run_job once and let Praxis suspend and resume the session again.`;
}

export class HostJobBroker {
  private active = new Map<string, ChildProcess>();
  private workspaceRoot: string;
  private recordRoot: string;
  private onEvent?: (event: HostJobEvent) => void;
  private onProgress?: (progress: HostJobProgress) => void;
  constructor(
    workspaceRoot: string,
    recordRoot: string,
    onEvent?: (event: HostJobEvent) => void,
    onProgress?: (progress: HostJobProgress) => void,
  ) {
    this.workspaceRoot = workspaceRoot;
    this.recordRoot = recordRoot;
    this.onEvent = onEvent;
    this.onProgress = onProgress;
  }
  async run(request: HostJobRequest): Promise<HostJob> {
    const workspaceRoot = await realpath(this.workspaceRoot);
    const workingDirectory = await realpath(request.workingDirectory);
    const relative = path.relative(workspaceRoot, workingDirectory);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('Background job must run inside the Card workspace.');
    if (!request.label.trim() || !request.executable.trim())
      throw new Error('Background job requires a label and executable.');
    const id = randomUUID();
    const directory = path.join(this.recordRoot, id);
    await mkdir(directory, { recursive: true });
    const logRef = path.join(directory, 'output.log');
    const startedAt = new Date().toISOString();
    const command = [request.executable, ...request.arguments].join(' ');
    const child = spawn(request.executable, request.arguments, {
      cwd: workingDirectory,
      env: { ...process.env, ...request.environment },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.active.set(id, child);
    let output = '';
    let lastProgressAt = 0;
    const capture = (chunk: Buffer) => {
      const text = chunk.toString();
      output = `${output}${text}`.slice(-2_000_000);
      const now = Date.now();
      if (now - lastProgressAt >= 500) {
        lastProgressAt = now;
        const outputTail = text.trim().split('\n').at(-1)?.slice(-600) ?? '';
        if (outputTail)
          this.onProgress?.({ jobId: id, label: request.label, outputTail });
      }
    };
    child.stdout!.on('data', capture);
    child.stderr!.on('data', capture);
    child.on('error', (error) => capture(Buffer.from(error.message)));
    const running = {
      jobId: id,
      status: 'running' as const,
      label: request.label,
      command,
      startedAt,
      endedAt: null,
      exitCode: null,
      signal: null,
      logRef,
    };
    await this.persist(directory, running);
    this.onEvent?.(running);
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completion = new Promise<HostJobEvent>((resolve) => {
      if (request.timeoutMs)
        timer = setTimeout(() => {
          canceled = true;
          this.terminate(child);
        }, request.timeoutMs);
      child.on('close', async (code, signal) => {
        if (timer) clearTimeout(timer);
        this.active.delete(id);
        await writeFile(logRef, output);
        const event = {
          ...running,
          status: canceled
            ? ('canceled' as const)
            : code === 0
              ? ('completed' as const)
              : ('failed' as const),
          endedAt: new Date().toISOString(),
          exitCode: code,
          signal,
        };
        await this.persist(directory, event);
        this.onEvent?.(event);
        resolve(event);
      });
    });
    return {
      id,
      completion,
      cancel: () => {
        canceled = true;
        this.terminate(child);
      },
    };
  }
  cancelAll() {
    for (const child of this.active.values()) this.terminate(child);
  }
  private terminate(child: ChildProcess) {
    try {
      if (child.pid && process.platform !== 'win32')
        process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch {}
  }
  private async persist(directory: string, event: HostJobEvent) {
    const target = path.join(directory, 'job.json');
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(event));
    await rename(temporary, target);
  }
}
