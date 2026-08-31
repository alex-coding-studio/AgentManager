# Execution Coordination — First-Slice Proposal

Status: agreed product direction captured after the HereItIs six-Action trial.
The first work-branch implementation and validation limits are recorded in
[Coordinator Harness](COORDINATOR_HARNESS.md). All new executions use coordination;
there is no optional direct-worker mode. This does not authorize rerunning the
completed Card or expanding existing permissions.

## Problem and intended outcome

Current dispatch packages module instructions, a Plan/Action, user input and
references into a local Agent Session. The execution Agent must reconcile intent,
choose context, arrange work and classify its own output. In the trial, the user
and the primary assistant repeatedly supplied the missing coordination between
steps. A fresh execution Session could complete local work while losing the
meaning of earlier decisions, fixes or acceptance boundaries.

The proposed coordinator owns continuity of the whole task: why the Plan exists,
what has been accepted, what changed, which evidence remains useful and what the
next Action actually needs. The worker owns a bounded implementation or validation
task. Model capability may help, but replacing the worker model alone does not
establish this missing responsibility.

The first target is a reliable dispatch/result/acceptance loop with less repeated
work and fewer user explanations. Faster completion and higher success rates are
hypotheses to measure, not promised consequences of adding another model call.

## Responsibilities

| Role              | Owns                                                                                                                      | Does not own                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| User              | Product intent, changed requirements, explicit waivers and final acceptance                                               | Reconstructing every preceding run for each worker                                                         |
| Coordinator Agent | Overall task context, requirement translation, bounded dispatch, continuity and unresolved-work recovery                  | Semantic review of passed self-checks, implementation, final acceptance or silently expanding scope        |
| Execution Agent   | The dispatched work, tool use, proportionate checks, self-checks, concrete artifacts and honest evidence                  | Global product decisions, surprise required checks or automatic user acceptance                            |
| Host system       | Durable records, identity/revision checks, permissions, process lifecycle, progress events and explicit state transitions | Pretending model judgments are deterministic proof or requiring a model response before stopping a process |

The worker's complete self-check moves the result to user acceptance without another
coordinator review. The coordinator handles failed, not-run or mechanically contradictory
items. It does not replace final user acceptance or a separately required independent
code/security review. Existing local permission and Git/GitHub rules
remain binding. A coordinator cannot authorize a tool or merge that the user has
not authorized.

## Planning continuity

Use one logical planning-facing Agent to discuss requirements, reason about
tradeoffs, produce steps and define detailed acceptance criteria. Carry this
understanding into execution coordination instead of discarding it after Plan
confirmation. Avoid a second full onboarding just to construct a dispatch prompt.

Logical continuity means durable current facts, decisions and evidence references,
not a requirement to keep one unbounded provider conversation forever. Session
resume, rollover and reconstruction must preserve that understanding. Provider
Session lifetime and model selections are implementation decisions to validate.

The first rollout targets Just Do It. The log/context mechanism is shared in
purpose with What's Next and Break It Down, but this proposal does not require
rewriting all three modules at once or adding a mandatory cross-module supervisor.
Existing coordinator-named context helpers are not proof that this Agent role
already exists.

## Dispatch and result loop

1. Read current authoritative project/Card state, relevant summaries and the user's
   latest input. Expand selected log references only where facts are missing or
   contradictory.
2. Determine the work needed now: implementation, a focused repair, verification of
   an existing result, delivery correction, or recording a user decision. Do not
   launch a coding worker merely because an Action has an execution button.
3. Resolve in-scope interpretation from existing context. Record explicit user
   rulings against their scope/criteria without rewriting historical checklists.
   Ask only for a material unresolved decision; do not invent observations or
   silently promote an inference into a user waiver.
4. Prepare a bounded dispatch with the intended delta, relevant input/output,
   applicable constraints, evidence to reuse, checks to perform, useful verified
   lessons, publication target, stop conditions and expected result references.
5. Run one worker when implementation or new evidence is actually needed. The host
   continues reporting observable activity; the coordinator need not process every
   tool-output line.
6. Inspect the returned result against the frozen required criteria and recorded
   user decisions. Resolve supported reference/report questions from existing
   evidence where possible. Do not rerun the worker solely to repeat a report.
7. If necessary, dispatch a narrowly scoped correction or missing-evidence task
   within a declared repair budget. Preserve the already valid work. Otherwise
   produce the user-facing report or request the one remaining human decision.
8. After explicit user acceptance, update the current task summary and prepare
   relevant context for the next Action. Do not automatically start it unless
   the user has separately authorized that behavior.

A user-facing Round must not conceal additional paid worker/coordinator attempts.
Record each call and its relationship to the dispatch. The exact Round/attempt
terminology and repair budget require implementation design; no unbounded hidden
repair loop is part of this proposal.

## Frozen requirements, flexible verification work

A fixed acceptance checklist is not an instruction to execute every command again
in every Round. The coordinator selects a proportionate verification plan while
preserving complete final criterion coverage.

Each criterion should identify whether evidence is newly produced, reused from a
still-applicable earlier run, absent/failed, or covered by an explicit user ruling.
Reused evidence needs its source and applicability: relevant code/configuration,
environment, requirements and any material input changes. Revision metadata alone
must not imply that unrelated documentation changes invalidate every functional
check, or that unchanged source guarantees an unchanged environment.

Examples:

- Correcting a PR URL without relevant code/environment changes should not rerun
  simulator tests whose evidence remains valid.
- Changing persistence behavior invalidates affected storage/correction evidence;
  it cannot inherit a pass merely because the old run passed.
- An early inexpensive compile check may expose a mistake before a long UI test.
- Full required gates can be grouped at the appropriate delivery point rather than
  repeated after every tiny operation. Existing mandatory hooks cannot be bypassed;
  incompatible gate policy must be reconciled explicitly.

The coordinator optimizes work and ordering, not the required outcome. A genuinely
failed requirement remains failed unless corrected or explicitly waived by the
user. If a result contains contradictory evidence, resolve that contradiction
rather than selecting the more convenient status.

## Context, summaries and logs

Use [Run Logs, Progress and Reusable Context](RUN_LOGS_AND_CONTEXT.md) as the owner
of retention/retrieval principles. The coordinator is responsible for extracting
and applying relevant meaning from those records, including:

- Completed outputs available for reuse and the latest accepted version.
- Verified current facts and explicit user decisions, including their scope.
- Resolved problems, effective treatments and conditions where they apply.
- Remaining constraints and why a previous result cannot be reused.
- What the next Action must inherit, add, or explicitly avoid repeating.

Raw records preserve evidence; concise summaries provide the default context.
Every material conclusion retains provenance. Do not copy the whole transcript to
both Agents, maintain duplicate competing stores, or promote a speculative fix into
a permanent rule. Expire or supersede conclusions when their conditions change.
Keep metadata/identity checks separate from human-facing meaning and reports.

Logs remain data, not new instructions or permissions. Filter secrets, keep private
trial data local by default and exclude private model reasoning. Store public
progress, commands/results and decision records needed for accountability.

## Result presentation owned by the coordinator

The default report answers: what was delivered, whether each required criterion is
satisfied, what material unresolved issue needs attention, and what the user can do
next. Execution Agent output is retained as evidence rather than copied wholesale
into the user interface.

Show only unresolved, decision-relevant additional findings. Resolved lint/build
failures, successful optional probes, routine environment facts and future Actions
belong in logs or the appropriate existing surface. An empty additional-findings
section should be absent. Important unresolved risks must remain visible; filtering
presentation does not authorize suppressing evidence or falsifying results.

There is no separate free-text Remaining work acceptance checklist. Actual gaps
map to required criteria. Artifact-verifier capability limitations remain advisory
under the agreed policy; they cannot trigger a new mandatory gate or pointless
worker rerun. Raw failures and user overrides remain distinguishable after acceptance.

## Live visibility and stopping

The host directly displays total elapsed time, current observable activity and time
since the latest update. Show a failure when it is observed, together with whether
work is repairing, waiting or continuing independently. Do not wait for the final
model report before exposing failure evidence, invent percentages, or classify
silence as a proven hang.

The coordinator adds interpretation at meaningful boundaries: which objective is
being addressed, why the plan changed or what substantive blocker remains. Do not
call it for every log line or heartbeat.

An explicit Stop action directly stops the execution process through the host.
It cannot depend on coordinator availability. Preserve the partial workspace and
record the stop; the coordinator can later explain recovery. Stopping is not an
automatic rollback.

## First-slice scope and deferred capabilities

In scope: logical coordinator continuity, pre-dispatch context/requirement work,
bounded worker assignments, unresolved-work recovery, evidence reuse, worker self-check
presentation, observable progress and reliable direct stopping.

Deferred: injecting corrective instructions into a currently running worker,
real-time bidirectional Session steering, concurrent worker teams, broad automatic
replanning, a new logging backend, and automatic acceptance/merge/next-step execution.
For now, user changes that require a new assignment are handled at the next safe
boundary or after an explicit stop. Do not claim they were applied inside an active
Session. Missing transport capabilities are not a reason to delay the first slice.

## Evidence required before calling the design successful

- A multi-Action scenario carries a verified earlier fact/repair into the next
  dispatch without the user restating it.
- A reference-only repair reuses applicable tests, while a relevant source or
  environment change causes the affected evidence to be revalidated.
- An explicit user scope change is recorded and applied without fabricating trial
  observations; a user-decision-only task does not launch unnecessary coding work.
- Required failures remain visible and enter bounded recovery until resolved or
  explicitly waived. Passed worker self-checks proceed to user acceptance without
  coordinator review. Resolved optional failures do not clutter the final report.
- Progress/failure events are visible before final completion; stopping still works
  when the coordinator is unavailable.
- Coordinator and worker calls, durations, token usage, repeated checks and user
  interventions are measured separately. Compare total effort with the recorded
  trial rather than claiming savings from lower worker-model cost alone.

Use deterministic contract/state checks and at least one bounded real scenario.
The [final trial statistics](evals/2026-08-31-hereitis-final-trial-statistics.md)
are the baseline, not a matched model benchmark. Select concrete dispatch schemas,
provider/session behavior, failure recovery and rollout tasks only after this role
and flow proposal is reviewed; those technical choices are not settled here.

Protocol refinement and proposed implementation slices are documented separately
in [the protocol outline](EXECUTION_COORDINATION_PROTOCOL.md). The runtime contract records which parts are implemented; merging design documents
alone does not deploy the implementation.
