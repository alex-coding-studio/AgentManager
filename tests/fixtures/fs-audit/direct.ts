import { writeFile, appendFile } from 'node:fs/promises';
export async function overwrite(file: string) {
  await writeFile(file, 'body');
}
export async function record(file: string) {
  await appendFile(file, 'line\n');
}
