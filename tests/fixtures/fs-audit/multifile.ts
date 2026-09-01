import { writeFile } from 'node:fs/promises';
export async function publishRecord(a: string, b: string) {
  await writeFile(a, 'one');
  await writeFile(b, 'two');
}
