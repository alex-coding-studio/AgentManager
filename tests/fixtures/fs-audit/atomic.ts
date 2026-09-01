import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
export async function publish(file: string, body: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, body, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
