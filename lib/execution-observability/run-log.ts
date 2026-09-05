import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { redactRecord } from '../agents/activity.ts';
import {
  LOG_EVENT_PATTERN,
  formatRunLogLine,
  parseRunLogText,
  sanitizeLogMessage,
} from './run-log-format.ts';
import type { RunLogEntry, RunLogInput } from './types.ts';

export const RUN_LOG_RECENT_LIMIT = 300;
export const RUN_LOG_READ_LIMIT = 256 * 1024;

export type RunLogWriter = {
  file: string;
  sequence: () => number;
  recent: () => RunLogEntry[];
  append: (input: RunLogInput) => RunLogEntry;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export function runLogEntry(sequence: number, input: RunLogInput): RunLogEntry {
  if (!LOG_EVENT_PATTERN.test(input.event))
    throw new Error(`Invalid Run Log event: ${input.event}`);
  return {
    sequence,
    at: input.at ?? new Date().toISOString(),
    level: input.level,
    actor: input.actor,
    phase: input.phase,
    event: input.event,
    message: sanitizeLogMessage(redactRecord(input.message)) || '(no message)',
  };
}

function writer(
  file: string,
  sequence: number,
  recent: RunLogEntry[],
): RunLogWriter {
  let pending: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  let closed = false;
  return {
    file,
    sequence: () => sequence,
    recent: () => [...recent],
    append(input) {
      if (closed) throw new Error('The Run Log is closed.');
      const entry = runLogEntry(++sequence, input);
      recent.push(entry);
      if (recent.length > RUN_LOG_RECENT_LIMIT)
        recent.splice(0, recent.length - RUN_LOG_RECENT_LIMIT);
      pending = pending
        .then(() => appendFile(file, `${formatRunLogLine(entry)}\n`))
        .catch((error: unknown) => {
          failure ??= error;
        });
      return entry;
    },
    async flush() {
      await pending;
      if (failure) {
        const error = failure;
        failure = null;
        throw error;
      }
    },
    async close() {
      closed = true;
      await pending;
    },
  };
}

export async function createRunLog(file: string, first: RunLogInput) {
  await mkdir(path.dirname(file), { recursive: true });
  const entry = runLogEntry(1, first);
  await writeFile(file, `${formatRunLogLine(entry)}\n`, { flag: 'wx' });
  return writer(file, 1, [entry]);
}

export async function openRunLog(file: string) {
  const entries = parseRunLogText(await readFile(file, 'utf8'));
  const last = entries.at(-1)?.sequence ?? 0;
  return writer(file, last, entries.slice(-RUN_LOG_RECENT_LIMIT));
}

export async function readRunLogEntries(file: string) {
  return parseRunLogText(await readFile(file, 'utf8'));
}

export type RunLogSlice = {
  text: string;
  offset: number;
  next: number;
  size: number;
};

export async function readRunLogTail(
  file: string,
  offset = 0,
  maxBytes = RUN_LOG_READ_LIMIT,
): Promise<RunLogSlice> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = offset > size ? 0 : Math.max(0, offset);
    if (start >= size) return { text: '', offset: start, next: start, size };
    const length = Math.min(size - start, maxBytes);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    let end = bytesRead;
    if (start + bytesRead < size) {
      const newline = buffer.lastIndexOf(0x0a, bytesRead - 1);
      end = newline >= 0 ? newline + 1 : 0;
    }
    return {
      text: buffer.subarray(0, end).toString('utf8'),
      offset: start,
      next: start + end,
      size,
    };
  } finally {
    await handle.close();
  }
}
