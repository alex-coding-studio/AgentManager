# What's Next Harness Design

## Status

This document records the product decisions currently accepted for
AgentManager's built-in What's Next Harness. It separates settled behavior from
open design questions so the executable Harness is not written ahead of the
product model.

The current prompt in `lib/whats-next-harness.ts` remains a placeholder. This
document is not yet the executable prompt, a final output schema, or an
implementation plan.

## Purpose

What's Next turns an unclear idea into progressively more concrete product
meaning. It does so through several bounded rounds instead of trying to infer a
complete final system from the user's first sentence.

The Harness helps the user discover:

- what they most want to become possible now;
- several concrete directions from which that value could begin;
- what each direction would take in and make true;
- which directions feel worth accepting, combining, refining, or postponing;
  and
- what adjacent meaning becomes visible after a direction is understood.

What's Next does not own execution planning, delivery status, or pull-request
breakdown. A Candidate can nevertheless become feasible enough for direct
Implementation as a natural consequence of becoming concrete.

Formal Nodes and the independent Grow, Decompose, and Implement operations are
defined in [`DECOMPOSITION_MODEL.md`](DECOMPOSITION_MODEL.md).

## Settled decisions

### Start from the user's strongest current desire

For a chaotic idea, the Harness must not begin by guessing the full product
identity or enumerating the eventual system's complete feature set.

It should identify the present friction, desired possibility, or outcome that
appears most important to the user now. Different users can begin from
different needs and later grow toward overlapping capabilities. The first
proposal is a set of plausible starting branches, not a vote on mutually
exclusive final products.

### Use discovery directions before clarification when possible

When the supplied idea does not yet establish a coherent local value loop, the
Harness should normally produce four or five materially different discovery
directions.

Each direction must make the following reasoning legible:

- **Input:** what the user already has or is willing to provide;
- **Transformation:** what AgentManager would help them do;
- **Output:** what durable result would exist; and
- **Immediate value:** why that result matters to the user now.

The directions should be distinct by starting value or product behavior, not
merely by implementation technology or visual style. They may coexist and may
later converge. The user can favor one, mark several as important, combine
parts, revise one, or accept none.

This discovery proposal is itself useful product work. It avoids asking the
user to invent all missing structure while also avoiding a premature guess of
the complete system.

### Clarification is a bounded fallback

The Harness should ask a clarification question only when ambiguity or conflict
prevents it from presenting honest discovery directions. Clarification is not
a mandatory first stage.

When required, one clarification should:

- present two or three concrete options;
- describe the consequence of each option;
- recommend one only when the supplied evidence supports it; and
- resolve the smallest uncertainty that blocks a useful proposal.

The Harness then returns to discovery or growth. It must not create an
unbounded interview or require the user to define a complete product identity.

### Grow adjacent meaning after a local value loop is coherent

Once the selected origins and current Instruction establish a coherent local
value loop, the Harness may propose two to five adjacent-growth Candidates.

These Candidates:

- describe outcomes that could become true next;
- are grounded in the selected formal origins and current Instruction;
- are materially distinct by product meaning rather than execution technique;
- may coexist, allowing the user to accept zero, one, or several;
- do not merely restate or mechanically decompose the selected origins; and
- explain why each direction is adjacent and what it may unlock.

The threshold is local clarity, not a settled specification for the whole
product. A branch can grow coherently while other parts of the product remain
unknown.

### Atomicity is relative to product judgment

A What's Next Candidate is atomic when the user can understand and judge it as
one coherent direction. It need not be mechanically indivisible or fit in one
Agent Session or pull request.

The same accepted Candidate may be:

- grown or refined again in What's Next;
- sent to Decomposition when the user wants to expose its internal parts;
- sent directly to Implementation when the user already finds it feasible; or
- left as accepted product meaning.

What's Next makes ideas concrete. Direct executability is a useful possible
result, not the Harness's required endpoint. The Harness must not route the
user automatically or imply that Decomposition is mandatory.

### Effective decisions survive without the transcript

A clarification or revision answer belongs to the active What's Next Session
and becomes authoritative input to its next proposal.

The Harness must incorporate effective decisions into the Candidate artifacts
that depend on them. When the user accepts a Candidate, its `output.md` must
preserve the product facts required to understand that direction without the
original conversation.

The complete dialogue does not become a collection of Formal Nodes and does
not need to survive after the bounded Session is discarded. The durable result
is accepted product meaning, not the transcript that produced it.

### Branches may diverge and later converge

Discovery directions and adjacent Candidates are not assumed to be mutually
exclusive. Separate branches can reveal a later outcome that requires several
accepted origins.

The Harness must therefore support multi-origin reasoning as a core behavior,
not an edge case. A converged Candidate must state what each origin contributes
and must not silently merge or rewrite those origins. Accepted output becomes
one Formal Node with explicit provenance to all selected origins.

### Accepted meaning joins the shared graph

What's Next produces Candidates. Acceptance promotes a Candidate to a Formal
Node in the shared product graph. The resulting Node does not belong to What's
Next and may later be grown, decomposed, implemented, or used in future
synthesis.

The complete graph may eventually be synthesized into a large coherent project
document. Conversely, a large project document may be used to produce a graph
that semantically covers its content. That bidirectional representation is a
future system capability, not an instruction for this Harness to generate the
whole product in one round.

## Behavior selection

```text
Idea or selected Formal Nodes
  -> identify the strongest current desired value
  -> can honest, distinct starting directions be proposed?
       no  -> ask one bounded clarification with 2-3 options
       yes -> is there a coherent local Input -> Transformation -> Output loop?
                no  -> propose 4-5 discovery directions
                yes -> propose 2-5 adjacent-growth Candidates
  -> user accepts, combines, revises, postpones, or rejects
  -> preserve effective decisions in Candidate artifacts
  -> accepted Candidates become shared Formal Nodes
  -> user independently chooses Grow, Decompose, Implement, or stop
```

The numbers guide a useful default, not a quota. The Harness should return
fewer directions when additional ones would be cosmetic duplicates, and it
should not exceed the range merely to appear comprehensive.

## Harness boundaries

The Harness must not:

- infer the complete final system from one unclear idea;
- treat discovery directions as mutually exclusive product identities by
  default;
- ask the user to supply structure that the Harness can offer as concrete
  choices;
- confuse adjacent growth with decomposition;
- generate implementation slices, pull-request plans, or delivery state;
- require every Candidate to be implementation-ready;
- require a Candidate to pass through Decomposition before Implementation;
- silently replace accepted origins when branches converge; or
- preserve an entire discarded Session merely because its decisions once
  appeared in conversation.

## Open decisions

The following questions remain deliberately unresolved:

1. Which reasoning elements should become explicit Candidate schema fields
   rather than flexible metadata or `output.md` content?
2. How should the UI express actions such as primary direction, also important,
   combine, revise, postpone, and reject without turning discovery into a rigid
   ranking workflow?
3. How should a continued Session request additional directions without
   duplicating or replacing earlier Candidates?
4. What exact provenance and conflict rules should apply when several Formal
   Nodes are selected as origins?
5. What user action selects the graph scope for future project-document
   synthesis?
6. Which real-project evaluations will show that the Harness finds useful
   starting value, respects boundaries, and uses acceptable Context?

These decisions should be settled through discussion and AgentManager
dogfooding before the placeholder executable Harness is replaced.
