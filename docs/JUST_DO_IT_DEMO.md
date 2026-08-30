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
- A newly added goal opens a centered Start Plan form, with no Action rail.
  Fixed source context, optional user input and extra text/Markdown files, and
  Agent/model/effort configuration lead to one start action. Generation replaces
  the form with Loading, then reveals Overview plus a numbered Plan Preview.
- Overview is the initial reading level; selecting a title opens just that
  step's input, output, and validation. Describe changes to one step or the whole
  Plan before confirming everything together. There is no manual Add step form:
  the website example supports asking to refine three steps into four through
  whole-plan feedback, generating the additional contracts automatically.
  Only the current draft
  exists: no planning response history, revision selector, or giant Markdown
  response duplicating the steps. Execution output history remains unchanged.
- Extra resources reuse ContextAttachmentPicker: a collapsed section with
  Context Library selection and local drag/drop/browse, not a separate importer.
  The library is fictional demo material; no real project library is accessed.
  Local files and selected library content share the same current planning inputs.
- Extra files are read into tab-local memory, limited to five .md/.markdown/.txt files,
  256 KB per file and 1 MB total in UTF-8 bytes. No upload endpoint or filesystem
  persistence is used. tests/fixtures/planning-boundary.md is a safe test input.
- Single-step adjustment preserves the left Plan list and its selection. Only
  the selected detail pane gets a loading overlay, keeping its height stable;
  other steps remain browsable while confirmation and edits wait for completion.
  Its simulated delay is 10 seconds to allow manual switching tests; whole-plan
  generation keeps its shorter delay.
- Planning, execution, and review reuse an Agent/model/effort selector. The model
  choices are explicitly fictional profiles, not discovered account capabilities.
  Output and review records retain the requested profile without invoking providers.
- Action content uses Input, expected Output, and Validation; Processing is only
  an activity state. The development-environment sample names concrete files,
  restrictions, startup instructions, and acceptance evidence.
- A compact Source control beside the goal title opens retained source content.
  Requirements stay in planning rather than being repeated in a generic context
  panel. Prerequisite deliveries appear only for goals with dependencies, above
  their plan or Action as input; branch and PR metadata belong to Action outputs.
- The prototype uses provisional stage/activity/result presentation, not a
  finalized production state schema. No real rollback, import, source deletion,
  merge, or completion propagation is performed.

## Manual acceptance scenarios

| Scenario                 | How to try it                                                                                                                     | Expected behavior                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review loop              | Open the website-skeleton goal and simulate review of its second Action.                                                          | First-round review requests changes; merge remains unavailable.                                                                                                           |
| Correction               | Add feedback, simulate correction, and simulate review again.                                                                     | A second output appears in the same Action; feedback and prior output remain available. Review passes but does not complete the Action.                                   |
| Explicit acceptance      | Simulate PR merged after successful review, or select manual review for a deliverable without unresolved findings.                | Only the selected Action becomes Verified; no automatic execution of the next Action.                                                                                     |
| Earlier output           | Open History after a correction and select round 1.                                                                               | Earlier output remains readable; review and merge target the latest version, with an explicit notice.                                                                     |
| Work continues elsewhere | Start a simulation and return to the dashboard or another goal.                                                                   | Result returns to the originating Action, not the newly selected Card.                                                                                                    |
| Cancel                   | Start execution and cancel while the spinner is visible.                                                                          | Attempt ends without a new output; late results cannot overwrite the canceled state.                                                                                      |
| Failure and retry        | Open the repeatable-checks example or select Execution failed in Demo scenario controls.                                          | Failure leaves previous output intact; retry can return a new output without creating another Action.                                                                     |
| Missing input            | Open the startup-notes example, or select Needs your input as the next execution result.                                          | Explain the missing runtime requirement; allow input and retry.                                                                                                           |
| Unmet goal dependency    | Open the AI-integration goal before the website goal is complete.                                                                 | Planning remains available, but execution is blocked; the prerequisite links to its goal.                                                                                 |
| Delivered dependency     | Finish the website goal, then confirm the AI-integration Plan.                                                                    | Waiting notice clears; actual demo delivery summaries and version references appear as input context.                                                                     |
| Initial planning         | Add the library's sample goal, provide requirements, simulate Generate Plan, inspect/edit contracts, and confirm the whole draft. | No Actions exist before confirmation; exact approved inputs, outputs and validation become Actions together.                                                              |
| Plan adjustment          | Open a planned step and adjust its boundary, or adjust the whole Plan and try the shorter example.                                | Only the current draft changes; unrelated steps remain intact. No response history is stored or displayed.                                                                |
| Draft continuity         | Type Action feedback, switch to another Action or goal, then return.                                                              | Feedback stays associated with its original Action while the route remains mounted.                                                                                       |
| Retained source          | Inspect startup notes, or use Simulate source deletion in the retained-source dialog.                                             | Goal, input context, Plan, outputs and progress remain; source is marked deleted.                                                                                         |
| Completed goal           | Open the appearance example.                                                                                                      | All Actions are verified; the UI explains the associated source completion marker without changing real Canvas nodes.                                                     |
| Todo                     | Use the explicit idea entrance or an optional validation follow-up; describe the request naturally.                               | The demo organizes the Issue and captures source context automatically, then returns a read-only result. No metadata form, real Issue creation, or delivery-state change. |
| Search and empty results | Search for an unmatched phrase, then clear filters.                                                                               | An explicit empty state provides a return path.                                                                                                                           |
| Reset                    | Use Reset demo and confirm.                                                                                                       | Only in-memory examples reset, including pending simulations and selection.                                                                                               |

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

The Plan generator is deliberately scripted. It retains current guidance but
does not claim to interpret arbitrary input. For the three-step website sample,
the suggested "3 步有点少，可以细化成 4 步吗？" feedback splits interface work
into input/list and selection/feedback steps with prepared contracts. Repeating
it does not append duplicate steps, and it does not split already delivered work.
The shorter-plan scenario remains available under demo controls. These presets
demonstrate the interaction, not a real planning Harness.

Todo capture uses the same single-request composer from For later and from an
optional validation follow-up. A short organizing simulation records a sample
Issue and returns a read-only result. Users do not enter Issue title, deferral
reason, or acceptance metadata themselves. The multi-device-login example has
a prepared summary; arbitrary input retains its original wording without
claiming real AI interpretation. Closing the composer while it is working
cancels that local attempt. Source context is captured at submission, including
the existing output/review round when present; no round 0 or PR is invented
for an Action without output. Recording an Issue does not resolve review blockers.
There are no previous planning responses or draft snapshots. Model/effort choices and Issue
numbers are illustrative only. Runtime capability discovery, GitHub authority,
retry/deduplication, and shared configuration persistence remain future work.
