# Just Do It

## Status and document ownership

Design discussion captured on 2026-08-29. Just Do It retains an isolated
[interactive UI demo](JUST_DO_IT_DEMO.md) alongside the live workflow.
On 2026-08-30, the user accepted the UI direction and froze its interaction
baseline. It remains available in explicit Preview Mode while Harness contracts
are discussed; real integration and task validation are subsequent work.
The subsequent 2026-08-30 Harness discussion settles the planning/reopening
boundary and user decision authority below. These rules supersede older intent
where noted; the frozen demo has not been updated to enforce them.
An offline [Harness foundation](JUST_DO_IT_HARNESS.md) now provides phase prompts,
request/result validation and a file-backed Card worklog. The subsequent
[Planning integration](JUST_DO_IT_PLANNING.md) connects real read-only generation,
adjustment and Finalize while retaining the isolated Preview. The first
[Action execution integration](JUST_DO_IT_EXECUTION.md) adds project-file coding,
durable outputs, feedback rounds, and explicit user acceptance. Card-owned local
Git checkpoints now record a baseline and each execution round without touching
the delivery repository's staging area. GitHub repository discovery, output PR association, and explicit state refresh are
connected. Each Card now owns a persistent worktree; explicit backup-first restart
is available for failed unaccepted Cards. Agent review, merged-delivery reversal,
and Todo publication remain unconnected.
Repository creation and PR publication remain instructions-driven execution,
not automatic host operations.
This document records the
settled product intent and explicitly separates unresolved mechanics and
deferred ideas. It does not authorize implementation or data migration.

This document owns the Just Do It workflow. [DECOMPOSITION_MODEL.md](DECOMPOSITION_MODEL.md)
owns the shared Formal Node and independent-operation model. [ROADMAP.md](ROADMAP.md)
owns deferred work, including the exploratory local Git versioning proposal.

## Purpose and boundary — settled

Just Do It helps a user turn a goal they believe is feasible into concrete,
verifiable progress, even when they do not know how to begin or which foundations
are necessary. Agent reasoning should uncover missing prerequisites and carry
most execution complexity rather than only execute a checklist supplied by the user.

- What's Next makes an idea concrete.
- Break It Down exposes coherent, manageable parts of a scope.
- Just Do It works out how to accomplish a selected goal under actual conditions.

These are independent choices, not mandatory pipeline stages. A Formal Node
from either exploration workspace may enter Just Do It directly. The original
Node keeps its identity and meaning; implementation does not move it out of its
source workspace or add execution/PR states to its lifecycle. A lightweight
associated completion indicator is permitted without changing that lifecycle.

Focus the first workflow on the user's GitHub-backed software projects. GitHub
provides code-delivery and review evidence; this does not select the separate,
deferred App-managed local Git versioning architecture. Other domains motivated the general
Input / Process / Output / Validation model, but domain-specific execution,
verification, and reversal are not part of the present design scope.

## Card, Plan, Action, and Round — settled concepts

The outer workspace is card-based. Users explicitly add goals they want to
work on. A goal Card retains its recognizable title, such as "Run an operable
local website skeleton", and communicates overall progress.

Inside that Card is a goal-specific workspace or Canvas:

- A Plan describes the execution route. The discussed layout places the Plan
  in a distinct area, potentially on the left; exact geometry is not settled.
- Each Plan item corresponds to an Action: one user-understandable, verifiable
  delivery unit.
- A Round is one attempt or exchange within an Action. Feedback and another
  attempt do not create another Action.

The user experiences an ordered progression. Technical dependencies and internal
substeps need not become a second large dependency graph in the goal's Canvas.
"Prepare the development environment" may cover runtime installation, dependency
setup, and scaffolding while presenting one usable environment for acceptance.

Granularity is relative. Actions may be finer or coarser; additional substeps
remain owned by the original Action. There is no required one-command,
one-session, or one-PR correspondence.

## Goal dashboard and source association — settled

The outer workspace is an operations dashboard, not a third product relationship
graph. It manages goals explicitly added from What's Next or Break It Down.
Each goal Card summarizes its title and purpose, delivery progress, current
Action/activity, and associated Git work or GitHub PRs. Opening it reveals its
Plan, completed and remaining Actions, outputs, and verification details, with
controls for assigning work and giving feedback to an Agent.

Prioritize understanding progress and what requires attention: a new output,
pending review, or a need for user input. Dependencies remain visible when relevant,
especially when they prevent execution, but do not dominate the dashboard.
Exact grouping, filtering, visual layout, and branch/PR presentation remain open.

Associate PRs and their actual state with the Actions they concern, then summarize
them on the goal Card. One merged PR does not necessarily complete the entire
goal. Branch, commit, and PR mappings must describe actual work, not imply an
enforced one-Action/one-PR rule.

### Stable source content, independent lifecycles

Adding a goal establishes a link to the source Formal Node and retains the
goal content and necessary input context for the execution workspace. It is not
a second independent product Node, nor a live mirror of mutable source content.

Under the agreed product model, accepted Formal Node content is stable through
normal in-app operations. There is no ordinary source-update synchronization
flow in this MVP. Do not add "source changed, update your Plan" prompts merely
because someone could edit output.md outside the App. Recording an execution
baseline identifies what the work is based on; it does not imply expected source
edits. User additions and Plan/Action revisions belong inside Just Do It and
do not rewrite the source Node.

Source existence and execution lifecycle are independent:

- Deleting the source Node is allowed and must not cascade into deletion of
  its Just Do It goal, Plan, Actions, progress, or outputs.
- Mark the retained goal "Source node deleted" and make the unavailable source
  navigation explicit. Retain readable goal content and necessary context rather
  than leaving only a broken reference. The retention mechanism is not yet chosen.
- Deleting or abandoning Just Do It work does not delete the source Formal Node.
  Action rollback is a separate execution concern, not source-node deletion.

### Completion feedback on the source Canvas

When the associated Just Do It goal is complete, a surviving source Node may
show a small green dot or short Completed annotation. This is a read-only
associated execution result, not a new Node state: the Canvas retains its
Loading/Candidate/Formal presentation model, and the source remains Formal.
Do not introduce a Completed Node lifecycle state or mirror the full execution,
review, or failure state machine into What's Next or Break It Down.

If the source has been deleted, completion does not recreate it. Clicking the
completion indicator to open the associated Just Do It workspace is a deferred
UI convenience, not a prerequisite for the initial workflow. Exact appearance
and behavior for multiple execution attempts remain to be decided.

## Form the Plan before execution — settled

The Agent generates a proposed Plan; the user reviews, guides, and approves it.
Planning is not a questionnaire or a recurring request for permission to suggest
a route. Put the Agent's recommended execution arrangement directly into the
Overview and steps, then incorporate explicit user feedback into the current
draft. Product direction is supplied by the source goal and earlier exploration;
do not add a routine direction-clarification gate inside Just Do It.
The user decides whether the Plan is satisfactory, not an Agent-defined quality
score or completeness threshold. Technical response validation may check that
the result can be represented safely; it must not substitute for user sign-off.
The confirmation unit is the entire Plan, never one step at a time. Before
confirmation, show an Overview and individually browsable planned steps,
not executable Action cards or a long response duplicated by a second step list.
After explicit whole-plan
confirmation, those exact contracts become the Actions together; do not ask
the Agent to reinterpret them into a second, potentially different plan.

Roughly five to seven meaningful steps is a useful comfort range, not a quota.
Three steps may be sufficient for a simple goal. If a goal needs many independent
deliveries, suggest narrowing its scope or returning to Break It Down rather
than overwhelming the user with a dozen steps or hiding the complexity inside
oversized Actions.

Planning combines:

- the selected Card's goal, documents, and relevant graph context;
- customized input such as desired style, features, local/network access,
  dark mode, or interface languages;
- actual available resources, environment, and delivered prerequisites.

The Agent should identify what is already available and what is genuinely
required, not impose a generic preparation checklist. A local website skeleton
does not automatically require a database or every future feature.

Planning has distinct screens:

1. Adding a goal opens its otherwise empty work area with a centered Start Plan
   entry: fixed source context, user input, optional extra Resources, Agent,
   model, reasoning effort, and one primary start action. There is no empty
   Action rail or pre-created execution work to manage.
2. Starting replaces that entry with a Loading state, rather than appending a
   response under the original form.
3. Generation reveals a clearly unconfirmed Plan Preview. A short Overview is
   the default reading level. The left side lists step titles; selecting a step
   reveals only its input, expected output, and validation detail.
4. The user describes adjustments to one step or to the whole Plan. Requests
   such as "three steps feel too broad; make them four" belong to whole-plan
   feedback. The Agent supplies new step definitions, inputs, outputs and
   validation; do not offer a manual Add step form that makes the user author
   those contracts. Scoped changes preserve unrelated steps. No full-response
   reading is required.
   A single-step adjustment loads only that step's detail pane. Keep the Plan
   list, selection, and surrounding layout mounted; other steps remain browsable.
   Do not replace the entire preview with a loading screen for a scoped update.
5. Confirming the entire Plan finalizes those step contracts and enters the
   execution-ready Action workspace.

Planning retains only the current draft. Do not save or expose planning response
history, revision numbers, or Git checkpoints. This supersedes the earlier
response-history proposal; it does not remove execution Action output history.
Internal work records may retain original user feedback and concise planning
decisions for handoff. They are not a planning-version browser or a requirement
to store every full draft snapshot.
The information is organized by reading depth, not duplicated in a giant
Markdown response and a second Plan form. Extra Resources become planning and
execution inputs; their presence does not authorize unrelated work.
The exact Harness and provider-call orchestration remain later design work.

Each Action's primary content is Input / Output / Validation. Processing is
the temporary activity between input and output, not a required content panel:

| Element    | Meaning                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Input      | Goal, evidence, prerequisites, constraints, and user feedback needed to act.                            |
| Output     | A concrete deliverable or an honest Response explaining partial progress, failure, or a need for input. |
| Validation | The means and evidence for deciding whether the agreed outcome was achieved.                            |

Output can contain multiple related artifacts, a link and summary, or an
explanation. It is not restricted to one file or a successful result. Preparing
an environment, for example, produces a usable environment; version/startup
checks are evidence, not a substitute for the outcome.

Explicit requirements, assumptions, and deferred ideas should be distinguishable.
The Plan is adjustable during planning, not a guarantee that execution will
reveal no surprises. Reopening it follows the boundary below.

Before execution, Output means expected delivery. After execution, display the
actual artifacts and evidence separately so an intended outcome cannot be
mistaken for completed work. Inputs can describe relevant functionality, project
context, and constraints without enumerating filenames; the Agent discovers the
implementation details. Outputs describe user-observable capabilities, not a
mandatory inventory of code files. Keep implementation detail and evidence in
the PR or linked artifacts, with a concise summary and entry point in the UI.
Semantic clarity matters; exhaustively specified technical detail is not a
prerequisite for user approval. The Agent owns the detailed handoff contract.

### Finalization and reopening — settled boundary

- Finalization accepts the complete Plan and permits the manual execution flow;
  it is not permission to revise the development Plan throughout execution.
- While no step has produced an output, the user may reopen the Plan, including
  after finalization. Stop active execution before editing. The changed Plan
  needs whole-plan confirmation again before execution resumes.
- Once any step has produced an output, including an unaccepted output, do not
  edit current or future Plan steps in place. If the overall Plan is no longer
  satisfactory, first restore the entire Plan's execution work to a clean
  pre-execution baseline, not just the selected step.
- Reopen planning only after that restoration is confirmed. Resetting UI states,
  deleting output records, or canceling a process does not establish restoration.
- Corrections to implementation within the current Action's accepted scope stay
  in its feedback loop. Internal technical substeps do not create a new Plan.

This supersedes the earlier proposal to edit remaining Plan steps while simply
preserving completed Actions. A deliberate full rollback withdraws the current
execution result; it must not silently leave reverted deliveries marked accepted.
What counts as an output for partial/failed attempts, and how to restore local
and external effects safely, still require implementation decisions below.

### Example: prepare the development environment

For a Plan that has agreed Next.js, TypeScript, and npm:

- Input: the already registered project directory, source output.md, confirmed
  Plan, technology choices, user requirements, and restrictions on global tools
  or unrelated files. Inspect and preserve existing work; do not ask for a new
  repository name or create a second directory by default.
- Expected output: a runnable local website with a minimal homepage and repeatable
  startup instructions, delivered through a PR. The Agent determines the necessary
  package/configuration files and records those technical details in the PR.
- Validation: follow the instructions to install and start the project, open
  the homepage without blocking errors, pass agreed type/build checks, check
  that database or real-Agent integration was not added outside scope, then
  review and merge the PR under this Action's acceptance agreement.

Actual delivery should link to the runnable preview and PR when available,
with commands and implementation evidence accessible on demand, not merely
repeat the expected-output description. This is an illustrative Agent-prepared
contract, not a user-authored form or proof that any setup has run.

## Agent and model configuration — shared direction

Agent selection and model selection are distinct. Planning, execution, and
verification may use different Agent/model/reasoning-effort configurations,
with defaults so users do not have to reselect them every round. A stronger
planning configuration and a lighter execution configuration is a hypothesis
to validate against quality, rework, and overall cost, not a guaranteed saving.

This is a shared invocation capability for all three workspaces. Real integration
must validate provider/account capabilities and record requested configuration
and actual model information when available. It must not silently substitute
models or imply that changing provider can resume another provider's session.
Live Planning reads model catalogs from the local Codex app-server `model/list`
endpoint and Claude CLI initialization response. The model dropdown uses provider
IDs and display names, and its effort options follow the selected model's reported
capabilities. Changing Agent or selecting another model resets effort to the
provider default; reading a catalog does not silently change a saved selection.
Agent default and explicit custom-model entry remain available when discovery
fails or a model is absent from the catalog. A returned catalog is not a guarantee
that a later request will be authorized or succeed.

Discovery sends initialization/catalog requests only, never a user prompt or
generation turn. It has bounded output, pagination and timeout, cleans up its
child process, and shares a short per-Agent cache. It does not modify local CLI
configuration. Preview selectors remain fictional demo profiles. Per-role
defaults, full cost reporting, and continuation behavior remain future work.

All Agent-selection surfaces use the shared `AgentProfileSelector`: What's Next
initial exploration, combination and refinement; Break It Down requests; and
Just Do It planning, execution-preview and review-preview forms. The preview
adapter supplies fictional choices without catalog requests. Real graph-module
requests forward model and effort to the local CLI and retain the requested
profile in the Run and request artifact. Matching profiles preserve existing
continuation rules; changed model/effort selections use a fresh provider Session
with the normal source context, including when returning to Agent default.

## Manual execution and validation loop — settled

1. The user agrees the Plan and starts an Action with its prepared Input.
2. The Agent processes the request and returns an Output, such as a draft PR
   with a concise summary and any necessary explanation of changes.
3. The workflow pauses at the Output so the user can inspect it or choose how
   to validate it.
4. The user can validate directly, ask a Review Agent, or combine both.
5. Review feedback becomes the next Input to the same Action. The execution
   Agent makes corrections and returns a new Output for another validation.
6. The Action completes only when its agreed completion condition is met.

For the software example, a Review Agent can leave findings directly on the
associated PR, and the execution Agent can read those findings without the user
manually relaying them. Creating the PR or receiving a favorable review is not
the same as merging it. In the discussed merge-based configuration, Verified
means the PR has merged; a manual GitHub merge should be reflected locally.
The synchronization mechanism is not yet selected.

Verification is configurable. An Agent claiming success does not by itself
certify the Action. Evidence belongs to the particular output being inspected.
Full automatic review, correction, merge, and next-Action execution are deferred;
they are not implied by accepting this manual workflow.

### User acceptance and evidence — settled authority

The user has final say on whether the current result is sufficient. The Agent
reports delivered behavior, unfinished requirements, checks, risks, and options
for correction or follow-up. It does not veto acceptance merely because its
preferred level of completeness has not been reached. A user may explicitly
accept a partial result without rewriting the finalized Plan in place.

When the user accepts the Card's overall result as sufficient, it may finish
with remaining work recorded as Todos/Issues and later child Nodes. Do not
require every initially imagined feature to be implemented before closure or
pretend deferred steps ran. New work follows the source Node into a later Card.
Record acceptance and technical evidence separately: accepting a result does
not turn failed tests into passing tests, a favorable review into a merge, or
unfinished features into delivered features. Preserve what the user accepted
and any remaining limitations. The exact mapping from explicit partial acceptance
to configured merge conditions and downstream readiness remains to be agreed;
neither an implicit waiver nor a new permission for external writes is intended.
Agent self-checking is preparation for review, not user acceptance by itself.

## Harness responsibilities and handoffs — agreed direction

The Harness coordinates four kinds of Agent work: planning, Action execution,
verification, and Todo organization. This is not a requirement for four providers,
four persistent Sessions, or four new UI surfaces. The system owns lifecycle
transitions, version association, and execution gates rather than relying only
on instructions to the Agent. The next Action is unlocked after acceptance of
the previous Action; unlocking does not automatically start it.

The handoff mechanism is Agent-facing, not a form the user must fill:

- Planning to execution: the exact signed-off goal, step scope, user requirements,
  constraints, relevant source context, and available prerequisite deliveries.
- Execution to verification: the actual versioned output/PR, delivery summary,
  self-check evidence, and unresolved items. Review targets that output version.
- Verification to correction: findings, evidence, and the user's direction,
  associated with the same Action and output rather than a new goal.
- Feedback to follow-up: the original intent, relevant context, and source
  association needed to create an Issue or later develop a task Node.

These are semantic responsibilities, not a finalized JSON schema. Use concise
UI summaries and artifact/PR links; the Agent handles detailed discovery and
technical exchange without making the user read an entire transcript.

### Execution Session continuity — default direction, integration open

Prefer one execution Session across the sequential Actions of one goal and
formal Plan, pausing at each output/acceptance boundary. Corrections may continue
that Session. Session reuse is not an uninterrupted autonomous run or authority
to start the next Action, create external records, or merge without permission.
The Plan, artifacts, actual repository state, and acceptance evidence remain
recoverable outside the provider conversation, so another capable Agent can
continue. Aim for comparable accepted outcomes, not byte-identical code.

Provide current Action instructions, new feedback, changed state, and references
to relevant deliveries rather than reinjecting the complete conversation every
time. Do not assume resume makes accumulated input free or guarantees a specific
cost reduction. Provider-specific continuation, model changes, context rollover,
recovery, and measurable cost accounting remain integration work. Separating
planning from execution and using a fresh review Session are proposed defaults
to evaluate, not already implemented runtime behavior.

### Working instructions and local Skills

The project-level Working instructions entry applies to all Just Do It Cards
in that project, not to other modules. Its optional editor starts empty and
stores only user-authored instructions, including local Skill choices, reading
locations, development conventions, and optional Skill conflict handling.
Saved content is preserved verbatim, including previously saved default text;
the user can replace or clear it. Each new planning run captures the current
instructions without changing an already running request.

Common workflow rules live in the Harness as built-in instructions, separate
from this editable field. Clearing custom instructions does not remove them.
The three input layers are module work methods, signed-off Plan scope, and
current Action feedback. These do not replace host permissions.

Execution and verification should be able to use relevant installed development
and review Skills. Action scope and user decisions define the desired outcome;
Skills supply professional methods. Select and load them in the appropriate
Session without inventing a new user-facing technical configuration workflow.
The Agent can locate and read Skills as directed by Working instructions; a
Harness-owned Skill registry or loader is not required for this approach.
Actual provider access and Skill use still require runtime validation. Some
Skills include PR/Issue/merge or autonomous
continuation behavior: their lifecycle and permission requirements must be
reconciled with this manual loop, not silently invoked as extra authority.

## State model — behavior agreed, exact schema open

Three delivery stages are useful presentation anchors:

- Ready to Start: inputs are prepared and execution can begin.
- Ready to Verify: a deliverable is available for acceptance.
- Verified: the agreed completion condition has been met.

These three labels are not a complete state machine. Processing and Verifying
must also be visible while work is active. An execution failure, a blocked
Response, a failed verification, and cancellation need distinguishable outcomes.
The exact enums, wording, and whether stage/activity/result are separate fields
remain open; do not treat a previous conversational sketch as a frozen schema.

Required transitions and invariants:

- Finishing a Run does not imply completing an Action.
- An error or blocked attempt cannot be promoted to Ready to Verify merely
  because the process stopped.
- Failed verification preserves the Output and findings. A user-requested
  correction can go directly into Processing without repeating initial setup.
- The manual loop waits for user direction after unsuccessful verification;
  it does not silently start another correction run.
- Failure or missing input can end a Round without permanently ending the
  Action. The user can provide feedback, retry, or cancel.
- Existing outputs and feedback remain understandable across repeated attempts.

## Todo and execution-time changes — settled intent

An Agent-maintained Todo captures newly discovered ideas and user requests that
were not included in the current delivery agreement. It is primarily a place
for "later, in a more suitable round", not a bucket for unmet acceptance criteria.
Relevant Todos can inform later planning or execution context.

For example, a user may think of keyboard shortcuts while the website skeleton
is being built. Record that idea without expanding the current Action. An issue
that prevents the agreed outcome is a current blocker, not something that can
be silently moved to Todo to declare success. The user can explicitly accept a
limited result with that limitation recorded, as described above.

Necessary small adjustments can be made within the Action's authorization and
scope, with an explanation in the Output. The discussed example is a bounded
dependency-version bump required to complete the work. This does not authorize
arbitrary cross-repository edits, shared-environment changes, or major upgrades.
When scope or required authority changes, return the problem and options for
discussion instead of silently expanding the Action.

Internal substeps retain their original Action ownership. Adjusting the overall
Plan after any output requires the full rollback described above; a Todo is not
a way around that boundary. The GitHub-backed storage direction below supersedes
the earlier generic local-checklist concept.

### GitHub Issue-backed Todos — agreed direction for this scope

There are two entrances to one Agent-assisted workflow: an explicit place to
capture a user's new idea, and a follow-up discovered during Validation. The
user describes the request naturally, such as adding multi-device login later;
the Agent organizes its Issue title, body, deferral context, source links, and
open questions. Do not make the user fill title/reason/acceptance fields to
record an idea. Attach the relevant goal, Action, available output, and review
context automatically, preserving the user's original words.

A validation-discovered inconsistency or extra scope can be proposed as a
follow-up only when deferral is appropriate. Recording it must not silently
waive a blocker or mark the current Action verified. Issue formation is a
collaboration/response flow, not a manual metadata-entry form.

Successful creation closes the input composer automatically and shows a brief
non-modal notification. Do not require reading a second result dialog or clicking
Done. With real integration, the notification can link to the created Issue;
the demo only reports a local Todo and must not fabricate a GitHub link.
Failures or clarification needs should retain the input for continued work.

The local Todo section is a lightweight GitHub-style index: title, short summary,
Issue number, labels, status, URL, and minimal association identifiers. Complete
Issue content and contextual discussion belong on GitHub, not a second local
detail viewer or duplicated context store. Open the external Issue to read more.
Do not add local close/reopen controls merely to reproduce GitHub management.

A Todo is a capture entrance, not a second full task-management hierarchy. The
intended follow-up path is Todo/Issue to a new task Card under a selected parent
Node, then explicit import into Just Do It. Users may instead go directly to
What's Next, expand the source with a smaller goal such as dark mode or
localization, and import it without creating a Todo first. Retain Issue and
source associations when promoting a Todo; do not automatically expand the
current Plan. Promotion remains deferred with no implementation in this round.

Validation feedback that improves the current delivery remains in the same
Action's correction loop. Only newly introduced, out-of-scope work is deferred;
when that classification is ambiguous, ask instead of silently postponing a fix.
Creating a Todo does not change the accepted Plan or count as delivery progress.

For the GitHub-focused workflow, use Issues as the Todo authority rather than
maintaining a separate independent checklist. An Issue should describe the
request, original feedback where useful, why it is deferred, its future outcome,
and its originating goal, Action, output/review round, and PR when available.
Use a todo label and a stable node identifier label for discovery; retain the
repository/Issue identity and stable source association independently of labels.
The proposed exact naming convention is not a permanent identifier contract.

Agents can maintain these records and retrieve relevant Issues for later plans.
Open/closed state should reflect GitHub when integrated. Recording an Issue
does not start implementation or add it to the current Plan automatically.
Real creation, permission handling, deduplication, failure recovery, and sync
remain unimplemented; the UI currently simulates Issue metadata and state only.

## Prerequisite delivery contract — settled

A dependency serves both as a prerequisite before execution and as an input
source after the prerequisite has been delivered. For goal A depending on B:

- A can be inspected, added to Just Do It, and discussed before B is complete,
  but execution of A is blocked while B remains unmet.
- Show B as an unmet prerequisite with a navigation entry. Do not automatically
  add or execute B on the user's behalf.
- B is complete when its agreed delivery has been verified, not when its
  Agent Run ends or its Formal Node is accepted in another workspace.
- Once B is complete, its actual delivery becomes an input to A's planning
  and execution.
- Reconcile any provisional Plan for A against B's actual delivery before
  allowing A to execute.

A's conditional prerequisite-input section displays B's fulfillment status, delivery summary,
artifact locations and versions, necessary usage instructions or limitations,
and verification evidence links. It links to B without expanding B's complete
Plan and Actions into A's Canvas. Goal-level dependencies are managed outside
the internal plan; internal prerequisites are handled at their own granularity.

Do not combine source provenance, repeated requirements, branch metadata, and
prerequisites into a generic Context and delivery panel. Source content is
accessible beside the goal title, requirements belong in planning, prerequisites
appear only when present, and branch/PR references belong to Action output.

Use actual delivered artifacts, not just B's original description of intended
work. Provide bounded summaries and resolvable references with on-demand access
to more evidence, rather than injecting B's entire conversation, failed attempts,
or review history. Execution fulfillment belongs to Just Do It, not to the
Formal Node's product-meaning lifecycle.

## Progress and user feedback — settled intent

Each Action should expose an understandable result that the user can inspect
and react to. Completing small, meaningful units should make progress tangible
and inform later steps, not merely generate activity indicators.

The outer Card should communicate progress toward its goal. Exact progress-bar
weighting is open: Action count is not automatically proportional to effort.
Avoid equating time spent, number of Agent runs, or saved outputs with verified
delivery. Do not silently erase accepted work through a Plan edit; deliberate
rollback is the explicit exception and must reflect the withdrawn deliveries.

## Abandonment, deletion, and rollback — intent recorded, mechanics open

For software work, the user's requested deletion experience is to abandon an
Action and revert the changes attributable to it, with a clear explanation of
what deletion will reverse. Deleting only the tracking record is insufficient
for that intended experience.

This requires a reliable boundary around Action-owned changes. Isolation,
starting versions, commit attribution, uncommitted edits, external effects,
and interaction with other work must be designed before promising rollback.
Reversal of installed tools, remote changes, or already merged work cannot be
assumed to follow from deleting local files. Handling Verified Actions and work
already consumed downstream is unresolved. Do not silently discard user edits
or claim effects were reverted when they were not.

For reopening a Plan, clean means the execution-owned effects have actually
been restored to the agreed starting baseline while pre-existing user work and
unrelated changes remain intact. A partial or failed restoration cannot unlock
Plan editing. Git branches, worktrees, commit attribution, and reversal of
external effects are candidate mechanisms, not a promise that a hard reset
restores everything. This bounded rollback requirement does not select the
deferred product-wide Git storage migration.

The later ruling permits reverting already merged PRs within the same Card's
linear work through revert commits. Installed tools or caches need not all be
uninstalled; restore project-owned dependency declarations and usable project
state. Cross-Card cascading reversal is not allowed: if other Cards already use
this delivery, block local re-planning by rollback and return to What's Next or
Break It Down to organize new corrective work. Do not revert a prerequisite
under active downstream consumers.

Canceling a Run, abandoning an Action, selecting an earlier output, and deleting
history are different operations. Their exact UI and recovery policy remain open.

## Deferred: shared local Git versioning

The current pre-execution Plan draft is explicitly excluded from version-history
work: it is a lightweight current-state discussion. The proposal below concerns
artifact/version management across the product and execution outputs; it must
not reintroduce a planning-history UI or checkpoint store.

The proposed model is Git-native versioned work, not an additional audit log:
stable artifact paths, one saved version per output round, review of that
version, further commits for corrections, and selection of an earlier baseline
for another attempt. A commit records an output regardless of whether it passes
review. The same foundation could replace per-Run artifact copies in What's Next
and Break It Down as well as serve Just Do It.

This remains exploratory. Local Git is independent of GitHub; repository scope,
restore granularity, concurrent writes, runtime records, provider-session
alignment, and migration remain unresolved. See the
[deferred proposal](ROADMAP.md#deferred-proposal-shared-local-git-versioning).
Do not introduce this migration as a prerequisite for finishing the workflow
discussion, or assume it is already the selected implementation architecture.

## Remaining decisions before implementation

- Final state machine, transient/error presentation, retry and cancellation UX.
- Define output/side-effect detection for failed or canceled runs that changed
  files but never returned a deliverable; no-output must not imply no changes.
- Validation configuration and explicit partial acceptance: how user acceptance,
  merge-based completion, technical evidence, and downstream readiness interact.
- Output/feedback history, Agent continuation, and binding verification to a version.
- GitHub Todo creation/synchronization, deduplication, and promotion into future work.
- Actual provider model availability, per-role defaults, and session behavior
  when model or reasoning configuration changes.
- Action isolation, safe deletion/rollback, and already delivered work.
- The clean Plan baseline and reversible-effect inventory, especially installed
  dependencies, shared user edits, published/merged PRs, and downstream consumers.
- Local Skill discovery and selection, provider compatibility, and resolution
  of Skill-driven authority or lifecycle conflicts with the manual Action loop.
- Dependency delivery/version selection, multiple prerequisites, and the effect
  of upstream execution changes after downstream work has begun. This concerns
  delivered work, not ordinary editing of the stable source Formal Node.
- Goal progress and source completion markers after an explicit full rollback.
- Whether one source Node can have multiple execution attempts and how their
  associated completion results would be displayed.
- Concrete MVP implementation scope and acceptance checks.

These are design questions, not authorization to add automation, a general
cross-domain execution engine, or a new storage architecture in this docs round.

## Active dogfooding review

The [HereItIsV2 rolling review](JUST_DO_IT_DOGFOOD_REVIEW.md) records verified
workflow findings while the user completes the Card. It is not final product
acceptance or authorization to expand implementation scope.
