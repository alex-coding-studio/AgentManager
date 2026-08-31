# Execution Coordination — Protocol and Implementation Outline

Status: proposal for review. The [role and scope proposal](EXECUTION_COORDINATION.md)
is merged; the fields and implementation slices below are not runtime behavior or
a finalized API schema. This document narrows the next design decisions before
coding. First deployment remains Just Do It; mid-run steering is deferred.

## Exchange A: host context to coordinator

The host supplies an immutable reference to current task state plus a bounded
bootstrap summary. Detailed resources remain addressable instead of being copied
wholesale into every model request.

| Content                                                         | Purpose                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------- |
| Project, Card, Action, request ID and revision                  | Bind decisions to the correct task and reject stale results   |
| Goal, whole Plan, current Action and acceptance version         | Preserve overall intent while limiting the current assignment |
| Latest user input with its source record                        | Separate actual user authority from Agent inference           |
| Accepted outputs and applicable user decisions                  | Carry prior results and scoped waivers forward                |
| Current repository/workspace/PR facts with observation time     | Avoid reusing stale targets or guessed branch state           |
| Relevant run summaries, verified lessons and log index          | Allow targeted expansion of prior evidence                    |
| Execution profile, allowed capabilities and attempt/time budget | Bound what the coordinator may propose                        |

The coordinator may propose an interpretation of new input, but must identify its
source, affected criteria/scope and unresolved ambiguity. A scope-changing inference
is not a user decision. Existing structured acceptance and override actions remain
authoritative; no model call is needed merely to repeat such a recorded action.

The host owns persistence. A coordinator submits structured decisions, not direct
writes to planning records or instructions to bypass permission boundaries. A
read-only coordinator tool surface is the proposed default; worker permissions stay
separate. Exact provider/session settings require a targeted capability check.

## Exchange B: coordinator dispatch decision

The coordinator returns either a bounded worker assignment, a result assembled
from sufficient existing evidence, or a specific request for missing user input.
A new worker is not mandatory for every Action or feedback message.

A proposed worker assignment carries:

- Identity, source revision and the fixed acceptance version.
- Work intent: implementation, focused repair, verification, or delivery correction.
- The change/result needed now, plus explicit non-goals.
- Relevant references and verified lessons; pointers for further investigation.
- Criterion-by-criterion verification plan and reuse decisions.
- Suggested operation order, including useful early feedback points.
- Expected artifact/report shape and the authorized publication boundary.
- Stop conditions, repair budget and the parent decision/attempt reference.

For each required criterion, select new verification, reuse of existing evidence,
or an already-recorded user decision. A reuse decision names evidence, applicable
inputs and the reason it remains valid. Missing evidence remains missing; it is not
an implicit waiver. Every criterion remains represented even when no command is
needed for it in this attempt.

Operation ordering is flexible and is not an extra acceptance checklist. Never
instruct a worker to bypass an existing mandatory gate to achieve an earlier Draft.
The host validates identity, version, allowed criteria/decision references and
capability limits before launching the worker. It does not claim that field/schema
validation proves the coordinator's semantic judgment correct.

## Exchange C: worker result and coordinator qualification

Retain the worker's report and tool evidence without rewriting them. The coordinator
combines new and still-valid prior evidence into a separate qualification record.

| Qualification             | Meaning                                                                    | Host action                                                            |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Ready for user acceptance | Every required criterion is satisfied or has an explicit user decision     | Present the curated report; do not auto-accept or merge                |
| Focused follow-up needed  | A concrete implementation/evidence gap remains                             | Dispatch only the bounded follow-up if budget and authorization permit |
| User decision needed      | A material requirement or human observation is missing                     | Ask for that decision; do not launch unrelated coding work             |
| Blocked                   | A required dependency/capability is unavailable or the budget is exhausted | Preserve artifacts and show the specific blocker                       |

The qualification records each criterion's observed result, evidence source and
applicable user decision. It distinguishes new evidence from reused evidence and
preserves conflicting evidence for resolution. Host artifact-verification findings
remain advisory under the agreed acceptance policy; they cannot silently become
another gate. Required code/security review, when applicable, remains separate
from this coordinator's result qualification.

The user-facing report contains the delivered result, required-check outcomes,
material unresolved additional findings and next available action. Resolved retries,
optional probe successes and ordinary future workflow state stay in logs/context.
The coordinator may filter presentation but must not conceal material unresolved
risk or alter raw failures into passes.

## Continuity after a result

Update a concise current-context record with accepted output references, current
facts, resolved problems and applicability, unresolved constraints and relevant
next-step guidance. Link each material conclusion to evidence. Do not concatenate
the worker transcript into the next dispatch or maintain a conflicting shadow Plan.

A user changes intent -> the applicable decision record changes. Code/environment
changes -> affected reuse decisions must be reconsidered. A new provider Session
or context rollover -> reconstruct from current records rather than restarting
project discovery. Logical coordinator continuity is independent of a particular
provider conversation ID.

Legacy accepted-output repair remains useful, but should not be confused with an
already implemented coordinator or a complete context-reuse policy.

## Host lifecycle and visibility

Proposed conceptual boundaries are preparation, coordinator decision, worker work,
result qualification and waiting for the user. They are internal lifecycle states,
not five new mandatory stages for users to click through. Existing execution and
acceptance presentation should remain simple.

Record coordinator/worker attempts separately and associate them with their parent
Action request. Do not hide extra model calls inside a single apparent success.
Use the existing local record mechanism where practical; choose concrete schema
names and migration behavior during implementation review.

Public process/tool events update elapsed time, current activity and latest update
directly. Optional coordinator explanations add meaning at boundaries, not on
every stdout line. Capture secrets safely and never record private model reasoning.

Stop is owned by the host: invalidate pending dispatches and late callbacks, stop
the relevant active processes, and prevent a late coordinator result from starting
another worker. Keep partial artifacts. Resume/retry needs a new current request;
there is no automatic rollback or live instruction injection in this first slice.

## Proposed implementation slices

1. **Record and contract foundation.** Reuse the Card ledger for coordinator
   decisions, attempt relationships, qualification records and bounded context
   references. Add deterministic identity/version/stop tests before live model use.
2. **One vertical coordination loop.** Opt in one Card to coordinator preparation,
   one bounded worker call and result qualification using existing transports.
   Support the no-worker and needs-user paths. Surface available activity events
   and retain direct stopping. Do not migrate an active dispatched run in place.
3. **Evidence continuity and bounded correction.** Add explicit reuse/invalidation,
   a configured repair budget and targeted follow-up dispatch. Verify that a link
   correction does not replay functional tests and that a relevant code change
   does invalidate affected evidence. Keep every additional attempt accountable.
4. **Report and scenario closure.** Present the coordinator's curated result,
   preserve raw evidence access and exercise the complete user acceptance/next-step
   handoff. Compare elapsed time, repeat checks, tokens by role and user interventions
   with the recorded trial.

These are proposed slices, not newly activated work or delegated tasks. A first
implementation need not solve live steering, parallel workers or a new universal
logging backend. The opt-in preserves existing direct execution for unaffected
Cards while the new loop is evaluated.

## Minimum scenario set

| Scenario                                    | Required observation                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Earlier problem has a verified fix          | Next dispatch carries the applicable guidance without user repetition          |
| Only a reference needs correction           | No unrelated implementation or full functional test replay                     |
| Persistence code/environment changes        | Affected prior evidence is not silently reused                                 |
| User explicitly accepts simulator scope     | Decision is sourced and applied; no invented phone trial                       |
| Human judgment is still missing             | A short needs-user result, not another coding assignment                       |
| Worker reports resolved lint/probe failures | Raw logs retain them; the current user report does not list them as unresolved |
| Stop races with a coordinator response      | No late worker launch or hidden continuation                                   |
| Budget is exhausted                         | The loop stops with evidence and a clear next user decision                    |

Before coding, review the exchange meanings, choose the smallest schema/session
adapter and define observable outcomes for the first vertical slice. Concrete model
names, numerical budgets, provider rollover mechanics and universal retention policy
are still open implementation decisions, not facts established by this outline.
