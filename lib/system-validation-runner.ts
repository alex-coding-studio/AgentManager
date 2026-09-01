import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { HostJobBroker } from './host-job-broker.ts';

const exec = promisify(execFile);

export type SystemValidationProfile = {
  id: string;
  executable: string;
  arguments: string[];
  blocking: boolean;
  resource: string;
  testIds?: string[];
};

export type SystemValidationRequest = {
  projectId: string;
  cardId: string;
  candidateSha: string;
  workspace: string;
  cacheRoot: string;
  environmentFingerprint: string;
  profile: SystemValidationProfile;
};

export type SystemValidationResult = {
  version: 1;
  runId: string;
  cacheKey: string;
  projectId: string;
  cardId: string;
  candidateSha: string;
  environmentFingerprint: string;
  profile: SystemValidationProfile;
  status: 'passed' | 'failed' | 'canceled';
  blocking: boolean;
  cached: boolean;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  logRef: string;
};

export type SystemValidationFixPacket = {
  version: 1;
  requestId: string;
  sourceRunId: string;
  candidateSha: string;
  profileId: string;
  failedTestIds: string[];
  logRef: string;
  repairAttempt: 1;
  instructions: string;
};

export async function runSystemValidation(
  request: SystemValidationRequest,
): Promise<SystemValidationResult> {
  await verifyCandidate(request.workspace, request.candidateSha);
  const cacheKey = validationCacheKey(request);
  const runDirectory = path.join(request.cacheRoot, 'system-runs', cacheKey);
  const resultPath = path.join(runDirectory, 'result.json');
  const cached = await readResult(resultPath);
  if (cached) return { ...cached, cached: true };
  const lockDirectory = path.join(
    request.cacheRoot,
    'system-runs/locks',
    createHash('sha256').update(request.profile.resource).digest('hex'),
  );
  await mkdir(path.dirname(lockDirectory), { recursive: true });
  try {
    await mkdir(lockDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(
        `System validation resource is busy: ${request.profile.resource}`,
      );
    throw error;
  }
  try {
    await mkdir(runDirectory, { recursive: true });
    const broker = new HostJobBroker(
      request.workspace,
      path.join(runDirectory, 'jobs'),
    );
    const job = await broker.run({
      label: request.profile.id,
      executable: request.profile.executable,
      arguments: request.profile.arguments,
      workingDirectory: request.workspace,
    });
    const event = await job.completion;
    const result: SystemValidationResult = {
      version: 1,
      runId: randomUUID(),
      cacheKey,
      projectId: request.projectId,
      cardId: request.cardId,
      candidateSha: request.candidateSha,
      environmentFingerprint: request.environmentFingerprint,
      profile: request.profile,
      status:
        event.status === 'completed'
          ? 'passed'
          : event.status === 'canceled'
            ? 'canceled'
            : 'failed',
      blocking: request.profile.blocking,
      cached: false,
      startedAt: event.startedAt,
      endedAt: event.endedAt ?? new Date().toISOString(),
      exitCode: event.exitCode,
      logRef: event.logRef,
    };
    await atomicJson(resultPath, result);
    return result;
  } finally {
    await rm(lockDirectory, { recursive: true, force: true });
  }
}

export function createSystemValidationFixPacket(
  result: SystemValidationResult,
  existingRepairAttempts: number,
): SystemValidationFixPacket | null {
  if (
    result.status !== 'failed' ||
    result.blocking ||
    existingRepairAttempts > 0
  )
    return null;
  return {
    version: 1,
    requestId: randomUUID(),
    sourceRunId: result.runId,
    candidateSha: result.candidateSha,
    profileId: result.profile.id,
    failedTestIds: result.profile.testIds ?? [],
    logRef: result.logRef,
    repairAttempt: 1,
    instructions:
      'Inspect only the optional UI regression failure and relevant product/test files. Decide whether the failure reflects product behavior or brittle automation. Make one bounded repair when actionable, create a new candidate commit, and request only the failed test IDs first. Do not change required code-gate results or claim user UI acceptance.',
  };
}

function validationCacheKey(request: SystemValidationRequest) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        candidateSha: request.candidateSha,
        environmentFingerprint: request.environmentFingerprint,
        profile: request.profile,
      }),
    )
    .digest('hex');
}

async function verifyCandidate(workspace: string, candidateSha: string) {
  const head = (
    await exec('git', ['-C', workspace, 'rev-parse', 'HEAD'], {
      timeout: 5000,
    })
  ).stdout.trim();
  if (head !== candidateSha)
    throw new Error('System validation candidate HEAD is stale.');
  const status = (
    await exec(
      'git',
      ['-C', workspace, 'status', '--porcelain', '--untracked-files=all'],
      { timeout: 5000, maxBuffer: 1_000_000 },
    )
  ).stdout.trim();
  if (status) throw new Error('System validation requires a clean candidate.');
}

async function readResult(file: string) {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SystemValidationResult;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
  });
  await rename(temporary, file);
}
