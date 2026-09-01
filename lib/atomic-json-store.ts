import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = globalThis as typeof globalThis & {
  atomicJsonStoreWrites?: Map<string, Promise<unknown>>;
};
const writes = (state.atomicJsonStoreWrites ??= new Map());

export type StoreMutation<T, R> = {
  next: T;
  result: R;
  rollback?: () => Promise<unknown>;
};

export type JsonStore<T> = {
  read: () => Promise<T>;
  update: <R>(
    mutate: (current: T) => Promise<StoreMutation<T, R>>,
  ) => Promise<R>;
};

export function createJsonStore<T>(
  file: string,
  fallback: () => T,
  revive: (value: unknown) => T = (value) => value as T,
): JsonStore<T> {
  async function read() {
    try {
      return revive(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback();
      throw error;
    }
  }

  async function write(value: T) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
    });
    await rename(temporary, file);
  }

  async function update<R>(
    mutate: (current: T) => Promise<StoreMutation<T, R>>,
  ) {
    const previous = writes.get(file) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(async () => {
        const { next, result, rollback } = await mutate(await read());
        try {
          await write(next);
        } catch (error) {
          await rollback?.().catch(() => undefined);
          throw error;
        }
        return result;
      });
    writes.set(file, pending);
    try {
      return (await pending) as R;
    } finally {
      if (writes.get(file) === pending) writes.delete(file);
    }
  }

  return { read, update };
}
