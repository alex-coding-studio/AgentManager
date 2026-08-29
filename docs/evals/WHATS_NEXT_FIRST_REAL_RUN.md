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

## Remaining audit

- Review the complete Response and all five Candidate Markdown artifacts in a
  full-width browser.
- Inspect Candidate dependency readability and the absence of relationships in
  the real proposal.
- Refine Candidate 1 through inline feedback without creating siblings or
  changing graph relationships.
- Verify provider Session reuse and delta Context on the second round.
- Compare second-round token use with the initial 44,471-token input.
- Decide final Candidate dispositions only after those checks.
