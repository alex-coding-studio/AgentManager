# Just Do It Dogfooding Review — HereItIsV2

Status: the six-Action trial is accepted within the user-approved simulator scope.
This remains the chronological evidence ledger; the overall retrospective discussion
is starting. See [final statistics](evals/2026-08-31-hereitis-final-trial-statistics.md).
This document does not authorize more execution, acceptance, resets or GitHub writes.
The opening snapshot is historical; later sections record subsequent changes.
Defer the overall architecture review until all six Actions and their user
acceptance are complete, as requested by the user.

## Trial and initial evidence boundary

- Managed project: `../HereItIsV2`, registered as a standalone project.
- Goal: experience two registration orders in the same HereItIs iPhone app.
- Card: `fa549a45-246c-4a44-a0de-c094eef14eef`.
- First Action: `054e02a1-33e8-460b-bb26-c6e307104dad`.
- The six-step Plan was confirmed before execution. Findings below concern setup,
  GitHub publication and the first Action's feedback Rounds, not a completed app.
- At the initial checkpoint, the verified remote was private `alex-coding-studio/HereItIs`; default branch
  `main` points to empty baseline `8e9b7bd9a0cb1bd58fc75f215e5c804f8c1bf6ca`.
- Card branch points to `2e677253c4074db81c2d9cb102a03d35f12e391f`; it has not been
  merged into main. Its tree is `af2fa8bc6be56facffed3758047fb07c81664f68`.
- No first-Action acceptance, PR creation or physical-phone acceptance is established
  by this review. Successful lint, simulator tests and push do not replace them.

Project worklog evidence is under `.agent-manager/implementation/cards/<Card ID>/`.
The revision references below use that Card root. Original records are retained;
current repaired state must not be mistaken for the state initially observed.

## Observed execution sequence

An earlier pre-worktree attempt created an app scaffold, two local commits and the
private personal repository `xiaocq203/HereItIs`. It encountered environment blocks
and report-reference rejection. Before retrying, the user approved a local backup
and cleanup. Revision 9 preserves the confirmed Plan and records that recovery;
remote repositories were not deleted.

The following Rounds are the active Card's worktree-based retry sequence. Times are
America/Los_Angeles on 2026-08-30.

| Round | Time and duration         | Intended change                                                                | Verified result and failure boundary                                                                                                                                                                                                                                                              |
| ----- | ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 20:03:58–20:21:12; 17m14s | Build the initial project using the installed iOS setup workflow               | Skills were available; code stayed in the Card worktree. Scaffold and generic iOS build were produced. Device-service access blocked simulator/pre-push checks. Agent reported `blocked`; the structured report was retained.                                                                     |
| 2     | 20:22:24–20:31:39; 9m15s  | Correct publication to the private organization repository                     | Organization repository was created and origin changed. Lint cache writes and simulator access failed under the old sandbox. Normal push was blocked by its hook. The host additionally rejected the repository URL as an artifact.                                                               |
| 3     | 20:44:15–20:48:08; 3m53s  | Reuse the existing project, rerun gates and push the Card branch               | Full Access was actually loaded. Lint, simulator XCTest and pre-push passed; Git transport confirmed the branch. Agent REST checks used the old personal repository and reported HTTP 409. Its report also cited that wrong repository and an existing commit.                                    |
| 4     | 20:57:35–21:04:47; 7m13s  | Publish the explicitly authorized empty main baseline and correct verification | Remote main and default-branch setting were corrected. Exact main/Card commit and tree identities matched. A direct empty-tree expansion returned 404; alternative exact-object verification established the baseline. Host rejected existing commit references as if they had to be new commits. |

Round record revisions: 10/11, 12/13, 14/15 and 16/17 respectively. Revision 18
rechecks the saved fourth-Round report without a model call, code change or remote
write. It records host success while leaving Agent-reported checks and acceptance
unchanged. The empty-tree query failure remains in the original report as evidence.

## Findings and disposition

| ID        | Finding                                                                                            | Evidence and impact                                                                                                                                                                                                                         | Current disposition                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JDI-DF-01 | Installed plugin Skills were absent from the execution Session                                     | Initial worker ignored user config, received an empty harness Skills field, searched legacy paths and claimed the iOS plugin was unavailable. The plugin was installed.                                                                     | Native `skills/list` discovery and metadata injection implemented in `444cbaf`; Round 1 visibly read `ios-dev-agent:setup` and its references. Listing does not force invocation.                                                                                         |
| JDI-DF-02 | Submitted adjustment text leaked into the next step's input                                        | Card-wide feedback state was not cleared after successful submission and was initialized from the previous submitted run.                                                                                                                   | Input starts empty and clears on accepted submission; rejection retains the draft. Browser fixtures verified cross-step and retry behavior. Included in `444cbaf`.                                                                                                        |
| JDI-DF-03 | User Full Access differed from the worker's effective permissions                                  | Host queries succeeded, but equivalent worker-profile queries failed. Denial logs identified CoreSimulator/CoreDevice Mach/XPC lookup blocks and cache/log writes.                                                                          | Explicit local Full Access/read-only choice is honored for execution in `03e0eea`; planning stays read-only. Simulator query and isolated XCTest smoke passed. This restores usability but does not establish the proposed safer Auto path.                               |
| JDI-DF-04 | Lint tool failure looked like a source-code defect                                                 | SwiftFormat reported 0/4 files needing formatting; SwiftLint exited because it could not write a cache plist. The same project lint entry passed with no code edits under permitted access.                                                 | Immediate permission issue addressed. Environment diagnosis must distinguish tool/cache failures from rule violations before proposing code changes.                                                                                                                      |
| JDI-DF-05 | Initial execution had no isolated recovery boundary                                                | The pre-worktree attempt wrote into the primary directory. Canceling or failing preserved those effects, but there was no convenient return to the starting state.                                                                          | One persistent branch/worktree per Card and backup-first restart implemented in `444cbaf`. Actions/Rounds reuse it; no auto-reset or main merge. Legacy local state was separately backed up and reset by user instruction.                                               |
| JDI-DF-06 | Artifact references were conflated with newly changed artifacts                                    | Intermediate commits, repository URLs and later existing commit/file references repeatedly caused host rejection even when the report described verification/publication rather than new code.                                              | Intermediate history and remote identity checks were added; `d56145e` separates observed changes from verified version/external references and adds saved-report recheck. Missing files, unreachable commits, foreign targets and identity/schema errors remain rejected. |
| JDI-DF-07 | GitHub verification used a different repository from the push                                      | Round 3 pushed through organization origin but hardcoded `xiaocq203/HereItIs` in REST commands and final links. Correct organization ref/tree queries succeeded.                                                                            | Cause confirmed; wrong references remain invalid. A single host-supplied canonical target for operation, verification and reporting is still a prevention requirement in the environment proposal. Do not call this eventual consistency.                                 |
| JDI-DF-08 | The first remote Card push happened before a remote main baseline existed                          | The Card branch became the remote default. A local empty main did not by itself create remote main.                                                                                                                                         | User explicitly authorized bootstrap in Round 4; remote state is now correct. Publication preflight must detect this before future first pushes; never infer default-branch write authorization from Plan confirmation.                                                   |
| JDI-DF-09 | A failed diagnostic attempt was presented beside successful validation without explaining its role | Round 4 retained a failed direct empty-tree GET while exact remote commit/tree SHA plus local empty-tree content proved the requested baseline.                                                                                             | Verification facts are confirmed. Diagnostic-attempt versus required-validation classification remains a UI/schema design item; no failed historical command is relabeled as successful.                                                                                  |
| JDI-DF-10 | Small feedback caused broad repeated setup work                                                    | Round 2 requested an organization/private-repository correction but reread setup/context, regenerated the project, rebuilt and waited on known unavailable simulator paths before/inside push gates.                                        | Record for final efficiency review. Reuse relevant evidence and narrow the feedback scope, while preserving required hooks. No claim that all repeated checks were unnecessary.                                                                                           |
| JDI-DF-11 | Running-state visibility was insufficient                                                          | The user needed external transcript inspection to learn which Skill was loaded, which permissions were effective, what command was running and why it was waiting. Effective access is recorded only after successful transport completion. | Open. Expose bounded progress and actual runtime facts without injecting whole transcripts or private reasoning into the UI.                                                                                                                                              |
| JDI-DF-12 | Recovery/handoff summaries could lag authoritative state                                           | Early handoff prose still called the Plan a draft after finalization. Later ownership corrections competed with older repository references.                                                                                                | Current host stage/Plan/Action facts are now explicit in the execution prompt; reset events override stale summary state. Canonical GitHub target propagation still needs stronger ownership.                                                                             |

## Action readiness gap surfaced after report recheck

The user challenged the UI's "Ready to verify" state: there was no PR or runnable
phone delivery to inspect. Live inspection confirmed no PRs, no accepted Actions,
and a latest Round that completed only remote initialization repair. The first
Action still requires a phone-launchable app and the agreed delivery evidence.

The current UI derives readiness from the latest successful execution/report and
its Round outcome. That promotes a narrow repair Round's `delivered` result into
whole-Action readiness without establishing the Action's complete output and
validation requirements. Host report validity, Round completion, an inspectable
user deliverable and Action acceptance are separate facts.

This is not resolved merely by renaming the status. The workflow needs a concrete
user-facing delivery entry point and evidence for the full Action before offering
ordinary completion acceptance. Explicit partial acceptance, if chosen, must remain
an explicit exception with retained limitations, not the default inferred from a
successful repair report.

Under the existing UI-bearing delivery rule, the immediate missing handoff is the
phone-installed app for UI inspection; a ready PR follows explicit UI acceptance.
No PR by itself would establish the missing phone evidence, and no report recheck
should silently mark this Action complete. Record this as JDI-DF-13, open for the
post-Card product/state-model discussion. No Action was accepted or started while
recording this finding.

## Time and usage evidence

The organization repository creation call itself took about 3.3 seconds. Round 2's
9m15s was mostly context/identity investigation, validation work, simulator waiting
and report preparation, not GitHub creation latency. It also made one locally
rejected push with an incomplete branch name before using HEAD; this is part of the
observed execution inefficiency, not a separate GitHub failure.

| Round | Reported input tokens | Cached input tokens | Reported output tokens |
| ----- | --------------------: | ------------------: | ---------------------: |
| 1     |             5,841,565 |           5,624,832 |                 45,353 |
| 2     |             1,287,349 |           1,202,688 |                 21,744 |
| 3     |               702,133 |             641,024 |                 10,583 |
| 4     |               648,924 |             592,640 |                 21,511 |

These are the provider usage aggregates stored on each Run, not a single context
window size or a monetary bill. Cached input is a subset, not an additional charge
estimate. The pre-worktree attempt and AgentManager implementation work are excluded.
Do not attribute all usage to a specific cause without analyzing the full Card.

## What must not be concluded yet

- The Card, first Action, actual phone experience and PR lifecycle are not accepted
  simply because environment access, simulator tests or publication now work.
- Worktree isolation is not OS security isolation. Full Access removes the filesystem
  barrier around main/planning data; workflow rules remain, but the safer Auto path
  is only a proposal until its real approval flow is tested.
- A rechecked report is not a rerun of its commands. Revision 18 repairs reference
  validation only; it does not erase historical failures or declare every check passed.
- Local reset does not undo remote repository creation, default-branch changes,
  published branches, installed applications or other external effects.

## Continue collecting through the complete Card

Keep using the actual workflow and append only meaningful new findings. In particular:

- Does the second Action correctly inherit the first accepted output and decisions
  while reusing the same Card worktree?
- Does in-scope feedback remain in the current Action, with unrelated future work
  kept separate and no accidental next-Action start?
- Can the user distinguish environment readiness, execution outcome, evidence
  confidence, PR state and manual acceptance without asking another Agent?
- Does recovery preserve work and remain understandable after multiple Rounds?
- Does the complete delivery preserve the PR-to-main and phone/UI acceptance boundary?
- Which repeated investigations should become deterministic host checks, and which
  still require an Agent's judgment?

After the Card finishes, review the complete trace with the user before expanding
scope or declaring the interaction model successful. Do not start another test Card,
change shared Skills, or redesign the workflow solely from this interim document.

Related owners: [execution](JUST_DO_IT_EXECUTION.md),
[Card worktrees](JUST_DO_IT_WORKTREES.md), [Skills context](LOCAL_AGENT_SKILLS.md),
and the proposed [development environment diagnosis and repair](DEVELOPMENT_ENVIRONMENT.md).
The separately recorded dialog dependency-error issue remains in
[DOGFOODING_ISSUES.md](DOGFOODING_ISSUES.md); it was not fixed by this trial.

## Round 5 follow-up: delivery friction and diagnostic noise

The user changed this trial's first-Action acceptance requirement: a physical phone
is no longer required; simulator acceptance is sufficient. This explicit newer
instruction supersedes the older phone requirement for this trial. It does not
establish that later registration/persistence Actions have been delivered.

Round 5 (`5b01aad6-65dc-4818-a5a3-a8ac7be3f574`, revisions 20/21) took about
5m48s and returned a valid report. Project lint, the simulator test, simulator
installation and launch passed. The Agent corrected the stale personal-repository
entry in `docs/PROJECT.md`, committed `2df1c807efd64d8c7cf8e15e50e5aa5606ca509b`
and pushed the Card branch. The simulator app is HereItIs,
`com.cuxiao.ios.hereitismvp`, version 0.1.0 (1). No PR existed at inspection, and
no Action had been accepted by the user.

A further `simctl spawn ... ps` probe failed because that simulator image did not
provide `ps`. This does not contradict successful install/launch/listapps evidence.
It is a second concrete example of JDI-DF-09: an optional diagnostic attempt is
shown with a red Failed label beside actual acceptance checks, making a successful
operation look broken. Do not falsify the command result; classify it as an
unsupported/nonblocking diagnostic and retain the successful primary evidence.

The user also reported that the overall pace is too slow and that a branch-only
handoff without a PR or a clear interactive delivery entry point is not useful for
acceptance. This strengthens JDI-DF-10/11/13. The current implementation still leaves
PR/review and UI acceptance transitions to loosely worded instructions; the Agent
stops with "PR remains for the corresponding human stage" without completing a
clear handoff. This must be discussed as a workflow ownership gap, not patched by
asking the user to restate the entire setup task in another Round.

Candidate prevention for discussion: freeze the required validation checks for the
Action, keep ad hoc diagnostics separate, stop probing after a condition already has
sufficient evidence, and present a concrete next user action with the actual artifact.
Simulator automated tests, simulator installation/launch, visible UI inspection and
PR review remain distinct evidence layers even when physical-device testing is waived.

## Checklist and Draft-first rulings after Round 5

JDI-DF-14: the user inspected the Plan and the Round output and found no generated
pre-execution self-check list. Code inspection confirmed `ActionContract.validation`
is a string and each returned `Check` contains only summary/status/evidenceRefs.
Finalize copies the Plan steps; it does not materialize a frozen checklist. The
returned checks are chosen by the execution Agent after the work. This explains
how an unplanned simulator `ps` probe entered the same list as required validation.
It is not accurate to say the system already checks strictly against a fixed list.

The user explicitly required extra diagnostics to be labeled `non-blocker` and left
for user judgment. Passing all necessary checks must count as passing; an Agent
cannot add a new gate during execution. Implement this through a checklist tied to
the approved Action, not by guessing importance from free-text error messages.

JDI-DF-15: withholding a PR prevented manual takeover. The user replaced the prior
ordering with Draft PR first, then self-checks, then Ready for review once the
required checks pass. This does not imply merge or user acceptance. A Draft PR was
created for the existing Card branch: https://github.com/alex-coding-studio/HereItIs/pull/1,
base main, head `2df1c807efd64d8c7cf8e15e50e5aa5606ca509b`. It remains Draft;
no checklist enforcement, Ready transition, acceptance or merge is claimed here.

The latest product ruling lives in [Just Do It](JUST_DO_IT.md). Existing historical
Plan/report text is not rewritten to pretend the new checklist existed beforehand.

### Confirmed checklist refinement

The user clarified that Input/Output may remain high-level, but acceptance must be
detailed and fixed before execution. Every Round must refer to that checklist;
extra acceptance probes are allowed only as non-blockers and cannot block user
acceptance. This is the confirmed resolution direction for JDI-DF-09/13/14, recorded
in the product workflow. Its data/schema/UI enforcement remains pending; existing
Plan text and historical reports are not retroactively presented as a frozen list.

## Dependency-aware stopping review after Rounds 1–5

JDI-DF-16: Round 1 did not fail fast after an unavailable prerequisite was known.
The original Session `01a055c6-1123-73e3-9e99-8f918d3a496e` records simulator access
failure at approximately 03:06 UTC, a failed simulator test by 03:15, a push at
03:16:48 whose hook repeated that unavailable test, and Mac fallback attempts at
03:18. It ended at 03:21:12, after 17m14s. It created the initial shell but did not
implement the later persistence or registration Actions. The defect is continued
work and repeated dependent checks within Action 1, not execution of the whole Plan.
Round 2 also reports lint/simulator failures followed by a blocked pre-push test.
Independent build/signing evidence was useful partial output; not every operation
after the first failure was waste. The repeated unchanged simulator prerequisite
and unbounded search for alternative execution paths are the prevention target.

Confirmed direction: identify prerequisite dependencies, stop affected downstream
work, allow explicitly justified independent progress, and bound cause-directed
repair. Do not retry an unchanged known failure or invoke a hook known to repeat
it without a relevant change. Preserve partial output and report blocked promptly.
Optional diagnostic failures remain non-blockers. Evidence reuse requires matching
revision and relevant environment; it never waives a mandatory gate.

JDI-DF-17: the Draft-first ruling conflicts with the current full-test pre-push
hook. A prompt asking for an early Draft cannot publish a branch when that hook
requires the unavailable simulator first. Separate safe publication prerequisites
from acceptance checks in the eventual design; reconcile the actual hook policy
explicitly, never bypass it. Until implemented, show the publication blocker and
local takeover artifact. No shared hook was changed by this documentation update.

The checklist is drafted and adjustable during Plan, then locked at finalization.
A later explicit user ruling can pass a named item for workflow purposes while
retaining the actual test result and recording the override separately. It does
not silently rewrite the frozen criterion or historical evidence.

### Coverage required for the subsequent workflow review

After the complete Card trial, review Plan confirmation, prerequisites, repair,
publication, required checks, additional diagnostics, user override, Ready,
acceptance and the next Action as one flow. Unit tests alone did not establish
that a human could inspect a Draft or recover from a real permission failure.
Add deterministic regressions for dependency stopping, unchanged-failure retry
suppression, evidence invalidation and override provenance. Also exercise a real
hook-blocked publication, partial-output takeover, retry and Draft-to-Ready flow.
Report automated checks and observed end-to-end behavior separately. These are
required validation scenarios, not tests or live trials completed by this update.

## Implementation checkpoint before Round 6

Structured Plan criteria, finalization/start validation, per-Round snapshots,
required-ID coverage and explicit user overrides are implemented. The UI separates
required and additional checks; unclassified historical results remain historical.
The first Action received six detailed criteria through an append-only one-time
user-authorized migration (Card revision 22). Its five earlier Rounds and acceptance
state are unchanged. The canonical project checklist is `docs/acceptance/SETUP.md`.

Shared infrastructure PR #63 was independently reviewed and merged at `00c5b3d`.
An explicit HereItIs configuration now separates Card branch publication from
full acceptance tests; non-opted-in projects retain their current hook behavior.
Three hook regression groups verify ref restrictions and required test outcomes.
The new acceptance entry rejects no-target and zero-test success. No hook bypass
or default-branch publication was used.

Dependency-aware stopping and a one-repair limit are now in the execution prompt.
They are not a deterministic host command gate. Likewise Ready remains an Agent
operation, not remote branch protection. The full Card trial must verify these
behaviors; neither unit tests nor this preflight certify the next Round or Action.

Preflight verification: AgentManager planning tests (24), harness tests (27),
execution/checklist/worktree/GitHub tests (40), lint, typecheck and production build
passed during this change. The real HereItIs acceptance entry executed one simulator
test successfully. A normal Card push then used the explicit publication policy
without rerunning simulator tests; PR #1 remains Draft at `e51b451`. Browser
inspection confirmed the six criteria, historical-report labeling and disabled
acceptance for the old output. Round 6 was not started and no Action was accepted.

## Round 6 result and attachment recovery

Round 6 (`b43ad544-a0ee-4f88-8f3c-f8d47bf785d5`) ran from 05:15:31.975 to
05:21:28.694 UTC, 5m57s. All six SETUP criteria passed against `e51b451`; one
simulator test actually executed. The Agent verified the dual-entry home with a
screenshot and changed existing PR #1 from Draft to Ready without merging. An
unsupported `gh pr diff --stat` attempt remained an additional non-blocker; supported
diff commands established the required condition. No project code changed.

JDI-DF-18: the host initially rejected `file:build/acceptance/home.png` because
workspace snapshots deliberately exclude build directories. A real generated
acceptance attachment was conflated with unverified output. The fix captures only
bounded named files under `build/acceptance/`, rejects traversal, symlinks and files
modified after the Round ended, and retains bytes plus SHA-256 in an append-only
Card artifact record. Generated evidence stays out of the source repository.
Existing source/version validation remains unchanged; the error text now says
references could not be verified rather than implying every failure reuses input.

The saved report was rechecked through the UI at revision 25; Round 6 is succeeded,
all six required items pass, PR #1 is associated and Ready, and the acceptance
button is enabled. The original rejected report at revision 24 is preserved.
No Agent rerun occurred; the Card still has six Rounds and zero accepted Actions.
The screenshot was captured into the archive at recheck time, not falsely described
as part of the original workspace snapshot. Execution regression coverage now has
42 passing tests, including attachment retention and unsafe/stale path rejection.

This establishes the first Action's handoff, not acceptance of the complete Card.
The remaining legacy Actions still need detailed standards before they can execute.
Host-level command interception for bounded repair and remote Ready/merge gates
remain distinct future mechanisms; this trial did not encounter a required-check
failure after the new instructions, so it does not prove fail-fast behavior.

## User acceptance, merge and Action 2 launch

The user explicitly accepted Action 1 and requested PR #1 merge followed by Action
2 execution. Acceptance was recorded at Card revision 26. Independent exact-head
review approved `e51b451` with no findings; primary-account approval and merge
produced `e7fe51c`. The primary checkout and the persistent Card branch were
fast-forwarded to the merged baseline. The Card worktree was retained because
later Actions still use it; no new worktree or repository was created.

Action 2's legacy validation was expanded into DATA-01 through DATA-08 before
execution and bound at revision 27. `docs/acceptance/RECORDS.md` records shared
fields, real disk reload, isolated corrections, honest write-failure behavior,
detail UI, project gates and new-PR handoff. The contract commit is `678dfd8`.
Draft PR #2 was created before implementation, so the user has a takeover artifact
from the beginning. It does not reuse the merged PR as the next delivery.

Action 2 Round 1 (`1c251ca4-5227-4e5b-9475-2c98ca8f43eb`) started at
05:32:34 UTC with eight frozen criteria and one accepted predecessor. Browser
inspection confirmed running state and an empty post-submit input. Implementation
results are not yet claimed by this launch record. Full registration flows remain
Actions 3 and 4; Action 2 must not auto-accept, merge or start Action 3.

## Compact checks and unambiguous current stage

User feedback after Action 2: expanded required-check metadata overwhelmed the
execution page, and the green completed preparation stage looked like the current
stage while awaiting acceptance. Required and additional checks now default to
collapsed title/status rows. Details retain conditions, evidence and user decisions.
Additional non-passing checks use an amber minus rather than a red failure cross.
The current stage is explicitly labeled and highlighted; earlier stages use muted
checkmarks. No acceptance verdict or user-acceptance state was changed.

Browser verification on the real Action 2 output found eight required rows and one
additional row collapsed by default, successful expansion of both types, an amber
minus for the additional failed attempt, and current stage “Ready to verify”.
Typecheck and lint passed. This verifies presentation, not independent acceptance
of Action 2 implementation or authorization to merge its PR.

The pre-execution checklist above the current-status indicator now has an outer
collapsed group labeled with its item count, avoiding duplication of the results
below. Browser verification confirmed the eight-item group starts closed, opens
and closes normally, and leaves all nine result rows unchanged.

The user refined stage colors to match the Plan: completed stages retain green
checkmarks, the current stage uses blue text/background and an explicit current
badge, and future stages stay gray. Real Action 2 DOM inspection confirmed all
three distinct states without changing acceptance data; lint and typecheck pass.

Round GitHub presentation is reduced to compact PR number/state links and a refresh
icon on the right of the collapsible Round header. Repository identity remains in
the global project header; repeated repository URLs and the large GitHub panel are
removed. Full PR title and query time are available on hover. Stale/error reporting
is retained. Browser verification confirmed the PR link remains visible while the
Round is collapsed and refreshing does not expand it. Lint and typecheck pass.

The Card workspace panel now separates labeled path and branch values from its
short scope note, with an Open folder action in the header. The server resolves
the stored Card workspace and verifies ownership before opening the system file
manager; no arbitrary browser-provided path is executed. Clicking the real UI
button opened Finder at the expected Card worktree. Lint, typecheck and all 42
execution regression tests passed; no execution or acceptance state changed.

The Plan sidebar now retains a blue arrow on the started, unaccepted current
Action, including while it awaits user acceptance. Running execution retains its
blue spinner; accepted Actions retain green checks. The marker derives from
execution state rather than the selected detail tab. Browser verification showed
Action 1 checked, Action 2 arrowed, and the arrow unchanged when viewing Action 3.

Acceptance now opens a confirmation dialog showing output identity and summary,
required-check coverage, explicit user overrides, additional non-blockers, remaining
work and PR state. It explains which Action unlocks next and that neither execution
nor merge starts automatically. The dialog binds to the displayed output/revision;
changed props disable confirmation, while backend revision validation remains in
place. Errors remain visible in the dialog. An isolated browser fixture verified
zero requests on initial click/cancel and one request on confirmation; real user
acceptance was not changed by this test.

The user also corrected the stage model: accepted is the completed state of
acceptance, not a third phase. The progress display now has Execution and Acceptance
only, with blue for current work and green checks for completion. The redundant
accepted-output sentence was removed. Real accepted Action 2 shows two green phases
without that duplicate message. Lint and typecheck passed; temporary fixture files
and its browser tab were removed.

## Complete legacy Plan checklist migration

The user identified that Actions 3–6 still had only free-text validation. Earlier
one-Action upgrades did not complete migration of the finalized Plan. Under the
explicit request to migrate the whole Plan, revision 32 adds all four missing
checklists atomically: BOX (7), LOC (6), MVP (6), and TRIAL (4). The current Plan
reference now points to the complete migrated plan, alongside a dedicated
`acceptance-migration.md` in the same append-only revision.

Actions 1–2 and their 6/8 criteria, original Action IDs and scope, all seven Rounds,
and both accepted Action IDs were compared before/after and preserved. All six
Actions now have valid detailed criteria matching the Plan steps. Browser inspection
confirmed the four new checklist counts without missing-checklist messages. No
Action started, no result was marked passed and no PR was merged during migration.
The final phone trial still requires actual user observations and an explicit user
verdict; the earlier setup simulator waiver was not generalized to that trial.

## Shared logs and context direction — documented, deferred

The user requested a cross-module log and context proposal after the Card trial
extended from the previous evening into the following morning. The agreed direction
is documented in [Run Logs, Progress and Reusable Context](RUN_LOGS_AND_CONTEXT.md):
elapsed time, current activity and latest update in the running UI; small current
facts and verified conclusions in handoffs; bounded access to detailed logs through
summary references. This applies to What's Next, Break It Down and Just Do It.

This update is documentation only. It does not rebuild storage, add mandatory gates
or inject full transcripts into execution. Finish the existing six-Action trial,
then use its evidence to review repeated work, missing context, observability and
token cost before choosing implementation priorities.

## Artifact verification responsibility and blocking policy — deferred review

JDI-DF-19: Action 3 finished in 24m08s and reported all seven BOX criteria passed,
with passing simulator tests. The host rejected the claimed generated directory
`file:build/DerivedData/Build/Products/Debug-iphoneos/HereItIs.app` because its
artifact verifier does not support that bundle reference. The saved Round at
revision 34 is failed for evidence verification, not because the optional
xcresult diagnostic failed. The PR was published; this is not proof that the
user accepted the implementation.

The intended verifier checks whether claimed files, commits and PRs exist and
correspond to the current project/output. It does not rerun functional acceptance
or independently prove that the app works. Three distinct outcomes were conflated:

- A required functional check failed or was not executed.
- A claimed delivery artifact is missing, wrong or belongs to another project.
- The host cannot verify the artifact type with its current capabilities.

The last case is a system limitation, not evidence that implementation failed.
It must not be visually attributed to an optional diagnostic or silently relabeled
as successful verification. Current required-check results and original reports
remain evidence even when host verification is unresolved.

Retry also has a cost: saved-report recheck avoids a model run but can still read
records, scan/check the workspace and query GitHub. Retrying an unsupported bundle
without a capability change cannot succeed. Such known unsupported cases must not
invite an unconditional retry; the current local fix hides that retry action and
rejects it before workspace/remote verification. This does not add bundle support.

The user also clarified that required checks are the single source of current
Action acceptance gaps. Do not display a second "Remaining work" acceptance list.
Normal PR lifecycle state, pending human acceptance and future Actions belong to
their respective surfaces, not a list suggesting current execution is unfinished.
Retain historical report text without turning it into new acceptance requirements.

After all six Actions complete, decide together:

1. Which delivery references require host verification, declared before execution,
   and which are supporting evidence rather than independent blockers?
2. How should unavailable verifier capability, a transient lookup failure and a
   definitively invalid artifact differ in state, retry behavior and user actions?
3. When, if ever, may the user proceed with a clearly recorded unverified artifact,
   without falsifying evidence or weakening identity/security checks?
4. Can the verifier use existing commit/PR/build evidence coherently, instead of
   repeatedly adding special support after each newly encountered artifact format?

The user requested recording this issue and continuing the trial. This section
changes no verification policy, grants no automatic waiver, and does not start,
accept or merge another Action. Resolve the architecture after the complete trial.

## Required checks remain the only acceptance gate

The user corrected the attempted addition of a separate system-verification gate.
A schema/identity-valid report with all required criteria passed is now eligible
for explicit user acceptance even when artifact verification produced warnings.
The acceptance endpoint preserves the original evidence errors and does not mark
those references verified. Regression coverage checks this behavior; missing/failed
required criteria and invalid reports still cannot pass through the same route.
Action 3's real confirmation dialog now allows confirmation with BOX 7/7 while
retaining the unsupported app-bundle note. The test only opened/closed the dialog;
it did not accept the Action.

Independent Remaining work rendering was removed from results and confirmation.
The original report and the earlier scope-note classification record remain in
history. Future reports are instructed to put actual gaps in failed/not-run
required checks rather than a parallel free-text acceptance list. Additional
checks remain advisory. Unsupported app bundles no longer offer a retry; the
server refuses that retry before workspace/remote verification, without an Agent
call or new Card revision.

The UI now separates Round information, output/checks and collapsed diagnostics
from a dark sticky Action control bar. Its visible Agent summary includes provider,
model and reasoning effort. Continue enters an explicit change-input mode, hides
acceptance, and requires nonempty feedback plus confirmation to start execution.
Cancel returns to result review. Settings/input open in an independent panel above
the bar; measured bar geometry remained 64px high at the same viewport position
across the tested modes. No execution was started in these UI checks.

Stop execution uses a short confirmation instead of a permanent disclaimer. An
isolated browser fixture verified that opening/canceling sends no stop request and
confirming sends exactly one intercepted request, without stopping real work.

A regression run also exposed a timestamp-precision defect in attachment capture:
filesystem mtimes can have sub-millisecond precision while stored Round timestamps
have milliseconds. Comparing at the recorded precision prevents same-millisecond
false rejection; a deterministic test still rejects a file modified in a later
millisecond. This change does not add app-bundle support.

The user superseded the upward white-popover layout: the dark toolbar now sits
above an in-flow expandable panel in the same bottom dock. Both feedback and Agent
settings inherit the dark surface and light text, eliminating white overlays on
the page. Browser geometry checks confirmed each panel begins at the toolbar's
bottom edge; native selects and textarea text retain contrast. Toolbar height stays
64px while the dock expands to accommodate the lower panel. Typecheck/lint passed;
no execution or acceptance was triggered by the layout verification.

PR refresh is now tied to opening acceptance, as requested by the user, rather
than new polling. When a captured GitHub delivery exists, the acceptance entry
refreshes it once and opens confirmation against the returned Card revision.
No captured delivery requires no remote query. The button shows a loading indicator
while refreshing; stale/error information remains visible in confirmation without
adding an artifact-verification acceptance gate. Browser request observation found
one refresh-github request and no accept/start request; the dialog displayed PR #2
as merged with a fresh query time and an enabled explicit confirmation. The test
closed the dialog without accepting. Typecheck and lint passed.

PR state now uses the same compact icon/status chip in Round headers and acceptance
confirmation, including purple for merged. The user removed query timestamps from
both visible content and hover text; refresh still occurs before confirmation and
stale/error signals remain. Browser inspection confirmed matching merged-chip color,
icon and text in both locations and no query-time line in the dialog.

## Pre-merge accepted-output handoff correction

PR readiness review found a mismatch introduced by the accepted verification policy:
a valid report could be accepted with warnings but still have no `outputRef`, while
later Actions injected only reports with that reference. The live accepted Action 3
record demonstrated the gap. Acceptance now writes an explicit handoff document
atomically with the decision. Legacy missing references are restored before a later
Action starts; original reports, warning statuses and decisions remain unchanged.

Two regressions verify actual handoff file contents and their inclusion in the next
transport request, including legacy recovery without rerunning the prior Agent.
Action 4 was already running when the fix was made; its dispatched context was not
rewritten or interrupted. This is a bounded handoff fix, not the deferred shared-log
architecture implementation.

## Action 4 efficiency assessment during execution

At 17:15 UTC on August 31, Action 4 had run for approximately 26m07s and was
still executing its final acceptance tests. Its public progress records at
17:12:44 and 17:13:05 report that a constructor-argument-order compilation fix
had been omitted from the published commit. The Agent corrected the omission,
pushed `e8e757d`, and repeated lint/build/acceptance against the final head.
At 17:13:46 it reported that acceptance testing was still in progress.

The user agreed to record two separate judgments: delivery outcome was not yet
established at this checkpoint; execution efficiency and the amount of attention
required from the user were below expectations. A later passing result must not
erase the avoidable repair/publication cycle or the user's repeated status queries.
Do not attribute all elapsed time to necessary simulator work or to model choice
without separating those costs from implementation and orchestration failures.

The final six-Action review should include avoidable retries, repeated validation,
waiting time and concrete user interventions alongside functional acceptance.
Count interventions from recorded events rather than inventing a total. This is an
in-progress assessment, not the final Action result or a decision to cancel it.

## Action 4 completed: resolved attempts are not current findings

Action 4 ended at 17:17:39 UTC after 28m38s. Its report marked all six LOC criteria
passed and reported nine executed tests. The additional-check list nevertheless
contained three failed attempts explicitly described as repaired: lint formatting,
constructor argument order during the generic build, and a duplicated local
variable during UI-test compilation. It also listed absent GitHub checks as
not-run despite the agreed local gates having passed.

The user confirmed the distinction: final required results belong in acceptance;
only unresolved, decision-relevant additional findings belong in the additional
section. Resolved failures/retries belong in logs and the efficiency retrospective.
No configured GitHub checks is not itself an acceptance gap when remote CI was not
a declared requirement. An empty additional-findings section should be omitted.

Preserving evidence does not require displaying every historical failure as a
current warning. Keep original attempt outcomes and their resolution references,
without erasing the wasted time or relabeling failed commands as successful.
This update records the rule only; it does not rewrite Action 4's saved report,
accept the Action, merge its PR or implement automatic classification.

## Six-Action trial acceptance closed by explicit user decision

The user explicitly accepted the existing simulator-validated MVP and stated that
physical-device testing was unnecessary despite the original Plan wording. At Card
revision 59, TRIAL-01 through TRIAL-03 were recorded as user-decision passes for
this limited acceptance scope; their original observed results remain not-run.
TRIAL-04 already recorded the user's positive verdict and remains passed. No real
phone/two-box observations or experience comparison were fabricated.

Action 6 was then explicitly accepted and received an accepted-output handoff.
All six Actions are now accepted. This operation added no Agent run and performed
no GitHub merge. The completed workflow is the user-approved simulator scope, not
proof that the original physical-device trial occurred. The end-to-end evidence
is now available for the agreed overall retrospective, including dispatch design,
context continuity, execution cost, user intervention and acceptance UX.

## Final statistics reconciled

The final statistics include 13 executions (12 current plus one pre-reset attempt)
and two planning runs. Counts are deduplicated by run ID across revision history.
The separate report records exact token totals, run durations, acceptance scope and
verified merged PRs, and distinguishes original host failures from product outcomes.
No complete primary-assistant, review-session or human-time accounting is claimed.

## Retrospective direction: a coordinator owns continuity

The user identified the missing coordination role rather than attributing the
entire trial to worker-model capability. The agreed direction now has a dedicated
[proposal](EXECUTION_COORDINATION.md): retain planning understanding, translate
input, dynamically select context and reusable evidence, scope the worker's work,
and qualify/filter its result before presenting it. Raw log retention, bounded
summaries and evidence provenance support that role; they do not replace it.

First improve reliable stepwise delivery and acceptance, with host-driven live
status and direct stopping. Do not make live bidirectional Session correction a
prerequisite; it is deferred. Scope and validation scenarios are recorded, but no
runtime architecture or model-routing implementation was changed in this step.
