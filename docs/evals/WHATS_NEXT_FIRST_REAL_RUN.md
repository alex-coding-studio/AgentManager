# What's Next First Real Run Evaluation

## Status

Evaluation in progress. These observations are evidence from the first real
Codex-backed What's Next Run. They do not yet change the Harness contract or
decide whether any Candidate should be accepted, refined, or discarded.

## Run

- Date: 2026-08-29
- Run: `RUN-b7ef0077-6a75-4fce-a8ce-e03d04cc9daf`
- Session: `SESSION-fcc0ce87-92d2-4556-bd44-288b3bcbd3cd`
- Transport: `codex-cli`
- Operation: `explore`
- Sources: `NODE-0001` and its `idea.md`
- Additional Resources: none
- User-managed instructions: none
- Elapsed time: approximately 52 seconds
- Input tokens: 44,471
- Cached input tokens: 32,256
- New input tokens: 12,215
- Output tokens: 2,634
- Reasoning output tokens: 136
- Result: one Chinese Reflection and five Chinese Candidate proposals

The initial validator rejected equivalent Markdown formatting: the Reflection
had no fixed English heading and Candidate rationales used ordered lists. The
same original Agent output passed after the validator accepted those valid
representations. The Agent was not rerun.

## Input

> 我想要创建一个项目管理系统，接入AI的。它能帮我做任务分解以及启发式引导，最后还要能帮我做任务推进以及GitHub的相关集成。

## Reflection

The Reflection correctly avoided guessing one complete product. It identified
four connected but unsettled values and recommended finding the smallest loop
the user would repeatedly use. It was concise, readable, and useful for
choosing a starting direction.

## Candidate observations

### CANDIDATE-0001 — AI Task Decomposition Workspace

- Strong adjacency to an explicit user need.
- Useful and independently inspectable.
- Currently frames the value as producing an executable plan.
- The user's intended center is instead controlling how much Context one person
  must understand at once while preserving product meaning.
- Provisional disposition: strong Refine target.

### CANDIDATE-0002 — Heuristic Project Coach

- Clearly isolates the heuristic-guidance value.
- Distinguishes a thinking partner from an automation tool.
- Assumptions are explicit and testable.
- Provisional disposition: high-quality direction.

### CANDIDATE-0003 — Daily Progress Assistant

- Correctly identifies continuing execution as a separate pain.
- `Daily` introduces a cadence that the user did not provide.
- The underlying direction may be continuous progress and replanning rather
  than a daily ritual.
- Provisional disposition: plausible direction with an unsupported constraint.

### CANDIDATE-0004 — GitHub-native Project Coordination Layer

- Directly addresses the requested GitHub integration.
- Safely proposes a read-only starting boundary before repository mutations.
- Uses GitHub events as a concrete and verifiable evidence source.
- Provisional disposition: high-quality direction.

### CANDIDATE-0005 — Single-project AI Loop

- Covers clarification, decomposition, progress, GitHub feedback, Context
  continuity, and human confirmation in one proposal.
- Limiting the proposal to one project narrows the data scope but not the
  product behavior.
- It cannot demonstrate its value independently from several sibling
  directions.
- It overlaps Candidates 1, 2, and 4 and currently declares no dependencies.
- It reads more like a validation strategy or later synthesis direction than a
  first-layer product direction.
- Provisional disposition: likely too broad for this discovery layer; no action
  until the audit completes.

## Provisional Harness finding

Restricting the number of projects or users does not make a proposal small when
it still bundles several independent product behaviors.

A first-layer discovery Candidate should expose one independently testable
value loop. If it needs two or more proposed siblings in order to demonstrate
its value, it is either a later synthesis direction with explicit dependencies
or it is too broad for the current discovery layer.

This is a provisional finding. It should become a Harness rule only after the
remaining audit and the first multi-turn Refine test show that the distinction
is stable and useful.

## First multi-turn Refine observation

`CANDIDATE-0001` was refined in the original persistent Codex Session with an
Instruction correcting its center from task count and execution planning to
bounded cognitive Context. The operation returned only `CANDIDATE-0001` at
revision 2, preserved its graph relationships, and completed in approximately
31 seconds. This verifies the structural one-to-one Refine boundary and
provider Session reuse for this run.

The revised `AI Context 聚焦工作台` is not simply lower quality. It expresses
the intended Context principle more accurately, but moves from a bounded Task
Decomposition direction toward a product-level principle spanning project
meaning, task relationships, evolution, and GitHub activity. That broader
resolution remains coherent, yet it is less immediately testable. The old
Harness did not identify or disclose this semantic-resolution movement, and it
did not explicitly recommend that the next Grow move one level more concrete.

This observation produced the Harness revision 3 rule: preserve semantic role
and resolution by default during Refine; disclose user-supported broadening or
narrowing in Reflection; protect sibling value loops from accidental
synthesis; and return a machine-readable continuation focus. The readable
Response presents that recommendation in Markdown while the Canvas UI remains
general.

The Refine used 58,600 total input tokens, including 39,424 cached input tokens,
with 1,302 output tokens and 170 reasoning tokens. These figures establish only
the observed run cost; optimization remains deferred until the product loop is
validated.

## First progressive-resolution continuation

Harness revision 3 intentionally started a fresh Codex Session from
`CANDIDATE-0001` revision 2 because the prior provider Session held the revision
2 Contract. The user asked for an example that could validate the abstract
Context direction quickly. Codex returned a coherent ten-minute loop: begin
with a fuzzy product goal, expose only the Context needed for one decision,
produce one reviewable action, and draft the first GitHub Issue. Its Reflection
correctly recommended moving to a lightweight prototype rather than continuing
conceptual exploration.

The initial validation failed because the Agent copied Candidate revision 2
instead of returning revision 3. Request identity, Harness revision, graph
relationships, Reflection, and Markdown were otherwise valid. The raw result
was recovered without another Agent call by correcting only that machine-owned
revision number and running the normal failed-Run recovery validator. The next
request packet now supplies an explicit `requiredRevision` so the Agent does
not need to infer it.

This run used 46,936 input tokens, including 33,280 cached input tokens, with
1,535 output tokens and 334 reasoning tokens. It ran for approximately 35
seconds. The recovered real graph contains all five Candidates and all five
source lineage edges.

The same run exposed a Canvas-state regression: selecting a Candidate before
Refine left graph focus active while its card became a Running placeholder, so
unrelated cards and edges became effectively invisible at a small zoom. Refine
start, cancellation, failure, and completion now clear graph focus while
preserving the Candidate identity and relationship set. A development-only
Refining fixture verifies full-opacity sibling cards and lineage edges without
starting another Agent.

## Remaining audit

- Review the complete Response and all five Candidate Markdown artifacts in a
  full-width browser.
- Inspect Candidate dependency readability and the absence of relationships in
  the real proposal.
- Exercise inline-feedback Refine separately from the completed direct-Refine
  path when desktop review is available.
- Verify Harness revision 3 can guide the accepted principle one semantic level
  more concrete without a user-authored expert Prompt.
- Decide final Candidate dispositions only after those checks.

## Deferred UX observation

Mobile Markdown annotation was not usable enough in the first remote review.
Text selection and the visible `Add feedback` action did not reliably open a
usable feedback flow in the iPhone browser environment. This does not block the
desktop-first V1, but it invalidates any claim that the current annotation UI
already supports mobile review. The future requirement is tracked in the
Roadmap.
