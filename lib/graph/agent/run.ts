import { randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  redactActivity,
  redactRecord,
  type LocalAgentActivity,
} from '../../agents/activity.ts';

export type AgentGraphActivity = {
  at: string;
  summary: string;
};

export type AgentGraphActivityRecorder = {
  onActivity: (event: LocalAgentActivity) => void;
  flush: () => Promise<void>;
};

export function agentGraphErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return redactRecord(message).slice(0, 2_000) || fallback;
}

export function initialAgentGraphActivity(
  summary: string,
  at = new Date().toISOString(),
): AgentGraphActivity[] {
  return [{ at, summary: redactActivity(summary) }];
}

export async function initializeAgentGraphActivity(
  runPath: string,
  activity: AgentGraphActivity[],
) {
  await writeAgentGraphText(
    path.join(runPath, 'activity.jsonl'),
    activityJsonl(activity),
  );
}

export function createAgentGraphActivityRecorder(
  runPath: string,
  activity: AgentGraphActivity[],
  onRecord?: (item: AgentGraphActivity) => void,
): AgentGraphActivityRecorder {
  let pending = Promise.resolve();
  return {
    onActivity(event) {
      const summary = redactActivity(event.summary);
      if (!summary) return;
      const item = { at: new Date().toISOString(), summary };
      activity.push(item);
      if (activity.length > 300) activity.splice(0, activity.length - 300);
      onRecord?.(item);
      pending = pending
        .then(() =>
          appendFile(
            path.join(runPath, 'activity.jsonl'),
            `${JSON.stringify(item)}\n`,
          ),
        )
        .catch(() => undefined);
    },
    async flush() {
      await pending;
    },
  };
}

export async function writeAgentGraphRunEvidence(
  runPath: string,
  input: {
    activity: AgentGraphActivity[];
    agentOutput?: string | null;
    summary?: string | null;
    response?: string | null;
  },
) {
  await mkdir(runPath, { recursive: true });
  await writeAgentGraphText(
    path.join(runPath, 'activity.jsonl'),
    activityJsonl(input.activity),
  );
  if (input.agentOutput)
    await writeAgentGraphText(
      path.join(runPath, 'agent-output.txt'),
      `${redactRecord(input.agentOutput).slice(0, 1_500_000)}\n`,
    );
  if (input.summary)
    await writeAgentGraphText(path.join(runPath, 'summary.md'), input.summary);
  if (input.response)
    await writeAgentGraphText(
      path.join(runPath, 'response.md'),
      input.response,
    );
}

async function writeAgentGraphText(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  if ((await readFile(file, 'utf8').catch(() => '')) === normalized) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, normalized, { flag: 'wx' });
  await rename(temporary, file);
}

function activityJsonl(activity: AgentGraphActivity[]) {
  return activity.map((item) => JSON.stringify(item)).join('\n') + '\n';
}
