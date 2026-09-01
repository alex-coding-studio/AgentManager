# Harness Asset Audit

Status: production baseline audit for the reusable AgentManager Harness assets.

## Method

This audit applies the Yao Meta Skill's trigger-first and output-risk method to the
internal Harnesses. The recurring jobs, output contracts, exclusions and deterministic
gates are evaluated before prompt prose. The reference set is deliberately small:

1. the real HereItIs Product Source;
2. the three accepted HereItIs Product Design Features;
3. the deletion-completion request supplied during dogfooding;
4. the existing What’s Next and Just Do It Harness contracts and regression suites;
5. the current HereItIs product contract as a comparison target.

Natural-language trigger evaluation is not applicable to these routes: What’s Next uses an
explicit Intention selector and Just Do It uses a host-owned stage enum. Route confusion is
therefore tested at the selector/stage contract rather than inferred from prompt wording.

## What’s Next boundary

| Intention                 | Owns                                                                          | Must not do                                              | First output risk                           |
| ------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| MVP Exploration           | discover several falsifiable user-value directions                            | formalize a Feature or implementation                    | plausible but untestable directions         |
| Feature Synthesis         | turn selected Discovery evidence into a formal Feature                        | insert an intermediate Discovery Feature                 | losing evidence or combining unrelated MVPs |
| Product Design Completion | start from Source and judge a product gap using all accepted Feature siblings | require an MVP detour or manufacture a duplicate Feature | creating a Card merely to answer            |

Product Design Completion may return a Feature, no-change or one clarification. A missing
rule inside an existing Feature is a refinement recommendation, not a new Feature.
Its primary graph lineage is always Product Source to Feature; sibling interaction does not
create another visual depth level.

## Just Do It audit

| Asset               | Boundary result                                                                                                | Deterministic protection                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Planning Harness    | Pass. Produces a draft semantic Plan and detailed acceptance before finalization. Never executes or finalizes. | stage schema, UUID and single-step preservation tests                                        |
| Execution Harness   | Pass. Executes one finalized Action, reports the frozen checklist exactly and stops at delivery.               | exact criterion coverage, artifact evidence, override and sequential-Action tests            |
| Review Harness      | Pass. Reviews one output without fixing, merging or accepting it.                                              | output identity, finding/verdict and artifact-bound tests                                    |
| Todo Harness        | Pass. Produces an Issue draft or decision request without creating an Issue.                                   | stage schema and current-scope deferral tests                                                |
| Coordinator Harness | Pass. Coordinates dispatch and one cause-directed repair; it is not a code or product Reviewer.                | repair budget, passed-check trust, stale-evidence, user-decision and diagnostic triage tests |

No Just Do It prompt change is justified by this audit. Its current risks are already
covered by host validation and regression tests; adding prose would increase context cost
without increasing a proven boundary.

## Output evaluation

The visible regression set includes positive, negative and near-neighbor cases:

- a real independent deletion lifecycle may produce a Product Design Feature;
- an already-covered concern returns no-change;
- a missing edge case in an existing Feature routes to refinement rather than a new Card;
- ambiguous product authority produces one clarification;
- optional diagnostics cannot block Just Do It acceptance;
- a coordinator cannot reinterpret failed or passed Worker checks;
- a second unchanged repair cannot start another Worker.

The current evidence is deterministic parser, routing, fixture and browser evidence.
Provider-backed blind A/B output quality is **missing evidence** and is not claimed by this
audit. It becomes the next gate after enough real Product Design Completion requests exist
to form a holdout set.

## Rollback boundary

What’s Next Harness revision 7 isolates the new profile, Source-only readiness and its empty-Assumptions output
contract from prior provider Sessions. A
rollback removes Product Design Completion, restores revision 4 and leaves existing graph
nodes and Run artifacts readable. The Just Do It Harness remains revision 2 because its
contract did not change.
