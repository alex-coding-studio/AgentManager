import { writeFile as persist, readFile as load } from 'node:fs/promises';
export async function save(file: string) {
  await persist(file, 'aliased');
  return load(file, 'utf8');
}
