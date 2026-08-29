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

What's Next grows a product outward from accepted facts. It helps the user move
from an idea or an existing formal Node to a small set of understandable choices
about what could become true next.

It does not:

- decompose an accepted scope into its constituent parts;
- produce an execution plan or pull-request breakdown;
- manage delivery status;
- replace the user's product judgment; or
- reduce every direction to one Agent Session.

The relationship between What's Next, general Decomposition, and future
Implementation work is defined in
[`DECOMPOSITION_MODEL.md`](DECOMPOSITION_MODEL.md).

## Settled decisions

### Atomicity is relative to product judgment

A What's Next Candidate is atomic at the current product-decision resolution.
The user must be able to understand, compare, accept, revise, or reject it as
one coherent direction.

The Candidate may still contain multiple design or implementation steps. It may
later be sent to Decomposition or pulled into an Implementation workspace. One
Agent Session or one pull request is not a universal size limit for a What's
Next Candidate.

### The Harness adapts to product maturity

The Harness has two distinct responsibilities depending on how much product
identity the supplied origins establish.

#### Product-shaping clarification

When materially different product identities are still plausible, the Harness
must ask one bounded product-shaping question before proposing adjacent product
additions.

The clarification must:

- present two or three concrete options rather than asking the user to invent
  the missing choices;
- describe the effect of each option;
- identify one recommended option when the evidence supports a recommendation;
  and
- focus on the unresolved decision that most changes what useful next
  directions would be.

For example, an origin containing only `I want to build AgentManager` may not
yet establish whether the product should be a local web workspace, a CLI-first
tool, or an Agent plugin. The Harness must not manufacture one feature set that
quietly assumes one of those identities.

#### Adjacent-growth proposal

Once the origins and explicit user answers establish a sufficiently stable
product direction, the Harness may propose adjacent-growth Candidates.

These Candidates:

- describe additions that could become true next;
- are grounded in the selected formal origins and current Instruction;
- are materially distinct by product outcome rather than merely by execution
  technique;
- may coexist, allowing the user to accept zero, one, or several; and
- must not restate the origins or decompose their existing boundary.

Product-shaping alternatives and compatible adjacent additions must not be
silently mixed into one proposal with ambiguous selection semantics.

### Effective decisions are preserved without preserving the transcript

A clarification answer belongs to the active What's Next Session and becomes
authoritative input to the next proposal.

The Harness must incorporate every effective answer into the Candidate
artifacts that depend on it. When the user accepts a Candidate, its `output.md`
must preserve the product facts required to understand that direction without
the original conversation.

The complete clarification dialogue does not become a collection of formal
Nodes and does not need to survive after the bounded Session is discarded. The
durable result is the accepted product meaning, not the transcript that led to
it.

### Growth creates a durable outcome

Every proposed direction must state what durable, observable product outcome
would exist if the user pursued it. Resolving an uncertainty may be one valid
outcome, but the Harness must not force every Candidate into the form of an
experiment.

A direction may produce a capability, interaction, product definition,
prototype, enabling foundation, or another coherent artifact that the user can
evaluate and continue from.

## Current decision flow

```text
Idea or selected formal origins
  -> inspect product identity
  -> if materially unstable: one clarification with concrete options
  -> preserve the user's answer inside the bounded Session
  -> if sufficiently stable: propose adjacent-growth Candidates
  -> user accepts zero, one, or several
  -> accepted Candidate artifacts preserve the effective product facts
  -> formal Nodes become possible origins for later growth
```

## Open decisions

The following questions remain deliberately unresolved:

1. What minimum evidence makes a product identity sufficiently stable for the
   Harness to stop clarifying and start proposing Candidates?
2. Which Candidate fields must be explicit in the schema rather than stored in
   flexible metadata?
3. How should the Harness rank relevance, novelty, adjacency, and expected
   product value without turning them into a rigid domain workflow?
4. What additional rules apply when several formal Nodes are selected as
   origins?
5. How should a continued Session request additional directions without
   duplicating or replacing earlier Candidates?
6. Which real-project evaluations will determine whether the Harness produces
   useful choices with acceptable Context and token cost?

These decisions should be settled through discussion and real AgentManager
dogfooding before the placeholder executable Harness is replaced.
