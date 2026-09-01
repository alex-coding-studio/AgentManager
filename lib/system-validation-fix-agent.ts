import type { AgentProfile } from './agent-profile.ts';
import type { CardEnvironmentManifest } from './card-host-operations.ts';
import { startEventDrivenWorkerRun } from './event-driven-agent-transport.ts';
import type {
  LocalAgentResult,
  startLocalAgentRun,
} from './local-agent-transport.ts';
import type { SystemValidationFixPacket } from './system-validation-runner.ts';

export type SystemValidationFixRequest = {
  packet: SystemValidationFixPacket;
  workspace: string;
  protectedPath?: string;
  profile: AgentProfile;
  environment?: CardEnvironmentManifest;
  actionId?: string;
  roundId?: string;
};

export async function runSystemValidationFixAgent(
  request: SystemValidationFixRequest,
  transport: typeof startLocalAgentRun = startEventDrivenWorkerRun,
): Promise<LocalAgentResult> {
  if (request.packet.repairAttempt !== 1)
    throw new Error('System validation Fix Agent permits one repair attempt.');
  const prompt = `You are the optional System validation Fix Agent for one exact Candidate. This is not required code acceptance and not user UI acceptance. Inspect the referenced failure log and only relevant product/test files. Decide whether the failure reflects product behavior or brittle automation. Make one bounded repair only when actionable. Preserve the current Card worktree and branch. Create one or more local commits, then report the new clean Candidate HEAD. Run only these failed test IDs first through the Host run_job tool: ${JSON.stringify(request.packet.failedTestIds)}. Do not run full UI regression, merge, accept the Action or claim user approval. If publish_candidate is available, use it once after the repaired Candidate is clean. If the failure is not actionable, do not modify files. Return concise JSON with status repaired, not-actionable or blocked; summary; previousCandidateSha; candidateSha; changedFiles; testIds; and evidenceRefs.\n\nFIX PACKET:\n${JSON.stringify(request.packet)}`;
  const run = transport(request.profile.agent, {
    workingDirectory: request.workspace,
    protectedPath: request.protectedPath,
    prompt,
    model: request.profile.model || undefined,
    effort: request.profile.effort || undefined,
    access: 'workspace-write',
    isolatedProcessGroup: true,
    disableDelegation: true,
    candidatePublication:
      request.environment && request.actionId && request.roundId
        ? {
            environment: request.environment,
            actionId: request.actionId,
            roundId: request.roundId,
          }
        : undefined,
  });
  return run.completion;
}
