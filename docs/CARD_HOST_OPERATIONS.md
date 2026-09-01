# Card Host Operations

AgentManager owns deterministic environment, candidate publication and validation work.
Agents consume structured facts and results instead of reproducing Git, GitHub and CI setup
in model turns.

## Environment Manifest

`scripts/prepare-card-environment.ts` reads one JSON request from stdin or a named file. It
verifies the recorded Card worktree, branch, HEAD, clean state, remote, default branch,
local commit author and role policy. Repeating the request preserves the environment ID.
A deliberate Card workspace restart increments its revision.

The execution service writes the same manifest below the Card planning store and includes it
in Coordinator and Worker packets. These are Host-verified facts. Agents investigate them
only after a concrete contradiction.

## Candidate publication

`scripts/publish-card-candidate.ts` accepts one Candidate HEAD, not one request per commit.
It validates the complete base-to-head range, clean Card branch, forbidden paths, active
GitHub identity and push permission. It then pushes and creates or reuses the branch Draft
PR. Repeating the same environment and HEAD is idempotent.

Full Access Codex workers receive the same operation as `publish_candidate`. A Worker may
make several local commits, then call the Host once. It does not run individual `gh auth`,
permission, push, PR-create or PR-query commands.

## System validation

`scripts/run-system-validation.ts` runs a configured command against an exact clean
Candidate HEAD. Its cache key includes the candidate SHA, validation profile and environment
fingerprint. Repeating the same request returns the stored result without rerunning the
process. A resource lock prevents overlapping jobs such as two iOS Simulator runs.

Required code gates use `blocking: true`. Optional UI regression uses `blocking: false` and
does not change code acceptance or user UI acceptance. One failed optional run can produce a
single bounded Fix Packet. A later repair commit is a new Candidate SHA and therefore gets a
new cache entry.

All three scripts are thin JSON CLI adapters over the `lib` Host services. They contain no
project, Xcode, Swift or test-target names.
