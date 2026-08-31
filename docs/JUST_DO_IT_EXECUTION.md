# Just Do It — first live Action execution

## Implemented boundary

After Plan sign-off, the user can run the first unaccepted Action, inspect its
output, supply in-scope feedback for another round, and explicitly accept the
current output. Acceptance unlocks the next Action but never starts it. The
existing Preview remains isolated. All execution configuration uses the shared
Agent/model/effort selector.

Planning stays read-only. Execution starts a fresh provider Session in the Card's
persistent branch and worktree. All its Actions and Rounds reuse that directory;
the registered primary checkout is not the Action's source editing directory.
See [Card workspaces](JUST_DO_IT_WORKTREES.md). Codex honors the local user's explicit Full Access or read-only setting for
execution. With other built-in defaults it uses the Card workspace sandbox, with
primary HEAD/index/main and planning-store writes denied. Full Access removes those
OS write barriers and allows macOS simulator/device services; worktree and PR rules
remain explicit workflow requirements. Planning remains read-only in all modes.
Claude uses restricted mode with
file-edit permission; shell commands requiring approval may return blocked.
Only Codex has received the live write smoke so far. Neither mode automatically
creates a delivery repository, commits to an existing project branch, publishes
a PR, or merges. Those are not implied
by merely pressing Start; any repository operation must belong to the accepted
Action or explicit user instruction.

Local Git and GitHub are separate: commits and local history need a local Git
repository, whereas PRs and hosted Issues need a remote repository. The app now
maintains its own local Git history per Card, independently of the project's
delivery repository. See [Git checkpoints](#git-checkpoints) below.

## State and handoff

- Input, requested profile, finalized contracts, source resources, module working
  instructions and handoff are captured before launching the worker.
- Prior output and feedback remain in the Card worklog. Accepted Action outputs
  are explicit references for later Actions, including across fresh Sessions.
- Source dependencies block execution until corresponding imported Cards have
  all their Actions accepted. Their output references become execution context.
- Run completion stores the raw response, structured result and concise output.
  Agent self-checks remain labeled as reported checks, not independent acceptance.
- Explicit acceptance targets the current output ID and Card revision. It records
  user acceptance, not a verified GitHub merge, and preserves limitations/checks.
- There is one active execution per project in this local server. Revisions reject
  conflicting updates; interrupted workers become failed without automatic retry.

## Evidence and limitations

Before/after workspace snapshots identify changed files, symlink targets,
deletions and a changed project-local Git HEAD. Symlinks are never followed. The planning store,
Git internals and common dependency/build directories are excluded. Snapshots
are bounded to 20,000 entries and 256 MB. A reported delivery must reference an
observed artifact; an unchanged input file cannot stand in for new output.
The observer detects changes, not authorship: manual edits during a run can also
appear. It is not a rollback engine or protection against every external effect.

Cancellation terminates the worker/process group but does not revert files,
installed dependencies or external operations. Failures keep visible partial
changes where observation succeeds. Plan editing is conservatively locked once
execution begins because clean rollback is not implemented. Directly modifying
stored state to bypass that lock is unsupported. Multiple servers managing one
project, external modifications during execution, and automatic PR validation
are not validated workflows.

Review-Agent integration, background GitHub monitoring, Issue creation, general
merged-delivery reversal and downstream invalidation remain future work.

## Git checkpoints

Before the first tracked execution round, the host creates a baseline Commit
in a Card-owned bare repository at `implementation/cards/<uuid>/versions.git`
inside the planning store. Every normally completed round is then committed
before response validation, including blocked/error responses. A canceled
worker is stopped before its final checkpoint is attempted. Checkpoint failures
are surfaced and never treated as successful version capture.

These are real Git objects, not copies of Markdown labeled as commits. They
preserve regular-file bytes, executable mode and symlink targets, including
binary content and deletions. Link destinations are never copied. The app uses `git fast-import` without the project's index, branches,
hooks, attributes or clean/smudge filters. The project's existing staged changes
and HEAD are untouched. No GitHub connection or project-local `.git` is required.

Each Run stores its parent and checkpoint Commit; the UI displays its short hash
and a read-only version diff. Commits also remain reachable from checkpoint refs
and the private `history` branch. Existing rounds created before this integration
are not reconstructed: their first tracked baseline starts at the current
workspace, identified by `firstTrackedRunId`, not the original Plan's beginning.

The source snapshot exclusions still apply. Known environment secrets and key
files (`.env` variants except example/sample/template, PEM/P12/PFX/key and
provisioning files) are additionally omitted. This is not a comprehensive secret
scanner or a complete machine backup. A changing file invalidates checkpoint
capture rather than silently binding different bytes to observed evidence.

The host exposes `checkpoint:<requestId>` as this round's recorded workspace
version. An Agent can cite it for a no-code-change verification round, but must
state that no code changed. It is evidence of a snapshot, not proof of feature
correctness or user acceptance. Agent-reported checks remain separate.

Failure and cancellation never reset files automatically. A failed, canceled or
blocked Card without accepted Actions can explicitly archive its worktree and
restart at its base. Main and remote effects are unchanged. The confirmed Plan
is preserved; no Action starts automatically.

## Validation

- `npm run test:implementation-execution` covers real fixture-file changes,
  output persistence, feedback context, manual progression, cancellation,
  interrupted runs, unchanged-input rejection and permission separation.
- `node --experimental-strip-types scripts/smoke-just-do-it-execution.ts --run-live <model>`
  authorizes one real Codex call in a newly created temporary directory. It leaves
  the fixture as inspectable evidence and does not register or execute user projects.
- The initial live smoke used `gpt-5.6-luna`, low effort, produced exactly
  `smoke.txt` with `ready\n`, passed host content comparison, and left acceptance
  empty. This is file-writing integration evidence, not an iOS build/device pass.
- Browser rendering and acceptance-state checks used the real smoke output with
  intercepted fixture API responses. No user Plan was finalized or executed.

## GitHub delivery evidence

After a successful execution response, the host discovers `origin` in the registered
code directory or, for standalone projects, the project root. An enclosing parent
repository is not adopted. A repository created by an Action is therefore recognized
without re-registering the project. The host never creates repositories or PRs.

Each round retains its repository URL, observed delivery HEAD, branch eligible for
fallback discovery, cleanliness, reported PR numbers, remote PR details, and query
time/error. Same-repository URLs in the structured output are queried through `gh`;
multiple PRs may be associated even when their heads differ. Association is not proof
that every PR belongs exclusively to this Action or delivers its complete contract.
Without explicit URLs, discovery requires a changed HEAD and exactly one PR matching
the captured branch and commit. Ambiguity leaves the association empty.

The Action exposes Refresh GitHub status, including for older and accepted rounds.
Refresh queries the recorded repository and references, not the current checkout's
branch. It persists a worklog event and updated evidence without moving the Card's
checkpoint, accepting outputs, or starting another Action. The Card summarizes the
latest recorded status per PR across its rounds. Queries use the existing GitHub CLI
login; they never switch accounts or perform remote writes. Failed queries retain
old PR details with an explicit stale marker and a retryable error. At most twenty
explicit PR references can be queried per output; larger sets remain unverified.

Status refresh is explicit, not background monitoring. The timestamp describes the
last attempted check, not a promise of current remote state. Existing historical
outputs without a captured repository are not retroactively mapped from a newer
checkout; later rounds discover the repository. Planning and the demo remain isolated.
PR merge state and manual acceptance remain separate even after all linked PRs merge.

`npm run test:implementation-execution` includes repository-discovery and GitHub
fixtures covering multiple PRs, ambiguity, missing access and recovery, stale states,
remote identity mismatch, and refresh without acceptance or checkpoint movement.

## Report validation

The observer records all commits newly reachable from the final HEAD relative to
the round's baseline, bounded to 1,000 commits. This includes intermediate commits
without claiming authorship of every observed change. Execution check references
that are not independently known are retained and labeled unverified; command text
is never executed merely because it appears in a report. Review evidence stays strict.
Invalid delivery references still fail validation and disable acceptance, but their
schema- and identity-valid report remains visible. GitHub discovery also runs on
failed result validation when a workspace snapshot is available.

## Simulator access validation

`npm run test:simulator-access` requires the user to have already selected local
Full Access. It queries the real simulator service, builds a disposable XCTest
fixture and runs it on an already booted iPhone simulator. It does not run a model
turn, build the user's project, boot/reset devices, or change permission settings.
The restricted-profile isolation smoke remains `npm run test:worktree-sandbox`.

GitHub repository URLs matching the observed `origin` are valid external references
only after a live repository identity check. An empty repository is valid even
before it has a default-branch ref. PR artifact URLs additionally require the
recorded output HEAD to match the verified PR HEAD. External references are kept
separate from observed file/Git changes: they prove an accessible delivery location,
not creation during this Round, successful publication, correctness or acceptance.
Foreign URLs and failed lookups remain invalid delivery claims.
