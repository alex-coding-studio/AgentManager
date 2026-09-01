import { appendFile, rename, rm, writeFile } from 'node:fs/promises';
import trash from 'trash';

export async function publishRecord(a: string, b: string, c: string) {
  await writeFile(a, 'one', { flag: 'wx' });
  await writeFile(b, 'two');
  await appendFile(b, 'three');
  await rename(a, c);
  await rm(b, { force: true });
  await trash(c);
}

export async function writeOnce(a: string) {
  await writeFile(a, 'only');
}
