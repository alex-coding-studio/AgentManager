import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = globalThis as typeof globalThis & {
  atomicJsonStoreWrites?: Map<string, Promise<unknown>>;
};
const writes = (state.atomicJsonStoreWrites ??= new Map());

export class StoreConsistencyError extends Error {
  readonly writeError: unknown;
  readonly rollbackError: unknown;
  constructor(writeError: unknown, rollbackError: unknown) {
    super(
      `The store write failed and restoring the previous state also failed. Write: ${describe(writeError)}. Restore: ${describe(rollbackError)}.`,
    );
    this.name = 'StoreConsistencyError';
    this.writeError = writeError;
    this.rollbackError = rollbackError;
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function writeFileAtomically(
  file: string,
  contents: string | Uint8Array,
) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: 'wx' });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

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
    await writeFileAtomically(file, `${JSON.stringify(value, null, 2)}\n`);
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
          if (rollback) {
            try {
              await rollback();
            } catch (rollbackError) {
              throw new StoreConsistencyError(error, rollbackError);
            }
          }
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
