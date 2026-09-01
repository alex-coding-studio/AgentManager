# Development Environment Validation and Repair

Status: design proposal. The direction is agreed; the module and Auto-permission
validation described below are not implemented yet. Existing Full Access execution
is a working compatibility path, not evidence that restricted execution is repaired.

## Purpose

Help a person and their Agents restore a usable development environment before
repeating expensive development work. The useful result is a failed check that
passes after a bounded, explained repair, not a dashboard of unexplained warnings.

This is a project-level capability shared by planning and execution modules. It is
not another product Card, a mandatory phase between existing modules, or a place
where users manually reinstall and select every Skill. The runtime supplies its
enabled Skills catalog automatically.

## Permission direction

Prefer the normal workspace sandbox with native, per-command approval handling.
Investigate Codex Auto approval (`--approve-for-me`, or the corresponding
on-request policy and automatic approvals reviewer) before making broader access
the default. Auto approval evaluates requests; it does not mean unconditional
approval, and a denied operation remains denied.

The first experiment must prove simulator discovery and an isolated simulator test
under that actual execution path. A successful query from the unrestricted host
does not establish that a restricted worker can perform it. Keep any active Action
unchanged while testing a candidate execution policy in a disposable fixture.

Filesystem grants alone do not establish access to macOS Mach/XPC services.
Simulator checks must exercise CoreSimulatorService, not merely locate `simctl`.
Full Access can make those calls work while removing OS protection of the primary
checkout and planning store. That tradeoff must remain visible; it must never be a
silent fallback after a failed command.

A command approved outside the sandbox may run project-controlled build phases,
plugins or test code. An `xcodebuild` executable allowlist alone is not a security
boundary. Permission design must account for the command, working directory,
project content and effective grant, and must not claim that the entire build
remains sandbox-isolated merely because the coding Session normally is.

## Responsibilities

- The host performs deterministic probes, records the effective environment and
  applies the configured authorization mechanism.
- The Agent interprets evidence and proposes a concrete, bounded repair. It may
  execute an already authorized repair through the normal execution mechanism.
- The original host check is rerun to accept the repair. An Agent's statement that
  an environment is fixed does not change a failed check to passed.
- The user handles material choices, such as broader access, account or signing
  changes, destructive device resets and substantial installations. Present one
  concrete repair and its impact instead of asking permission for every routine step.

Keep code defects in the current development Action. Keep environment repair
scoped to the diagnosed environment problem; it must not become unrelated product
implementation or silently change the accepted Plan.

## Required checks

| Capability           | Evidence required                                                                              | When it gates work                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Agent and Skills     | Runtime starts; enabled catalog is available; selected entry points are readable               | Before the relevant Session starts                        |
| Card workspace       | Recorded repository, worktree, branch and base match actual Git state                          | Before source writes or Git operations                    |
| Files and caches     | Required project and cache locations work under the selected execution permissions             | Before tools using those locations                        |
| Toolchain            | Required CLI, Xcode and SDK are available and compatible with the project                      | Before the relevant build or test                         |
| Simulator            | The actual runner can query the device service and use the selected destination                | Before simulator validation                               |
| Physical device      | Device-service access, connection and trust are sufficient                                     | When the Action requires phone installation or acceptance |
| GitHub publication   | Current identity, canonical repository, visibility, permissions and branch target are verified | Immediately before remote writes                          |
| Remote main baseline | Intended default branch exists with the approved baseline before Card publication              | Before the first Card push or PR in a new remote          |

Use Passed, Blocked, Not checked and Not applicable states. A project entry point
that the first Action has not created yet is pending, not an unexplained failure.
Block the affected operation rather than unrelated work. Environment readiness is
not evidence that the app's actual tests, UI acceptance or product contract pass.

## Diagnosis and repair loop

1. Capture the failing command, exit status, relevant error and actual runtime
   permissions. Distinguish code violations from tool startup or cache-write failures.
2. Form a falsifiable cause and select a narrow check that distinguishes it from
   alternatives. Compare like-for-like environments, not a host result against a
   worker assumption.
3. Produce a repair with affected scope, expected outcome and recovery path.
   Examples include using an authorized cache location, restoring a missing local
   dependency, or obtaining command-scoped permission through the supported runtime.
4. Execute within current authorization. Do not delete simulator data, replace
   credentials, weaken Git gates or expand permissions as an implicit repair.
5. Rerun the original check in the intended worker context. Preserve both the
   failure and the new evidence. Stop unchanged retries; another attempt needs a
   changed condition or a distinct diagnostic hypothesis.

Avoid rerunning a whole setup workflow for a small feedback request. Reuse current
project artifacts and relevant prior evidence, then run the gates required for the
requested operation. A push hook may still require tests; the system must not bypass
that hook merely because a previous attempt encountered an environment problem.

## GitHub target identity

Resolve the publication and verification target from the current `origin` and the
latest explicit user instruction. Pass the same canonical owner/repository and
branch to Git transport, REST verification and the final report. An old handoff URL
is historical evidence, not the current target after the user changes ownership.

Before diagnosing eventual consistency, compare the exact targets. A ref in an
organization repository and HTTP 409 from an empty personal repository are not
conflicting observations of one resource. Verify the pushed SHA against the same
repository's ref, then query the corresponding tree.

Keep remote initialization separate from Card delivery. If an empty remote lacks
the intended main branch, propose the required bootstrap before publishing Card
work. The first pushed Card branch may become the remote default; that must not be
mistaken for a reviewed merge into main. Default-branch publication still requires
its existing explicit authorization. Never repair this by force-pushing or silently
changing the remote's default branch.

## Evidence and freshness

Record the check, result, actual runner and permission mode, worktree/branch,
relevant tool versions, canonical remote target, timestamp and repair outcome.
Invalidate affected checks when those inputs change. Recheck volatile identity and
permissions immediately before writes; an old Passed badge is not authorization.

Provide concise readiness and blocker facts to each Session so it does not repeat
broad discovery. Retain detailed evidence on demand. Separate these three facts in
the UI: environment availability, Agent-reported work/checks, and host-verified
artifacts. A malformed report or wrong-target verification must not erase actual
files, successful tests or a verified remote push, nor imply user acceptance.

## First implementation slice

1. Run one minimal Auto-permission simulator-discovery experiment, then one isolated
   simulator build/test if discovery succeeds. Record approvals, retained restrictions
   and cost; do not perform a broad multi-Agent comparison.
2. Establish probes for the already observed failure classes: cache writes,
   simulator service access and GitHub target/default-branch identity.
3. Add a project-level Development Environment view with the effective context,
   actionable blocker, proposed repair, recovery information and recheck result.
4. Integrate only the necessary preconditions into Session startup and publication;
   leave project-specific code/test failures in their current Action.

The first slice does not include a universal installer, automatic SDK downloads,
remote repository deletion, automatic merge, cloud execution or multi-user policy.

## Existing owners and references

- [Local Agent Skills](LOCAL_AGENT_SKILLS.md) owns current catalog discovery and
  recognized permission-setting behavior.
- [Card workspaces](JUST_DO_IT_WORKTREES.md) owns worktree and restart behavior.
- [Execution](JUST_DO_IT_EXECUTION.md) owns current report and artifact validation.
- [Codex approval configuration](https://learn.chatgpt.com/docs/config-file/config-reference)
  and [App-server approval flow](https://learn.chatgpt.com/docs/app-server#approvals)
  describe the native mechanisms to validate. They are not proof that the proposed
  Auto path has already passed the simulator experiment on this machine.
