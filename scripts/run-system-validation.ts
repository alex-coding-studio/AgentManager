import { readFile } from 'node:fs/promises';
import {
  createSystemValidationFixPacket,
  runSystemValidation,
  type SystemValidationRequest,
} from '../lib/modules/implementation/system-validation-runner.ts';

const input = await requestInput<
  SystemValidationRequest & { existingRepairAttempts?: number }
>();
const result = await runSystemValidation(input);
process.stdout.write(
  `${JSON.stringify({
    result,
    optionalFixPacket: createSystemValidationFixPacket(
      result,
      input.existingRepairAttempts ?? 0,
    ),
  })}\n`,
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
