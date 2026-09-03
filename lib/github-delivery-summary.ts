import type { ActionRun } from './modules/implementation/execution-types.ts';
import type { GitHubPullRequest } from './github-delivery.ts';

export function summarizeGitHub(runs: Pick<ActionRun, 'github'>[]) {
  const latest = new Map<
    string,
    { pr: GitHubPullRequest; stale: boolean; checkedAt: string }
  >();
  for (const run of runs) {
    if (!run.github) continue;
    for (const pr of run.github.pullRequests) {
      const previous = latest.get(pr.url);
      if (!previous || previous.checkedAt <= run.github.checkedAt)
        latest.set(pr.url, {
          pr,
          stale: Boolean(run.github.error),
          checkedAt: run.github.checkedAt,
        });
    }
  }
  return [...latest.values()];
}
