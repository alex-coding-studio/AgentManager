import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  CandidatePublication,
  CandidatePublishRequest,
} from '../card-host-operations.ts';

export function runCandidatePublicationScript(
  request: CandidatePublishRequest,
): Promise<CandidatePublication> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        path.join(process.cwd(), 'scripts/publish-execution-candidate.ts'),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      errorOutput = (errorOutput + String(chunk)).slice(-16000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(errorOutput.trim() || 'Candidate publication failed.'),
        );
        return;
      }
      try {
        resolve(JSON.parse(output) as CandidatePublication);
      } catch {
        reject(new Error('Candidate publication returned an invalid result.'));
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(request));
  });
}
