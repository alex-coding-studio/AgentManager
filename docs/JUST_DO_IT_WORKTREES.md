# Card workspaces

## Accepted behavior

One Just Do It Card owns one active Git branch and worktree. Its Actions and
feedback Rounds reuse that working directory. Project registration and planning
remain rooted at the original project; execution is directed to write source files only in the
Card worktree. Source context and accepted-output records remain available across
fresh provider Sessions.

Existing repositories start from their current committed HEAD. Uncommitted primary
checkout changes are not copied or discarded. A new empty standalone project needs
an explicitly confirmed local empty Git bootstrap before worktree creation. Starting
an Action or confirming the Plan alone does not grant that bootstrap exception.
The host never pushes main, merges a PR, publishes a repository or accepts an output.

A failed or canceled unaccepted Card can be restarted from its recorded base. Before
reset, show the active path and branch, preserve its workspace and Git history as a
backup, and create a new active worktree/branch. Reusing an old published branch or
force-pushing is forbidden. Preserve the confirmed Plan, advance the Card revision,
and require an explicit Start for the next run. Accepted Cards and known merged PRs
are not eligible for this local restart; external effects are never claimed undone.

## Validation contract

- Different Cards get different branches/worktrees; Actions within a Card reuse one.
- Source writes, untracked files and cancellation remain isolated from the primary
  checkout. The primary HEAD and index are unchanged for an existing repository.
- A missing, redirected or branch-switched Card worktree blocks further execution.
- Git metadata access is limited to the worktree admin directory, objects, own branch
  references/logs, remote-tracking metadata and explicit repository configuration in addition
  to the existing execution root when the workspace sandbox is selected. Full Access
  honors the user's broader permission choice; primary/planning-store protection is
  then a workflow requirement, not an OS guarantee.
- Existing pre-worktree execution is never silently resumed in a different directory.
- Reset preserves edited/untracked/ignored files and old branch history, cannot race
  a running Action, and returns a new ready state without automatic execution.
- Intermediate commits and reported checks remain evidence with distinct confidence;
  an invalid delivery report remains visible but cannot be accepted.

The current failed HereItIsV2 attempt predates worktree isolation. Its one-time
recovery must archive all local generated files and execution records, preserve the
confirmed Plan and source goals, and leave the remote repository unchanged.

## Verification and limitations

`npm run test:implementation-execution` exercises real disposable Git worktrees,
including reset errors and empty remotes. `npm run test:worktree-sandbox` performs
actual sandboxed commits and asserts that primary HEAD/index/main/source and planning
writes are denied; it starts no model turn and touches only a disposable fixture.

Recoverable operation errors restore the prior workspace/state. This is not a
crash-atomic transaction: killing the host between Git moves and persisted state
can require manual reconciliation, with the prior worktree and branch retained.
A remote side effect remains external even if the Card has no accepted Actions.

User-selected Full Access is supported for execution because macOS CoreSimulator
and CoreDevice use Mach/XPC services unavailable in the workspace sandbox. Planning
stays read-only; selecting broader execution permissions never authorizes automatic
acceptance, a default-branch push, or a PR merge.
