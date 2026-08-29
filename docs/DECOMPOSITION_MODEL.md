# Decomposition and Work Resolution Model

## Status

This document records AgentManager's current conceptual model for product
growth, decomposition, and implementation. It defines product language and
stage boundaries before the existing navigation, Harnesses, and storage models
are renamed or generalized.

It does not define an implementation plan or require an immediate migration of
the current Task Decomposition workspace.

## Relative atomicity

Atomicity is relative to the stage at which a Card is being used. A Card is not
required to be mechanically indivisible.

The same piece of work can be:

- atomic as a product decision because the user can understand, compare,
  accept, revise, or reject it as one coherent direction;
- atomic as a decomposition result because its intent and boundary are clear
  enough for the user's current purpose; and
- non-atomic during implementation because delivery may benefit from several
  independently verifiable steps or pull requests.

Further subdivision is always mechanically possible. That fact alone is not a
reason to keep decomposing. AgentManager stops at the resolution that makes the
work understandable and manageable for the next decision.

## Three work resolutions

### Product-direction resolution

The What's Next workspace answers:

> Given the product facts already accepted, what coherent additions could
> become true next?

Each Candidate is atomic at the product-decision level. It names one direction
the user can evaluate as a whole. It may still contain multiple design or
implementation steps.

A useful Candidate:

- adds one durable and observable product outcome;
- is adjacent to the selected formal origins;
- explains why it is useful now and what it unlocks;
- has a boundary that distinguishes it from the other Candidates; and
- can be accepted without silently accepting every other Candidate in the
  proposal.

What's Next does not promise that an accepted Candidate is ready for direct
implementation.

### Human-manageable decomposition resolution

The general Decomposition capability answers:

> How can this selected scope be represented as a set of coherent units that
> the user can understand and control?

The selected scope may be a product idea, Feature, Capability, Experience,
Module, research direction, implementation goal, or another domain object. A
decomposition result is not necessarily an executable task.

Decomposition should stop when every resulting item:

- expresses one coherent intent;
- has a boundary distinguishable from its siblings;
- carries a manageable amount of Context for the user's current purpose;
- can be inspected, revised, accepted, or rejected independently; and
- gains little additional decision value from another immediate split.

The user is the final judge of whether this resolution is feasible. The Harness
must not continue splitting solely to reach an abstract definition of the
smallest possible task.

Task Decomposition is one profile of this more general capability, not the
definition of the capability itself.

### Delivery resolution

The future Implementation workspace answers:

> I intend to complete this accepted item. What execution slices will deliver
> it safely and verifiably?

This is where AgentManager may turn one coherent upper-level Card into several
delivery slices. Each slice should have:

- bounded inputs and authoritative Context;
- one explicit output;
- acceptance criteria and verification gates;
- known execution dependencies;
- an Agent or human owner when execution begins; and
- delivery evidence such as commits, pull requests, reviews, and merges.

One Agent Session or one pull request is a useful default delivery scale, not a
universal product-level size limit. Several slices may be combined into one
pull request when their shared Context and review boundary make that delivery
clearer. A larger Card may use several pull requests without losing its
upper-level identity.

## Workspace responsibilities

### What's Next

- expands outward from accepted product facts;
- proposes a small set of materially distinct adjacent directions;
- lets the user accept zero, one, or several directions;
- preserves accepted directions as new formal facts; and
- does not decompose an existing boundary or create an execution plan.

### Decomposition

- converts an oversized or cognitively dense scope into user-manageable units;
- preserves the selected parent's meaning rather than inventing a different
  product;
- adapts its stopping resolution to the user's purpose;
- does not require every output to be implementation-ready; and
- does not own execution status, pull requests, or delivery evidence.

### Implementation

- pulls an accepted formal Card into an execution workspace;
- breaks it down according to delivery concerns;
- tracks inputs, outputs, gates, dependencies, and execution evidence; and
- becomes the integration boundary for pull requests, Issues, external task
  systems, and future delivery automation.

## Cross-workspace identity

Moving work to a higher-resolution workspace does not replace or copy the
meaning of the source Card.

- A Decomposition result records the formal scope from which it was derived.
- An Implementation item records the accepted Card it intends to deliver.
- Lower-level execution state does not become product-definition state.
- Pull-request and delivery status do not pollute the product-growth graph.
- Completing or revising a child does not silently rewrite its parent.

Each workspace owns the additional detail required at its resolution while
retaining a stable reference to the authoritative upper-level intent.

## Example: project environment

`Configure the project environment` can be one valid product or decomposition
Card. At that resolution, it expresses one coherent result: the product has a
reproducible foundation on which later work can run.

When pulled into Implementation, it might become several slices:

1. initialize the TypeScript application and package configuration;
2. define the local asset and JSON storage layout;
3. add lint, type-check, test, and production-build gates; and
4. expose the documented command-line startup path.

Those slices may be delivered through one pull request or several. The delivery
choice does not invalidate the atomicity of the upper-level Card because the
upper-level Card is atomic for product judgment, not for source-code mutation.

## Harness implications

### What's Next Harness

The Harness should require each Candidate to be atomic at the current
product-decision resolution. It must not require every Candidate to fit in one
Agent Session or phrase every direction as an experiment. It should state the
new durable outcome, why it is adjacent, what it unlocks, and what remains
outside its boundary.

### Decomposition Harness

The Harness should receive or infer the purpose of the current decomposition.
It should stop when the resulting Cards are coherent, distinguishable, and
manageable at that resolution. It must not continue splitting merely because a
Card contains multiple possible execution steps.

### Implementation Harness

The Harness may optimize for delivery-sized slices. It should define explicit
inputs, outputs, acceptance criteria, gates, and dependencies, and it may use an
Agent Session or pull request as a practical sizing signal.

No single size rule applies unchanged across all three Harnesses.

## End-to-end model

```text
Idea or accepted product facts
  -> What's Next
Possible adjacent product directions
  -> user acceptance
Formal product Nodes
  -> Decomposition
Human-manageable scope units
  -> pull into Implementation
Execution slices
  -> Agent or human delivery
Commits, pull requests, review, merge, and acceptance evidence
```

AgentManager therefore manages the progressive resolution of intent. It does
not attempt to reduce every idea directly into indivisible tasks in one pass.
