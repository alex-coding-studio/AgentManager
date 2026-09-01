import * as fsp from 'node:fs/promises';
export async function save(file: string) {
  await fsp.writeFile(file, 'namespaced');
}
