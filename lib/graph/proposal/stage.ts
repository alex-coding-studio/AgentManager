import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CANDIDATE_ALIAS_PATTERN } from '../identity.ts';

const CANDIDATE_ID = new RegExp(CANDIDATE_ALIAS_PATTERN);

export type StagedCandidateDocument = {
  candidateId: string;
  markdown: string;
};

export type StageCandidateDocumentsResult = {
  written: string[];
  skipped: string[];
};

export async function stageCandidateDocuments(
  runPath: string,
  documents: StagedCandidateDocument[],
): Promise<StageCandidateDocumentsResult> {
  for (const document of documents) {
    if (!CANDIDATE_ID.test(document.candidateId))
      throw new Error('The Candidate identifier is invalid.');
  }
  const written: string[] = [];
  const skipped: string[] = [];
  await Promise.all(
    documents.map(async (document) => {
      const candidatePath = path.join(
        runPath,
        'candidates',
        document.candidateId,
      );
      const outputPath = path.join(candidatePath, 'output.md');
      const exists = await access(outputPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        skipped.push(document.candidateId);
        return;
      }
      await mkdir(candidatePath, { recursive: true });
      await writeFile(outputPath, `${document.markdown.trim()}\n`, {
        flag: 'wx',
      });
      written.push(document.candidateId);
    }),
  );
  return {
    written: written.sort((left, right) => left.localeCompare(right, 'en')),
    skipped: skipped.sort((left, right) => left.localeCompare(right, 'en')),
  };
}
