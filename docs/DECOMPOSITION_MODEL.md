# Product Growth, Decomposition, and Implementation Model

## Status

This document records AgentManager's current conceptual model for turning an
unclear idea into durable product meaning and, when the user chooses, into
delivered work. It defines the shared objects and operations before the
existing navigation, Harnesses, and storage models are generalized.

It does not define an implementation plan or require an immediate migration of
the current workspaces.

## Workspace display names

The user-facing workspaces are What's Next (下一步), Break It Down (拆开看),
and Just Do It (动手做). They expose growth, decomposition, and implementation
as independent choices, not a required sequence. Internal decomposition routes,
storage identifiers, and Harness contracts retain their existing names.

Just Do It replaces the former Dependencies navigation placeholder with an
[isolated demo](JUST_DO_IT_DEMO.md); its integrated execution workflow is not
implemented. Dependencies remain relationships
within the workspaces, not a separate product module.

## Relative atomicity

Atomicity is relative to the decision being made. A Card is not required to be
mechanically indivisible.

The same scope can be:

- atomic for product judgment because the user can understand, compare,
  accept, revise, or reject it as one coherent direction;
- atomic for decomposition because its intent and boundary are manageable for
  the user's current purpose; and
- non-atomic during implementation because delivery benefits from several
  independently verifiable steps or pull requests.

Further subdivision is almost always possible. That fact alone is not a reason
to keep decomposing. AgentManager stops at the resolution that the user finds
feasible for the next decision.

## Formal Nodes are shared product objects

The immutable UUID and stable relationship contract is defined in
[`STABLE_NODE_IDENTITIES.md`](STABLE_NODE_IDENTITIES.md). Candidate acceptance
changes its display alias and lifecycle, not its product-object identity.

A Formal Node is accepted, durable meaning in the product graph. It is not a
Task Decomposition object, a What's Next object, or an Implementation object.

A Formal Node can represent a product direction, capability, experience,
module, constraint, enabling foundation, implementation goal, or another
coherent object. Its meaning and provenance stay stable while different
workspaces operate on it.

Workspace-specific activity does not become part of the Formal Node:

- proposal and revision history belongs to a bounded Candidate Session;
- delivery status, owners, pull requests, gates, and retries belong to
  Implementation;
- opening a Node in another workspace does not copy or replace it; and
- execution evidence may propose new facts, but it does not silently rewrite
  accepted product meaning.

The Node records where it came from and which action created it. Those fields
describe provenance, not workspace ownership.

Just Do It goals have an independent execution lifecycle. Deleting a source
Formal Node does not delete its execution workspace; the retained goal shows
that its source was deleted. A surviving source Node can display a lightweight
associated completion indicator without gaining a Completed lifecycle state.
Stable source content does not require a source-update synchronization flow.
See [Just Do It source association](JUST_DO_IT.md#goal-dashboard-and-source-association--settled).

## Three independent operations

AgentManager exposes three different questions over the same product graph.
They are operations the user may choose, not mandatory phases in a pipeline.

### Grow with What's Next

> Starting from this idea or these accepted facts, what meaningful direction
> could become concrete next?

What's Next helps the user discover and articulate product meaning. Early in a
product, it may surface several different starting directions. Later, it may
grow an accepted direction with adjacent outcomes.

Its primary goal is concreteness, not execution planning. A concrete result may
nevertheless already be feasible enough to implement directly.

### Decompose

> What coherent, user-manageable parts exist inside this selected scope?

Decomposition converts an oversized or cognitively dense scope into a set of
bounded units. The selected scope may be an idea, Feature, Capability,
Experience, Module, research direction, implementation goal, or any other
Formal Node.

Decomposition should stop when each result:

- expresses one coherent intent;
- has a boundary distinguishable from its siblings;
- carries a manageable amount of Context for the user's current purpose;
- can be inspected, compared, accepted, or rejected independently; and
- gains little immediate decision value from another split.

Task Decomposition is one profile of this general operation. Decomposition
does not require every result to be implementation-ready.

### Implement

> I intend to make or validate this accepted meaning. What execution slices
> will do that safely and verifiably?

Implementation can start from any accepted Formal Node, whether it originated
in What's Next, Decomposition, manual authoring, or another future capability.
It turns the selected meaning into delivery-sized slices with:

- bounded inputs and authoritative Context;
- an explicit delivery outcome and inspectable output;
- acceptance criteria and verification gates;
- known execution dependencies;
- an Agent or human owner when execution begins; and
- delivery evidence such as commits, pull requests, reviews, and merges.

One Agent Session or one pull request is a useful default delivery scale, not a
universal product-level size limit. Several slices may share one pull request
when that creates the clearest implementation and review boundary. One Formal
Node may also require several pull requests without losing its identity.

Implementation is both a delivery tool and a way to test whether an idea is
actually feasible. Its evidence can inspire further growth or a revised
product decision without making delivery state part of the product graph.

### Just Do It workflow and prerequisites

Users explicitly add a goal Card, discuss a Plan, and work through its Actions.
Each Action supports repeated Input / Process / Output / Validation rounds;
producing an output is not equivalent to passing verification. The current
design focuses on a manual software-delivery loop, with automatic advancement
and shared local Git versioning deferred.

For A depending on B, A may be planned but cannot execute until B's agreed
delivery is verified. B's actual artifacts then become dependency inputs to A,
with visible provenance and on-demand context access. Goal-level dependencies
do not expand B's internal Plan into A's Canvas or add execution state to the
Formal Node.

The authoritative workflow, prerequisite contract, and open decisions are in
[`JUST_DO_IT.md`](JUST_DO_IT.md). Its state schema and rollback mechanics are
not yet finalized; the interactive demo is not an integrated execution workflow.

## The user owns routing

There is no required sequence among Grow, Decompose, and Implement.

For any accepted Formal Node, the user may:

- continue growing or refining it in What's Next;
- decompose it when its internal boundary is difficult to manage;
- implement it directly when it already feels feasible; or
- leave it as accepted product meaning without taking another action.

Choosing direct implementation does not certify that the Node is mechanically
indivisible. Choosing Decomposition does not imply that every user must make
the same choice. The product should expose these options without pretending it
can determine the only correct route.

Executability is therefore an affordance of a sufficiently concrete Node, not
a special Node type or lifecycle status.

## Operation-specific change semantics

Candidate change behavior follows the meaning of the operation rather than one
universal revision rule.

### What's Next Refine

Refine improves one proposed direction in place. It is always one Candidate to
one Candidate:

- the Candidate keeps its identity and advances its revision;
- its title, description, rationale, and assumptions may change;
- no sibling, child, dependency, or Formal Node is created; and
- a materially different idea requires a separate exploration chosen by the
  user.

### Decomposition Recompose

Recompose revisits how one selected scope is partitioned. Because decomposition
boundaries are relational, a better partition may contain a different number
of Candidates. Recompose therefore operates on the unaccepted proposal or
working set rather than pretending to revise one Card in isolation.

It may retain an unchanged Candidate, replace overlapping boundaries, split
one Candidate, merge several Candidates, or produce a different sibling set.
The complete proposed partition remains temporary until the user accepts its
results. Recompose cannot silently replace accepted Formal Nodes or migrate
their dependencies; restructuring an accepted graph is a separate future graph
operation.

The two operations may share storage, comparison, and rollback mechanics, but
their output contracts and cardinality guarantees are intentionally different.

## Divergence and convergence

The product graph is a directed acyclic graph, not a single tree and not a
linear roadmap.

- One unclear idea may grow into several plausible starting branches.
- A user may pursue one, several, or none of them.
- Each branch can be grown, decomposed, or implemented independently.
- Work on separate branches may reveal that a later outcome depends on several
  accepted origins.
- Such an outcome is represented by a multi-origin Formal Node rather than by
  copying one branch into another.

The Harness must preserve provenance and prevent cycles, but it must not assume
that siblings are mutually exclusive or that one branch owns every later Node.

## Product graph and project document are dual representations

The Node network is the structured, composable representation of the product.
It preserves boundaries, dependencies, provenance, and multiple lines of
growth. A complete project document is a synthesized narrative representation
of the same accepted meaning.

AgentManager should eventually support both directions:

- synthesize selected or complete accepted graph content into a coherent,
  large project document; and
- use a large project document as input to produce a Node network that covers
  its meaningful product content.

This is semantic duality, not a promise of an exact structural inverse. A
document may narrate ideas in a different order, and an Agent may choose
different Node boundaries when reconstructing the graph. The round-trip target
is preserved meaning, coverage, dependencies, and provenance—not byte-for-byte
text or identical graph geometry.

The synthesis action is a future capability. It is not part of the What's Next
Harness itself.

## Example: AgentManager

`I want to build AgentManager` did not initially define the complete product.
The user's strongest immediate need was to turn a large AI-generated project
document into manageable pieces. Exploring that need made Task Decomposition a
concrete direction.

After Task Decomposition existed, a new question became visible: where does the
large source document come from? That question grew into What's Next, an
iterative way to turn an unclear idea into accepted product meaning.

Once both existed, another gap became clear: accepted Cards still needed a
place to become executable work without mixing pull-request state into the
product graph. That gap grew into Implementation.

These capabilities did not emerge from a complete up-front system guess. They
grew from different immediate needs and can eventually form one connected
product network. A What's Next Card may go straight to Implementation; Task
Decomposition is available when the user wants another level of resolution,
not as a required checkpoint.

## Harness implications

### What's Next Harness

The Harness should make unclear intent progressively concrete. It should not
guess the entire final system, require a full product identity before offering
useful directions, or turn every Candidate into an execution plan. A Candidate
may become directly implementable as a consequence of becoming concrete.
Refine remains a strict one-to-one operation within the current direction.

Detailed decisions are recorded in
[`WHATS_NEXT_HARNESS.md`](WHATS_NEXT_HARNESS.md).

### Decomposition Harness

The Harness should receive or infer the purpose of the current decomposition.
It should stop when the results are coherent, distinguishable, and manageable
at that resolution. It must not keep splitting solely because more execution
steps could exist.

When the user challenges the proposed partition rather than one Card's wording,
the Harness should Recompose the unaccepted working set. The result may change
Candidate cardinality. The existing runtime's one-Candidate `revise-candidate`
operation remains a compatibility constraint until a proposal-level Recompose
contract and validator are implemented together.

### Implementation Harness

The Harness may optimize for delivery-sized slices. It should define explicit
inputs, outputs, acceptance criteria, gates, and dependencies while preserving
a reference to the Formal Node whose meaning it is implementing.

No single size rule applies unchanged across these operations.

## Operating model

```text
                         +------------------+
                         |   Formal Node    |
                         | accepted meaning |
                         +------------------+
                           /       |       \
                          /        |        \
                  Grow further  Decompose  Implement
                    What's Next      |       directly
                         |            |          |
                         v            v          v
                    Candidates   coherent     execution
                         |          units       slices
                         |            |          |
                         +-- accept --+----------+
                                  |
                                  v
                         new Formal Nodes or
                          delivery evidence
```

The graph may expand through any of these routes. AgentManager manages changing
resolution and durable relationships without prescribing one universal
workflow.
