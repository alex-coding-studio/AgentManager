import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomically } from '../atomic-json-store.ts';
import { readRunLogEntries } from './run-log.ts';
import { hostSummary } from './summaries.ts';
import {
  isTerminalStatus,
  ownerKey,
  ownerLogUrlPath,
  sameOwner,
  storedOwner,
  type LatestResponseDocument,
  type LatestResponseSubject,
  type ResponseOwner,
} from './types.ts';

export const LATEST_RESPONSE_FILE = 'latest-response';

export class StaleResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleResponseError';
  }
}

const state = globalThis as typeof globalThis & {
  __praxisLatestResponseWrites?: Map<string, Promise<unknown>>;
};
const writes = (state.__praxisLatestResponseWrites ??= new Map());

export function latestResponseDirectory(owner: ResponseOwner) {
  return owner.kind === 'module'
    ? path.join(owner.planningPath, owner.module)
    : path.join(owner.planningPath, 'implementation/cards', owner.cardId);
}

export function latestResponsePaths(owner: ResponseOwner) {
  const directory = latestResponseDirectory(owner);
  return {
    directory,
    json: path.join(directory, `${LATEST_RESPONSE_FILE}.json`),
    markdown: path.join(directory, `${LATEST_RESPONSE_FILE}.md`),
  };
}

export async function readLatestResponse(
  owner: ResponseOwner,
): Promise<LatestResponseDocument | null> {
  const { json } = latestResponsePaths(owner);
  let text: string;
  try {
    text = await readFile(json, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const parsed = JSON.parse(text) as LatestResponseDocument;
    if (
      parsed?.schemaVersion !== 1 ||
      typeof parsed.runId !== 'string' ||
      !parsed.owner ||
      !sameOwner(parsed.owner, storedOwner(owner))
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function renderLatestResponseMarkdown(doc: LatestResponseDocument) {
  const status =
    doc.status === 'running'
      ? 'Running'
      : doc.status === 'completed'
        ? 'Completed'
        : doc.status === 'warning'
          ? 'Warning'
          : 'Fail';
  const lines = [
    `# ${doc.title}`,
    '',
    `Status: ${status}`,
    `Run: ${doc.runId}`,
    `Subject: ${doc.subject.label}`,
    `Updated: ${doc.updatedAt}`,
    `Log: ${doc.logRef}`,
    '',
    doc.detail.trim(),
  ];
  if (doc.supplementaryWarnings.length) {
    lines.push('', 'Additional findings:', '');
    for (const warning of doc.supplementaryWarnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function clearLatestResponse(owner: ResponseOwner) {
  const paths = latestResponsePaths(owner);
  await rm(paths.json, { force: true });
  await rm(paths.markdown, { force: true });
}

export type PublishOptions = { allowTerminalReplace?: boolean };

async function readOptional(file: string) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function restore(file: string, contents: string | null) {
  try {
    if (contents === null) await rm(file, { force: true });
    else await writeFileAtomically(file, contents);
  } catch {}
}

function assertPublishable(
  owner: ResponseOwner,
  current: LatestResponseDocument | null,
  doc: LatestResponseDocument,
  options: PublishOptions,
) {
  if (!sameOwner(doc.owner, storedOwner(owner)))
    throw new StaleResponseError('The response belongs to another owner.');
  if (!current) return;
  if (current.runId !== doc.runId) {
    if (current.startedAt > doc.startedAt)
      throw new StaleResponseError(
        'A newer Run already owns the Latest Response.',
      );
    return;
  }
  if (isTerminalStatus(current.status)) {
    if (!isTerminalStatus(doc.status))
      throw new StaleResponseError('The Run has already settled.');
    if (!options.allowTerminalReplace)
      throw new StaleResponseError(
        'The terminal response is already published.',
      );
  }
}

export async function publishLatestResponse(
  owner: ResponseOwner,
  doc: LatestResponseDocument,
  options: PublishOptions = {},
): Promise<LatestResponseDocument> {
  const key = ownerKey(owner);
  const previous = writes.get(key) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readLatestResponse(owner);
      assertPublishable(owner, current, doc, options);
      const next: LatestResponseDocument = {
        ...doc,
        revision: (current?.revision ?? 0) + 1,
      };
      const paths = latestResponsePaths(owner);
      const previous = await Promise.all([
        readOptional(paths.json),
        readOptional(paths.markdown),
      ]);
      try {
        await writeFileAtomically(
          paths.json,
          `${JSON.stringify(next, null, 2)}\n`,
        );
        await writeFileAtomically(
          paths.markdown,
          renderLatestResponseMarkdown(next),
        );
      } catch (error) {
        await restore(paths.json, previous[0]);
        await restore(paths.markdown, previous[1]);
        throw error;
      }
      return next;
    });
  writes.set(key, pending);
  try {
    return await pending;
  } finally {
    if (writes.get(key) === pending) writes.delete(key);
  }
}

export async function reconstructFailFromLog(
  owner: ResponseOwner,
  run: {
    runId: string;
    logFile: string;
    logRef: string;
    subject: LatestResponseSubject;
    startedAt: string;
    endedAt: string | null;
  },
): Promise<LatestResponseDocument> {
  let recentActivity: LatestResponseDocument['recentActivity'] = [];
  try {
    recentActivity = (await readRunLogEntries(run.logFile)).slice(-3);
  } catch {
    recentActivity = [];
  }
  const summary = hostSummary('publication');
  return {
    schemaVersion: 1,
    owner: storedOwner(owner),
    projectId: owner.projectId,
    runId: run.runId,
    revision: 0,
    status: 'fail',
    title: 'Response unavailable',
    detail: `${summary.detail} Open the Run Log ${run.logRef} for the recorded activity.`,
    subject: run.subject,
    supplementaryWarnings: [],
    recovery: ['log', 'reread'],
    startedAt: run.startedAt,
    updatedAt: new Date().toISOString(),
    endedAt: run.endedAt,
    logRef: run.logRef,
    logUrlPath: ownerLogUrlPath(owner, run.runId),
    hostPid: process.pid,
    recentActivity,
    reconstructed: true,
  };
}
