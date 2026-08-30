# Just Do It interactive demo

## Scope

This is a UI prototype for the workflow in [JUST_DO_IT.md](JUST_DO_IT.md), not
the execution Harness or a GitHub integration. Open any registered project's
`/projects/<projectId>/implementation` route or the Just Do It sidebar entry,
which is labeled Demo.

The route reads project registration for the existing shell only. Its goals,
source snapshots, Plans, outputs, commits, and PRs are fictional fixtures.
All demo interactions use client memory. There are no Agent, GitHub, graph,
filesystem, Git, or settings writes from this workspace. Reloading or leaving
the route resets it. A visible banner identifies these limits throughout.

Existing appearance and interface-language settings apply. Sample artifact
content remains Chinese regardless of interface language, like user content.

## Layout exploration

- The dashboard shows goal Cards, verified Action counts, attention filters,
  search, source identity, and illustrative Git/PR associations.
- Goal Cards have a fixed 240px height. Status stays at the upper right; titles wrap
  up to two lines without moving it. Description and current Action also have
  two-line limits; the progress region follows content without an automatic
  spacer. The footer groups branch/PR counts on
  the left and a Node alias with a source-navigation arrow on the right.
- The source link opens the corresponding module in a new tab, preserving the
  in-memory execution demo. `preview=implementation-source&node=<alias>` shows
  a clearly labeled, read-only sample Canvas focused on that fictional Node.
  These routes resolve fixtures before reading real graph data. Deleted sources
  show the deletion notice in the same footer position instead of a broken link.
- Progress reads "Plan progress / Completed N / M steps" and counts verified
  Actions, not PRs or source nodes.
- Directly below the progress bar, Current action names the first unverified
  Action being handled or ready to handle, or None when the goal is complete.
  It reserves two lines and truncates
  overflow; compact Cards remain equal in height regardless of content length.
- A goal opens a Plan rail and Action workbench. The workbench separates
  prepared input, output, review, and next-round feedback; the existing
  Markdown reader supports focused reading and optional annotation.
- A newly added goal instead opens whole-plan discussion. Its Action list is
  genuinely empty until the user confirms a generated draft. Planning supports
  requirements, full response history, feedback, editable step contracts,
  generation/cancellation/error simulation, and a shorter two-step variant.
- Planning, execution, and review reuse an Agent/model/effort selector. The model
  choices are explicitly fictional profiles, not discovered account capabilities.
  Output and review records retain the requested profile without invoking providers.
- Action content uses Input, expected Output, and Validation; Processing is only
  an activity state. The development-environment sample names concrete files,
  restrictions, startup instructions, and acceptance evidence.
- The Context and delivery panel keeps retained source material and fulfilled
  prerequisite deliveries accessible without embedding another execution graph.
- The prototype uses provisional stage/activity/result presentation, not a
  finalized production state schema. No real rollback, import, source deletion,
  merge, or completion propagation is performed.

## Manual acceptance scenarios

| Scenario                 | How to try it                                                                                                                     | Expected behavior                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review loop              | Open the website-skeleton goal and simulate review of its second Action.                                                          | First-round review requests changes; merge remains unavailable.                                                                                                       |
| Correction               | Add feedback, simulate correction, and simulate review again.                                                                     | A second output appears in the same Action; feedback and prior output remain available. Review passes but does not complete the Action.                               |
| Explicit acceptance      | Simulate PR merged after successful review, or select manual review for a deliverable without unresolved findings.                | Only the selected Action becomes Verified; no automatic execution of the next Action.                                                                                 |
| Earlier output           | Open History after a correction and select round 1.                                                                               | Earlier output remains readable; review and merge target the latest version, with an explicit notice.                                                                 |
| Work continues elsewhere | Start a simulation and return to the dashboard or another goal.                                                                   | Result returns to the originating Action, not the newly selected Card.                                                                                                |
| Cancel                   | Start execution and cancel while the spinner is visible.                                                                          | Attempt ends without a new output; late results cannot overwrite the canceled state.                                                                                  |
| Failure and retry        | Open the repeatable-checks example or select Execution failed in Demo scenario controls.                                          | Failure leaves previous output intact; retry can return a new output without creating another Action.                                                                 |
| Missing input            | Open the startup-notes example, or select Needs your input as the next execution result.                                          | Explain the missing runtime requirement; allow input and retry.                                                                                                       |
| Unmet goal dependency    | Open the AI-integration goal before the website goal is complete.                                                                 | Planning remains available, but execution is blocked; the prerequisite links to its goal.                                                                             |
| Delivered dependency     | Finish the website goal, then confirm the AI-integration Plan.                                                                    | Waiting notice clears; actual demo delivery summaries and version references appear as input context.                                                                 |
| Initial planning         | Add the library's sample goal, provide requirements, simulate Generate Plan, inspect/edit contracts, and confirm the whole draft. | No Actions exist before confirmation; exact approved inputs, outputs and validation become Actions together.                                                          |
| Plan adjustment          | Give whole-plan feedback, select the shorter example, and simulate revision. Compare response versions.                           | Earlier responses survive; historical responses cannot confirm the current draft. Existing delivered Actions are preserved when revising a previously confirmed Plan. |
| Draft continuity         | Type Action feedback, switch to another Action or goal, then return.                                                              | Feedback stays associated with its original Action while the route remains mounted.                                                                                   |
| Retained source          | Inspect startup notes, or use Simulate source deletion in the retained-source dialog.                                             | Goal, input context, Plan, outputs and progress remain; source is marked deleted.                                                                                     |
| Completed goal           | Open the appearance example.                                                                                                      | All Actions are verified; the UI explains the associated source completion marker without changing real Canvas nodes.                                                 |
| Todo                     | From Action feedback choose Track out-of-scope feedback as Todo. Supply a reason and expected future outcome.                     | A simulated Issue retains the goal/Action/round, labels, and metadata; no real Issue is created and Action progress is unchanged.                                     |
| Search and empty results | Search for an unmatched phrase, then clear filters.                                                                               | An explicit empty state provides a return path.                                                                                                                       |
| Reset                    | Use Reset demo and confirm.                                                                                                       | Only in-memory examples reset, including pending simulations and selection.                                                                                           |

The simulation waits approximately two seconds. Its results are deterministic,
not based on Agent reasoning: first-output review requests a correction, and
review of a subsequent output passes. Failures are injectable from the Action's
Demo scenario controls. No real PR URLs are fabricated; Sample PR opens a local
illustration explicitly labeled as nonexistent on GitHub.

## Verification and remaining limitations

Additional planning checks: cancel or inject an error without creating Actions;
retry with the same retained input; edit a proposed input/output/validation field
and verify that confirmation copies it exactly; change execution and review
profiles independently; close/reopen a sample Issue without changing delivery.
Current Action fixes continue through correction, not the Issue draft.

Run `npm run test:implementation-demo`, `npm run typecheck`, and `npm run lint`.
Reducer tests cover execution gates, review/correction/merge, late-result
rejection, failure recovery, source retention, completed-step preservation,
idempotent import, Todo/draft ownership, and concurrent Action results.

Human visual acceptance is still pending. In particular, evaluate whether the
Plan rail, output reading area, and verification controls feel natural together.
Current limitations are intentional: no real source imports or completion dots,
no durable persistence, no real Agent-generated Plan or model discovery, no Action deletion/rollback,
no Git history migration, and no external review/merge synchronization. Failed
attempts show their current Response; the History picker is output history,
not a complete durable run audit. Harness and integration design follow after
this UI exploration, not as hidden behavior of the demo.

The Plan generator is deliberately scripted. It records user feedback but does
not claim to interpret arbitrary instructions; direct contract editing and the
shorter-plan scenario make revisions explorable. Model/effort choices and Issue
numbers are illustrative only. Runtime capability discovery, GitHub authority,
retry/deduplication, and shared configuration persistence remain future work.
