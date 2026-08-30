# Just Do It

## Status and document ownership

Design discussion captured on 2026-08-29. Just Do It currently has a navigation
placeholder, not an implemented execution workflow. This document records the
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

The user and Agent first discuss a proposed Plan and adjust it before starting.
Planning combines:

- the selected Card's goal, documents, and relevant graph context;
- customized input such as desired style, features, local/network access,
  dark mode, or interface languages;
- actual available resources, environment, and delivered prerequisites.

The Agent should identify what is already available and what is genuinely
required, not impose a generic preparation checklist. A local website skeleton
does not automatically require a database or every future feature.

Each Action uses Input / Process / Output / Validation:

| Element    | Meaning                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Input      | Goal, evidence, prerequisites, constraints, and user feedback needed to act.                            |
| Process    | Work performed by the Agent or user; technical substeps can remain internal.                            |
| Output     | A concrete deliverable or an honest Response explaining partial progress, failure, or a need for input. |
| Validation | The means and evidence for deciding whether the agreed outcome was achieved.                            |

Output can contain multiple related artifacts, a link and summary, or an
explanation. It is not restricted to one file or a successful result. Preparing
an environment, for example, produces a usable environment; version/startup
checks are evidence, not a substitute for the outcome.

Explicit requirements, assumptions, and deferred ideas should be distinguishable.
The Plan is adjustable, not a guarantee that execution will reveal no surprises.

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
be moved to Todo to declare success.

Necessary small adjustments can be made within the Action's authorization and
scope, with an explanation in the Output. The discussed example is a bounded
dependency-version bump required to complete the work. This does not authorize
arbitrary cross-repository edits, shared-environment changes, or major upgrades.
When scope or required authority changes, return the problem and options for
discussion instead of silently expanding the Action.

Updating current or future steps does not reset completed work. Internal
substeps retain their original Action ownership. The user may abandon the
current attempt and return to planning when the overall approach is unsuitable.
Exact Todo storage, promotion, and plan-edit interactions remain open.

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

A's input/context area displays B's fulfillment status, delivery summary,
artifact locations and versions, necessary usage instructions or limitations,
and verification evidence links. It links to B without expanding B's complete
Plan and Actions into A's Canvas. Goal-level dependencies are managed outside
the internal plan; internal prerequisites are handled at their own granularity.

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
delivery. A later Plan change must not erase earlier completed work.

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

Canceling a Run, abandoning an Action, selecting an earlier output, and deleting
history are different operations. Their exact UI and recovery policy remain open.

## Deferred: shared local Git versioning

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
- Plan editing during execution and how newly necessary prerequisites surface.
- Validation configuration, who may accept, and external completion synchronization.
- Output/feedback history, Agent continuation, and binding verification to a version.
- Todo capture, visibility, and promotion into future work.
- Action isolation, safe deletion/rollback, and already delivered work.
- Dependency delivery/version selection, multiple prerequisites, and the effect
  of upstream execution changes after downstream work has begun. This concerns
  delivered work, not ordinary editing of the stable source Formal Node.
- Goal completion and progress presentation when the Plan changes.
- Whether one source Node can have multiple execution attempts and how their
  associated completion results would be displayed.
- Concrete MVP implementation scope and acceptance checks.

These are design questions, not authorization to add automation, a general
cross-domain execution engine, or a new storage architecture in this docs round.
