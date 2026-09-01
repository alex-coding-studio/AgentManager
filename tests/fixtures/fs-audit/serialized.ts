import { writeFile } from 'node:fs/promises';
const state = globalThis as typeof globalThis & {
  fixtureWrites?: Map<string, Promise<unknown>>;
};
const writes = (state.fixtureWrites ??= new Map());
export async function update(file: string, body: string) {
  const previous = writes.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeFile(file, body));
  writes.set(file, next);
  return next;
}
