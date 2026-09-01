import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function commit(directory: string) {
  await run('git', ['-C', directory, 'commit', '-m', 'fixture']);
}
