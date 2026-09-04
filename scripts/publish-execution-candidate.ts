import {
  deliverCardCandidate,
  type CandidatePublishRequest,
} from '../lib/card-host-operations.ts';

let input = '';
for await (const chunk of process.stdin) input += String(chunk);
try {
  const result = await deliverCardCandidate(
    JSON.parse(input) as CandidatePublishRequest,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
