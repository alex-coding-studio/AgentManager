# Automation Guide

Status: agreed cross-module audit method. It records how to decide whether repeated work
belongs in code, a script, a Host operation, the Harness or the Agent. It does not authorize
a bulk automation project or require every module to use the same mechanism.

## Purpose

Praxis should not spend model turns on deterministic work that the Host or repository
can perform more reliably. The HereItIs Just Do It dogfood exposed repeated command
discovery, environment probing, test ordering, polling, publication and cleanup work that
Workers reconstructed from prose or handled through temporary shell and Python helpers.

The same question applies to every module, not only Just Do It:

- Project and Product Context;
- What’s Next;
- Break It Down;
- Just Do It;
- What’s That?;
- shared Agent transport, storage, validation, progress and cleanup.

Audit one module and one observed workflow at a time. Determine whether automation would
reduce cost or risk before choosing its implementation form.

## Automation is not synonymous with a script

For each repeated action, choose the lightest correct owner:

| Owner or mechanism      | Use when                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| Library function        | deterministic behavior is internal to one process or transaction               |
| Script / CLI entrypoint | a stable operation must be runnable by people, CI or several hosts             |
| Host-owned operation    | permissions, side effects, waiting, cancellation, evidence or cleanup matter   |
| Repository entrypoint   | each project already owns the correct lint, build, test or migration behavior  |
| Harness rule            | the boundary is semantic judgment or a stop condition rather than an operation |
| Agent                   | product interpretation, implementation choice or novel diagnosis is required   |
| User                    | product acceptance, irreversible external choice or material ambiguity remains |

A script file is not complete automation when the Agent must discover it, reconstruct
arguments, write an adapter, poll it, parse freeform output and remember cleanup.

Conversely, repeated behavior should not become a script merely because scripts are easy to
write. A shared typed function may be safer; a Harness rule may be sufficient; an Agent may
still be the correct owner.

## Candidate qualification

An action is a strong automation candidate when most of these are true:

- it occurred in at least two real runs or modules;
- inputs and preconditions can be stated without hidden product judgment;
- side effects and rollback boundaries are knowable;
- success, failure, blocked and canceled are mechanically observable;
- the output can be structured and linked to exact revisions;
- timeout, cancellation and cleanup can be owned outside the model;
- idempotency or retry rules can be defined;
- model reasoning adds less value than its time, tokens and variance cost.

Keep it with the Agent when the difficult part is choosing product meaning, designing the
implementation, investigating a new cause or judging evidence against user intent.

## Audit record

Every module audit produces records with this shape:

```text
Observed action
Trigger and frequency
Current owner
Current entrypoint, if any
Inputs and hidden assumptions
Side effects
Failure and cancellation behavior
Current evidence and repeated cost
Candidate owner
Candidate mechanism
Expected benefit
New risk or rigidity
Decision: automate / measure / retain / remove
Smallest validation
```

Do not mark a candidate `automate` without evidence and a validation boundary. `Measure`
means retain current behavior while collecting the missing frequency, cost or failure data.

## Step-by-step audit process

### 1. Observe

- read real Run, Summary, Log and user-intervention evidence;
- list repeated commands, probes, temporary helpers and manual transitions;
- distinguish required repeated work from accidental repetition;
- record elapsed time, model turns and failure consequences when available.

### 2. Classify

- semantic decision;
- deterministic transformation;
- repository operation;
- Host lifecycle operation;
- external-system write;
- evidence retrieval;
- presentation-only behavior.

### 3. Check existing mechanisms

- is a library function already used internally?
- does a script exist but lack a stable entrypoint?
- is an npm or project entrypoint already authoritative?
- does the Host already perform the action for one caller?
- is the repeated work caused by missing discovery rather than missing code?
- would Summary or cached evidence remove the rerun?

### 4. Choose the mechanism

Prefer, in order:

1. reuse an existing authoritative entrypoint;
2. expose an existing function through a stable Host operation;
3. add a small typed helper for internal deterministic behavior;
4. add a script only when a standalone process boundary is useful;
5. keep the Agent when automation would encode unstable judgment.

### 5. Validate one slice

- prove the old repeated cost or failure;
- implement one bounded candidate;
- verify output, side effects, cancellation and cleanup;
- compare elapsed time, model turns and user intervention;
- remove or revise automation that adds more state than value.

### 6. Promote or stop

Only promote a module convention to shared infrastructure after another real module reuses
it successfully. Do not generalize from one keyword or similar-looking command.

## Module audit checklist

### Project registration and Product Context

Inspect:

- project-directory validation and registry writes;
- fixed planning-store initialization;
- Git exclusion setup;
- Context folder and document creation;
- import, reveal, rename and deletion boundaries;
- repeated filesystem path validation;
- project capability and repository fact discovery.

Questions:

- which operations are already deterministic Host code?
- which routes repeat safe parsing, path or error handling?
- which project facts are rediscovered by every module?
- should capability discovery be cached by relevant project revision?

Current evidence: Request Boundary, Atomic JSON Store and Safe API Error Responses are
cross-cutting improvements earned by observed defects. Do not use them as permission to
mass-rewrite every Context operation.

### What’s Next

Inspect:

- Source and selected-node Context assembly;
- Intention/Motion packet construction;
- Candidate identity allocation and output validation;
- Session continuation and rollover;
- Response rendering and Latest Response state;
- acceptance, discard, redo and cleanup;
- repeated graph-neighbor reads;
- Summary and Log reuse between Runs.

Questions:

- can the Host provide a compact graph/context index instead of repeated Agent discovery?
- which decisions require the exploration Agent and which are fixed output transformations?
- are accepted/no-change/clarification results rendered from structured data everywhere?
- are abandoned Runs and provider threads cleaned consistently?

Do not script product exploration. Automate identity, packet, validation, persistence,
progress and cleanup around it.

### Break It Down

Inspect:

- source resolution and bounded neighbor Context;
- decomposition instructions and attachments;
- Candidate validation, dependencies and stable identities;
- refine, recompose, accept, discard and rollback;
- Session continuity and repeated graph impact lookup;
- Run cleanup and reusable summaries.

Questions:

- which graph impact queries should be deterministic Host reads?
- when does the Agent need full neighboring content rather than an index?
- which structural operations need explicit algorithms instead of prompt-only behavior?
- can accepted proposal evidence prevent repeated decomposition research?

Do not force one decomposition algorithm across different user intentions merely to call the
module automated.

### Just Do It

Inspect each lifecycle boundary separately:

- Card/worktree preparation;
- repository, branch, identity and remote discovery;
- Skill and Context packet construction;
- coding and commit evidence;
- targeted, fast, full, UI, simulator and device validation lanes;
- precondition and test ordering;
- long-running process waiting and progress;
- unchanged-failure retry detection;
- Candidate publication and Draft/Ready transitions;
- acceptance, restart, rollback and remote-state refresh;
- worktree, backup, provider-thread and temporary-resource cleanup.

Known delivered mechanisms include persistent Card worktrees, Environment Manifest work,
event-driven `run_job`, Host Candidate publication, required/extra check separation,
`npm run test:ci`, GitHub Required Checks and bounded Coordinator repair.

Audit where Workers still run Git archaeology, compose commands already represented by an
entrypoint, rerun unchanged checks, create temporary polling helpers or repeat publication
probes. Promote one observed action at a time.

### What’s That?

Audit during the first implementation rather than inventing operations in advance:

- model index and selected-Entity Context construction;
- structured Agent result validation;
- atomic model revision application and undo;
- deterministic relationship derivation;
- stable automatic layout;
- Summary and Log persistence;
- fresh Session recovery;
- Latest Response construction;
- temporary Run and provider-thread cleanup.

Keep Entity meaning, relationship interpretation and model refactoring with the Agent.
Automate schema validation, identity, atomic persistence, derived-view calculation, progress,
evidence and cleanup.

### Shared runtime and application shell

Inspect:

- model and Skill catalog discovery;
- local transport startup and cancellation;
- event-driven Host jobs;
- request security and public error responses;
- shared Atomic Store behavior;
- Summary, Log and evidence retrieval;
- Latest Response and shared Card Frame;
- CI, format, lint and test entrypoints;
- provider-thread, temporary-directory and worktree cleanup.

Shared runtime is audited last for promotion candidates found in at least two modules. This
avoids creating a generic framework before module evidence exists.

## Existing scripts: discovery is part of the audit

The repository currently contains scripts for environment preparation, Candidate
publication, system validation, optional validation repair, UUID migration, Harness preview
and several smoke checks. Some have npm entries; some are only documented commands; some are
also called as library functions.

For each script, determine:

- is the file still used?
- is the library function the real source of truth?
- who discovers the entrypoint?
- are input and output machine-readable?
- does the Host wait and retain evidence?
- are permissions and side effects bounded?
- does it clean filesystem and provider history on every terminal outcome?
- would an npm entry, Host operation, typed function or deletion be simpler?

Do not create a wrapper script around another script merely to increase an automation count.

## Initial evidence-backed candidates

These are audit candidates, not approved implementation tasks:

| Candidate                                      | Evidence                                                     | First decision needed                         |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Project capability summary                     | Workers repeatedly rediscovered Git/tool/test facts          | measure reuse and invalidation keys           |
| Named targeted/fast/full validation operations | full/UI tests and command ordering caused repeated cost      | audit project entrypoints and lane boundaries |
| Host-enforced prerequisite graph               | tests ran after failed compilation in dogfood                | identify stable dependencies                  |
| Exact validation-result reuse                  | unchanged checks were rerun across repair rounds             | define cache keys and invalidation            |
| Unchanged-failure retry identity               | Prompt rules currently carry part of the retry boundary      | decide Host state and user override           |
| Script/operation registry                      | existing scripts are unevenly discoverable                   | inventory before designing a schema           |
| Provider-thread cleanup                        | smoke folders were deleted while Remote tasks remained       | inspect App Server archive support            |
| Card worktree reconciliation                   | backup and completed worktrees remain on disk                | define references and safe terminal states    |
| Bounded Summary retrieval                      | later Runs repeated known facts or required user explanation | implement one module first                    |

## Audit order

Run separate, reviewable audits rather than one cross-repository refactor:

1. finish Safe API Error Responses;
2. audit Project registration and Product Context;
3. audit What’s Next;
4. audit Break It Down;
5. audit Just Do It using the six-Action dogfood evidence;
6. audit What’s That? alongside its first real implementation;
7. compare accepted candidates and promote only mechanisms reused by multiple modules.

An audit may conclude that no code change is justified. That is a valid result.

## Audit output and acceptance

Each module audit should deliver:

- an inventory of repeated actions and current entrypoints;
- evidence references and measured or explicitly missing cost data;
- candidate decisions: automate, measure, retain or remove;
- a recommended mechanism for each approved candidate;
- new risks, rigidity and cleanup obligations;
- one smallest next implementation slice, or a no-change conclusion.

The audit succeeds when it reduces Agent-reconstructed mechanics without reducing semantic
freedom, required evidence or user authority. Number of scripts is not a success measure.

Useful outcome measures include:

- model turns before first useful output;
- repeated repository or permission probes;
- commands reconstructed from prose;
- unchanged checks rerun;
- elapsed validation time;
- user status questions and manual interventions;
- automation reuse with exact evidence;
- cleanup completeness;
- regressions caused by rigid or stale automation.
