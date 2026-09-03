import type { WhatToDoRunRecord } from './runs.ts';

export type WhatToDoDraft = {
  instruction: string;
  files: Array<{ name: string; mediaType: string; content: string }>;
};

export function shouldRestoreWhatToDoDraft(
  run: Pick<WhatToDoRunRecord, 'status' | 'result'>,
) {
  return (
    run.status === 'failed' ||
    run.status === 'canceled' ||
    run.result?.outcome === 'insufficient-evidence'
  );
}

export function whatToDoRunContextResourcePath(
  runId: string,
  workspacePath: string,
) {
  return `what-to-do/runs/${runId}/context/${workspacePath}`;
}

export function instructionFromWhatToDoMarkdown(markdown: string) {
  const prefix = '# User Input\n\n';
  const value = markdown.startsWith(prefix)
    ? markdown.slice(prefix.length)
    : markdown;
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}
