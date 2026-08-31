# Run Logs, Progress and Reusable Context

Status: agreed direction for later design review, not an implemented logging
architecture. The user requested documentation only while the current HereItIs
six-Action Card continues. Reassess priorities and implementation boundaries after
all six Actions and their user acceptance are complete. Do not interrupt that trial
to replace runtime storage, introduce mandatory phases or start a parallel rebuild.

## Problem and intended result

During the overnight and morning trial, the user repeatedly had to ask what an
Agent was doing. A generic running label did not distinguish useful work, a long
command, repeated recovery attempts or missing activity updates. Evidence existed
in multiple places, but finding it required external transcript inspection.

The same gap affects continuity. A fresh Session should not have to rediscover an
already established repository target, environment cause or delivery rule. Keeping
raw logs alone does not solve this: relevant verified conclusions must reach the
next Session in a short, current handoff with evidence pointers.

Treat this as shared run-record infrastructure for What's Next, Break It Down and
Just Do It. Preserve the local-first, single-user boundary. It is not a new Card,
an MCP redesign, or a requirement for users to curate every log and Skill.

## Running-state presentation

The default view shows only:

- Total elapsed time, updated by the host without a model call.
- Current activity, derived from observed execution events or explicit public Agent
  progress: reading context, editing, running lint, testing or waiting for a tool.
- Time since the latest observed activity update.

Do not show invented completion percentages or estimates. A long command can show
its own elapsed time. Silence means no recent observable update, not proof of a
hang. Separate process/tool activity from substantive progress; heartbeat traffic
must not pretend that new work was completed. Allow opening a compact event timeline
and then the relevant detailed log. Do not expose private model reasoning.

Acceptance criteria remain a separate surface. Their IDs define what must be
proved; they are not an execution schedule or a progress percentage.

## Information layers

| Layer                         | Contents                                                                              | Default consumption                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Live status                   | Run start, current observable activity, latest event time                             | Host-driven UI; no full-log model read                      |
| Current facts and constraints | Canonical targets, workspace identity, current scope and explicit user decisions      | Small relevant context supplied to the Session              |
| Verified reusable conclusions | Symptom, established cause, effective treatment, applicability and evidence reference | Only conclusions relevant to the current task               |
| Run summary                   | Work completed, resulting artifacts, unresolved blockers and next action              | Current and relevant predecessor summaries                  |
| Raw records                   | Tool calls, command results, errors and public progress messages                      | Retained locally, retrieved in bounded excerpts when needed |

A summary is a navigation aid, not a replacement for evidence. Every material
claim should point to its source run/event or artifact. Records and summaries must
distinguish completed work, planned work, attempted fixes and verified fixes.
Keep original outcomes; later correction or user waiver is a separate event.

## Cross-module use

- What's Next retains decision evidence, user selections/rejections and applicable
  project facts, so later proposals do not repeat settled discussions blindly.
- Break It Down retains decomposition rationale, dependencies, scope boundaries
  and adjustment decisions, linked to the formal nodes they produced.
- Just Do It retains implementation evidence, successful repairs, unresolved work,
  acceptance decisions and delivery state across Actions and Rounds.

Cross-module handoff passes formal outputs plus necessary current conclusions. It
must not concatenate every preceding conversation. Preserve source identity so a
reader can expand only the decision, failure or result they need to investigate.

## Reuse without turning old logs into permanent rules

A verified conclusion includes its applicability boundary: project, repository,
revision, environment/configuration and verification time as relevant. Record when
a later observation supersedes it. Current authoritative project state and explicit
user instructions override stale summaries. Log text and Agent-generated advice
are evidence, not new authority or permission to perform an action.

Examples from this trial illustrate the shape, not immutable global rules:

- A corrected repository target should replace stale target references in current
  context, with a pointer to the verification that established it.
- A simulator failure caused by Session permissions should guide the next diagnosis;
  it must not become a permanent assertion that simulators are unavailable.
- An explicitly enabled Draft-first publication policy belongs to the relevant
  project configuration. It must not be silently generalized to other projects.
- An unsupported optional probe remains a diagnostic observation and cannot create
  a new required acceptance condition.

Do not promote every error into a lesson. Reuse requires a verified cause or useful
resolution, not merely an Agent's guess or a history of unsuccessful attempts.

## Bounded retrieval and token accounting

Writing a local log does not itself put its contents into model context. Tokens
are consumed when content is supplied or read, and may be carried again in later
model requests. Therefore keep the default handoff bounded, deduplicated and
relevant; do not inject raw logs into every Session or Round.

Retrieval should start with a summary/index and expand by run, event, command,
time range or error. Return bounded excerpts with truncation and continuation
information. Prefer a relevant error section to an entire build log, but preserve
access to the rest when the excerpt is insufficient. A log pointer must not depend
on guessing a provider-specific transcript location.

Define configurable summary/retrieval budgets during implementation design rather
than asserting an unmeasured token saving. Measure default context volume, detailed
log reads, repeated reads and useful diagnostic outcomes. High cache hit rates do
not make unnecessary context or repeated tool work free of latency and quota cost.

## Storage, safety and implementation boundary

Inventory the existing project records, per-run artifacts, handoffs and provider
transcripts first. Reuse or link authoritative records instead of introducing a
second competing source of truth. Keep project artifacts separate from transient
runtime details, with stable references that survive normal handoff and recovery.
Retention, rotation, deletion, missing-source behavior and provider differences
need an explicit design. A missing or expired log must be reported honestly.

Filter credentials and other sensitive values before persistence and before
presentation. Keep raw records local by default; do not publish transcripts,
private trial data or environment secrets to PRs automatically. Do not record or
surface private model reasoning. Use public progress and observable tool evidence.

No schema, transport interception, automatic summary generation, log viewer,
retrieval API or retention policy is delivered by this document. Existing features
and the separately proposed environment-repair work remain their own mechanisms.

## Review after the six-Action trial

Use the completed Card's actual records to determine:

1. Which repeated questions could elapsed time, activity and last-update indicators
   have answered without a model call?
2. Which prior conclusions were useful but absent, stale or hard to locate in later
   Sessions? Which repetitions were required checks rather than wasted work?
3. Which existing records can be indexed, and where is evidence actually missing?
4. What bounded summaries and retrieval operations materially reduce re-reading
   without losing correctness or hiding important limitations?
5. What is the smallest shared implementation that benefits all three modules?

Validate with a real multi-Action continuation as well as deterministic tests:
follow a prior verified repair through a fresh Session, retrieve its evidence,
handle an invalidated environment fact, and distinguish long-running work from
missing updates. Keep token cost, elapsed time and user-visible usefulness separate.
Do not infer architectural success from unit-test counts alone.

Related records: [rolling dogfood review](JUST_DO_IT_DOGFOOD_REVIEW.md),
[execution boundary](JUST_DO_IT_EXECUTION.md),
[environment validation and repair proposal](DEVELOPMENT_ENVIRONMENT.md).
