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
- why each direction appears relevant to their current pain or desire;
- which directions feel worth accepting, combining, refining, or postponing;
  and
- what adjacent meaning becomes visible after a direction is understood.

What's Next does not own execution planning, delivery status, or pull-request
breakdown. A Candidate can nevertheless become feasible enough for direct
Implementation as a natural consequence of becoming concrete.

Every round produces two user-facing layers. A short Reflection helps the user
understand their own emerging intent, and Candidate Proposals capture the
durable directions that may be accepted. The Response is therefore part of the
product exploration, not merely a container around Cards.

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

The Harness should internally test whether each direction has a coherent value
loop:

- **Input:** what the user already has or is willing to provide;
- **Transformation:** what AgentManager would help them do;
- **Output:** what durable result would exist; and
- **Immediate value:** why that result matters to the user now.

This value loop is a reasoning check, not a mandatory user-facing Candidate
schema. What's Next should not make an early product proposal read like an
implementation contract.

The directions should be distinct by starting value or product behavior, not
merely by implementation technology or visual style. They may coexist and may
later converge. The user can favor one, mark several as important, combine
parts, refine one, or accept none.

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

### Reflection is a first-class Session result

Before or alongside the Candidate set, each round should provide a concise
Reflection that explains:

- how the Agent currently understands the user's idea;
- which pain, desire, tension, or connection appears most important;
- what became clearer through the latest user feedback; and
- why the following directions are worth considering now.

Reflection is allowed to be generative: one of its sentences may help the user
discover what they actually want. It must remain a user-auditable reasoning
summary, not a transcript of hidden deliberation or decorative prose.

Cross-Candidate observations belong in Reflection. Reasoning specific to one
direction belongs with that Candidate.

### Candidate presentation centers on pain-point fit

The minimum user-visible Candidate contains:

- a concise `title`;
- a `description` of the proposed possibility and the pain or desire it
  addresses; and
- a `rationale`, presented as **Why this direction**, that traces the proposal
  to signals in the user's input, selected origins, or Resources.

The rationale should make a short reasoning path inspectable: observed signal,
interpretation, and connection to the proposed direction. Material inference
is labeled lightly as an `assumption`. It must not fabricate a user belief or
fall back to generic claims such as improved experience or greater value.

The Canvas Card may remain compact with title and description. The detail view
can expose the rationale and assumptions so the user can correct one link in
the reasoning without rejecting the entire direction.

### Refine is strictly one-to-one

Refine means that the current direction is useful but its meaning, boundary, or
expression needs improvement.

- One Candidate enters and the same Candidate returns at its next revision.
- Title, description, rationale, and assumptions may change.
- No sibling, child, dependency, or Formal Node may be created.
- The response should summarize what changed because of the user's feedback.

If feedback suggests a materially different idea, the Agent may mention that
possibility but must not create it during Refine. Starting another exploration
is an explicit user choice.

### Sessions end at sufficient clarity or diminishing value

A What's Next Session explores one line of inquiry, not the whole product. It
may continue through several Reflections and Refines until:

- the user accepts enough meaning to close the Session; or
- the Agent observes that another round is likely to repeat existing meaning,
  produce only implementation detail, or belong to another branch.

The Agent recommends stopping but does not terminate the Session on the user's
behalf. It should offer the user the meaningful choices: accept, refine once
more, return to an earlier Formal Node, Decompose, Implement, or stop.

`Restart exploration` discards an entirely unaccepted Session and begins again
from the same origins under a corrected understanding. `Explore from this
Node` opens a new Session from any Formal Node without mutating its existing
children or dependencies. There is no graph-mutating Session-level Reframe.

### Effective decisions survive without the transcript

A clarification or Refine answer belongs to the active What's Next Session
and becomes authoritative input to its next proposal.

The Harness must incorporate effective decisions into the Candidate artifacts
that depend on them. When the user accepts a Candidate, its `output.md` must
preserve the product facts required to understand that direction without the
original conversation. It also preserves the relevant Reflection, rationale,
and still-material assumptions.

The complete dialogue does not become a collection of Formal Nodes. After
accepted meaning is written successfully, superseded revisions and transient
Session history move to the operating system's Trash. The durable result is
accepted product meaning and its useful rationale, not the transcript that
produced it.

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
  -> return one Reflection plus Candidate Proposals
  -> user accepts, combines, refines, postpones, or rejects
  -> Refine may only replace one Candidate in place
  -> diminishing value may trigger a recommendation to close or branch
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
- treat Reflection as disposable wrapper text around the Cards;
- generate implementation slices, pull-request plans, or delivery state;
- require every Candidate to be implementation-ready;
- require a Candidate to pass through Decomposition before Implementation;
- create siblings or children while refining one Candidate;
- mutate an accepted branch under a Session-level Reframe;
- silently replace accepted origins when branches converge; or
- preserve an entire discarded Session merely because its decisions once
  appeared in conversation.

## Open decisions

The following questions remain deliberately unresolved:

1. What exact schema and Markdown representation should store Reflection,
   rationale, and assumptions without forcing the internal value-loop check
   into the public contract?
2. How should the UI express actions such as primary direction, also important,
   combine, refine, postpone, and reject without turning discovery into a rigid
   ranking workflow?
3. What confirmation and cleanup interaction should distinguish Refine,
   Restart exploration, and Explore from this Node?
4. What exact provenance and conflict rules should apply when several Formal
   Nodes are selected as origins?
5. What user action selects the graph scope for future project-document
   synthesis?
6. Which real-project evaluations will show that the Harness finds useful
   starting value, respects boundaries, and uses acceptable Context?

These decisions should be settled through discussion and AgentManager
dogfooding before the placeholder executable Harness is replaced.
