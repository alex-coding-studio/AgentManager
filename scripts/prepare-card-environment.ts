import { readFile } from 'node:fs/promises';
import {
  prepareCardEnvironment,
  type PrepareCardEnvironmentRequest,
} from '../lib/card-host-operations.ts';

const input = await requestInput<PrepareCardEnvironmentRequest>();
process.stdout.write(
  `${JSON.stringify(await prepareCardEnvironment(input))}\n`,
);

async function requestInput<T>() {
  const text = process.argv[2]
    ? await readFile(process.argv[2], 'utf8')
    : await stdin();
  return JSON.parse(text) as T;
}

async function stdin() {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}
