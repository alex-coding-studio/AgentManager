import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getGitHubRepositoryUrl,
  type RegisteredProject,
} from './project-registry.ts';

const exec = promisify(execFile);
export type GitHubPullRequest = {
  number: number;
  url: string;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  headRefOid: string;
  headRefName: string;
  baseRefName: string;
  mergedAt: string | null;
};
export type GitHubDelivery = {
  repositoryUrl: string;
  outputHead: string | null;
  outputBranch: string | null;
  cleanAtOutput: boolean;
  requestedNumbers: number[];
  defaultBranch: string | null;
  pullRequests: GitHubPullRequest[];
  checkedAt: string;
  error: string | null;
};
export type GitHubReader = {
  repository: (repo: string) => Promise<string>;
  pullRequest: (repo: string, number: number) => Promise<GitHubPullRequest>;
  branchPullRequests: (
    repo: string,
    branch: string,
  ) => Promise<GitHubPullRequest[]>;
};
const fields =
  'number,url,title,state,isDraft,headRefOid,headRefName,baseRefName,mergedAt';
async function gh(args: string[]): Promise<unknown> {
  return JSON.parse(
    (
      await exec('gh', args, {
        timeout: 12000,
        maxBuffer: 1000000,
        env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      })
    ).stdout,
  );
}
export function validatePullRequest(
  repo: string,
  value: unknown,
): GitHubPullRequest {
  const pr = value as GitHubPullRequest;
  if (
    !pr ||
    !Number.isSafeInteger(pr.number) ||
    pr.number <= 0 ||
    pr.url !== `https://github.com/${repo}/pull/${pr.number}` ||
    !['OPEN', 'CLOSED', 'MERGED'].includes(pr.state) ||
    typeof pr.title !== 'string' ||
    typeof pr.isDraft !== 'boolean' ||
    !/^[0-9a-f]{40,64}$/.test(pr.headRefOid) ||
    typeof pr.baseRefName !== 'string' ||
    typeof pr.headRefName !== 'string' ||
    (pr.mergedAt !== null &&
      (typeof pr.mergedAt !== 'string' ||
        !Number.isFinite(Date.parse(pr.mergedAt))))
  )
    throw new Error('Invalid GitHub PR response.');
  return pr;
}
export const githubReader: GitHubReader = {
  async repository(repo) {
    const data = (await gh([
      'repo',
      'view',
      repo,
      '--json',
      'defaultBranchRef',
    ])) as { defaultBranchRef?: { name?: string } };
    if (!data.defaultBranchRef?.name) throw new Error('No default branch.');
    return data.defaultBranchRef.name;
  },
  async pullRequest(repo, number) {
    return validatePullRequest(
      repo,
      await gh([
        'pr',
        'view',
        String(number),
        '--repo',
        repo,
        '--json',
        fields,
      ]),
    );
  },
  async branchPullRequests(repo, branch) {
    const data = await gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--head',
      branch,
      '--state',
      'all',
      '--limit',
      '100',
      '--json',
      fields,
    ]);
    if (!Array.isArray(data)) throw new Error('Invalid PR list.');
    return data.map((item) => validatePullRequest(repo, item));
  },
};

export function mentionedPullRequests(repositoryUrl: string, output: string) {
  const matches = output.matchAll(
    /https:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/pull\/([1-9][0-9]*)(?![0-9A-Za-z])/g,
  );
  return [
    ...new Set(
      [...matches]
        .filter((match) => `https://github.com/${match[1]}` === repositoryUrl)
        .map((match) => Number(match[2]))
        .filter(Number.isSafeInteger),
    ),
  ];
}

export async function discoverGitHubDelivery(
  project: RegisteredProject,
  output: string,
  previousHead: string | null,
  reader = githubReader,
  observedHead?: string | null,
): Promise<GitHubDelivery | null> {
  const repositoryUrl = getGitHubRepositoryUrl(project);
  if (!repositoryUrl) return null;
  const result: GitHubDelivery = {
    repositoryUrl,
    outputHead: null,
    outputBranch: null,
    cleanAtOutput: false,
    requestedNumbers: mentionedPullRequests(repositoryUrl, output),
    defaultBranch: null,
    pullRequests: [],
    checkedAt: new Date().toISOString(),
    error: null,
  };
  try {
    const directory = project.codePath ?? project.rootPath;
    result.outputHead = (
      await exec('git', ['-C', directory, 'rev-parse', 'HEAD'], {
        timeout: 4000,
      })
    ).stdout.trim();
    if (observedHead !== undefined && observedHead !== result.outputHead)
      throw new Error('Workspace changed during observation.');
    result.cleanAtOutput = !(
      await exec(
        'git',
        ['-C', directory, 'status', '--porcelain', '--untracked-files=all'],
        { timeout: 4000, maxBuffer: 1000000 },
      )
    ).stdout.trim();
    if (result.outputHead !== previousHead)
      result.outputBranch =
        (
          await exec('git', ['-C', directory, 'branch', '--show-current'], {
            timeout: 4000,
          })
        ).stdout.trim() || null;
  } catch {
    return {
      ...result,
      outputHead: null,
      error:
        'Could not capture repository output. No GitHub delivery was verified.',
    };
  }
  return refreshGitHubDelivery(result, reader);
}

export async function refreshGitHubDelivery(
  delivery: GitHubDelivery,
  reader = githubReader,
): Promise<GitHubDelivery> {
  const repo = delivery.repositoryUrl.slice('https://github.com/'.length);
  try {
    if (
      !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(
        delivery.repositoryUrl,
      ) ||
      !delivery.outputHead
    )
      throw new Error('Missing output evidence.');
    const numbers = [
      ...new Set([
        ...delivery.requestedNumbers,
        ...delivery.pullRequests.map((pr) => pr.number),
      ]),
    ];
    if (numbers.length > 20) throw new Error('Too many PR references.');
    const defaultBranch = await reader.repository(repo);
    let pullRequests: GitHubPullRequest[] = [];
    if (numbers.length) {
      pullRequests = await Promise.all(
        numbers.map(async (number) => {
          const pr = validatePullRequest(
            repo,
            await reader.pullRequest(repo, number),
          );
          if (pr.number !== number) throw new Error('PR identity changed.');
          return pr;
        }),
      );
    } else if (
      delivery.outputBranch &&
      delivery.outputBranch !== defaultBranch
    ) {
      const matches = (
        await reader.branchPullRequests(repo, delivery.outputBranch)
      )
        .map((pr) => validatePullRequest(repo, pr))
        .filter(
          (pr) =>
            pr.headRefOid === delivery.outputHead &&
            pr.headRefName === delivery.outputBranch,
        );
      if (matches.length === 1) pullRequests = matches;
    }
    return {
      ...delivery,
      defaultBranch,
      pullRequests,
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ...delivery,
      error:
        'Could not refresh GitHub status. Check login and repository access. Previous status is not current verification.',
      checkedAt: new Date().toISOString(),
    };
  }
}

export function mergedDeliveryMatches(delivery: GitHubDelivery) {
  return (
    !delivery.error &&
    delivery.cleanAtOutput &&
    Boolean(delivery.outputHead && delivery.defaultBranch) &&
    delivery.pullRequests.length > 0 &&
    delivery.pullRequests.every(
      (pr) =>
        pr.state === 'MERGED' &&
        !pr.isDraft &&
        Boolean(pr.mergedAt) &&
        pr.headRefOid === delivery.outputHead &&
        pr.baseRefName === delivery.defaultBranch,
    )
  );
}
