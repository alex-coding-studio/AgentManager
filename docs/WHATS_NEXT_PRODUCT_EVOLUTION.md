# What’s Next Product Evolution

Status: Phase 1 implementation. Discovery and Product Design projections, MVP Exploration,
Feature Synthesis, Diverge and Converge form the first delivered slice. Domain Model and
Break It Down reuse remain future directions.

## Problem

What’s Next began as a prototype-discovery tool. Its current Harness assumes an emerging
idea should advance one semantic level at a time toward another user-observable direction,
without guessing a complete final system. That protects early exploration, but it also
creates three limitations once a product has validated useful MVP behavior:

1. The same Source cannot easily receive additive explorations under a different intent.
2. Explore requires several distinct directions even when the user has already described
   one coherent initiative that should converge into one node.
3. Product Design, Domain Model and implementation-readiness artifacts have no explicit
   semantic home, so a high-level Feature can reach Just Do It before its required design
   translation exists.

The desired model keeps What’s Next useful throughout product discovery and formalization
without turning it into a mandatory pipeline for every project.

## Scope discipline

AgentManager is personal-first. Broader applicability should emerge from repeated real use,
not from prebuilding organization-scale process. Product evolution follows these rules:

- solve one observed, repeated workflow cost at a time;
- keep the ordinary path smaller than the advanced path;
- add a persistent module only after a lightweight operation repeatedly proves insufficient;
- hide optional sophistication until the user explicitly needs it;
- protect the usability of What’s Next, Break It Down and Just Do It before expanding their
  scope;
- generalize a mechanism only after it succeeds across several concrete Cards or projects;
- measure whether each addition reduces user effort, Agent time or delivery risk;
- stop or remove an abstraction that creates more state than value.

The Layers and later phases in this document are a coherent design direction, not a promise
to implement every surface. Near-term work should remain a thin, testable slice, be used in
real product development, and earn the next increment through evidence.

## Core model

### One global Source

A product has one stable Source or Idea, such as:

> Build an app that tracks real-world organizing relationships so a user can find physical
> items after forgetting where they were placed.

The Source is global. It does not belong to one Layer and appears as the shared anchor in
every Layer projection. Every generated node records how it serves this product anchor.

### One Product Graph, several Layer projections

The underlying Product Graph owns global node identity, provenance and dependency
relationships. The Canvas displays one Layer projection at a time. Switching Layer changes
both the rendered node set and the rendered internal edges.

The agreed long-term Layers are:

- Discovery
- Product Design
- Domain Model

Technical decisions are not a default Graph Layer or mandatory standalone module. For a
personal app, straightforward implementation remains Agent-owned. A lightweight
Implementation Approach appears only when one material, durable technical choice needs user
input.

Break It Down and Just Do It remain independent modules rather than mandatory downstream
steps.

## Discovery Layer

Discovery preserves the real exploration history. It may be structurally noisy because it
contains divergent alternatives, revisions, rejected assumptions and later convergence.

Discovery node kinds may include:

- Idea
- Hypothesis
- MVP
- Validated Finding

Example:

```text
Product Source
├── Exact-search MVP
├── Container-note-search MVP
├── Entry-independent-search MVP
└── other validated search experiments
```

Discovery is therefore an organized product-learning space, not merely a collection of
small disposable cards. A formal Feature is generated directly in Product Design; an
intermediate Discovery Feature would only add another translation step without adding
meaning.

## Product Design Layer

Product Design is a distilled, high-level view of the formal product. It should contain
few nodes with rich Markdown rather than reproducing every discovery branch.

Example:

```text
Product Source
├── Registration Product Design
├── Browsing Product Design
├── Search Product Design
└── Correction Product Design
```

A Product Design Feature may be generated directly from one or more validated Discovery
nodes by Feature Synthesis. It is a new node, not a moved or retyped Discovery node, and it
does not require an intermediate Discovery Feature.

The global graph retains provenance:

```json
{
  "layer": "product-design",
  "artifactKind": "feature",
  "productRoot": "source-uid",
  "derivedFrom": ["discovery-mvp-uid-1", "discovery-mvp-uid-2"]
}
```

The Product Design Canvas renders the direct product structure, for example Source to
Search Product Design. Cross-Layer Discovery provenance remains available in node details
but is not drawn as the primary Canvas structure.

Product Capability, User Flow, Product Rule, interaction decisions, scope and acceptance
usually belong as sections inside the Product Design Markdown. They do not need separate
Graph nodes unless they acquire independent meaning and reuse.

A Product Design document may use this structure:

```markdown
# Unified Search Product Design

## User problem

## Product capability

## User flows

## Product rules

## Interaction with existing features

## Scope

## Non-goals

## Acceptance

## Open questions
```

## Domain Model Layer

Domain Model explains the product through its concepts and relationships. It is related to
data modeling but is not yet a SwiftData schema, database table design or repository API.

For HereItIs, candidate concepts include:

- Space
- Item
- Container
- Location
- Container Note
- Activity

Example relationships:

```text
Space contains Container
Container contains Item
Container has Location
Container may have Container Note
Activity may affect Item or Container
```

The Layer can explore alternative models, such as:

- Item and Container as independent types;
- Container as an Item that may contain children;
- all organizing objects represented as a tree;
- current state plus a separate Activity history.

Each Domain node owns its definition, properties, invariants, relationships and unresolved
questions. The accepted Domain Model gives implementation Agents stable product semantics while
leaving storage technology open until a material choice actually matters.

## Intentions

Intention determines the semantic goal, destination Layer and output artifact kind. It is
selected per Run; the project does not have one globally locked maturity phase.

The first What’s Next intentions are:

| Intention                 | Destination    | Typical output                                     |
| ------------------------- | -------------- | -------------------------------------------------- |
| MVP Exploration           | Discovery      | concrete MVPs for product-value discussion         |
| Feature Synthesis         | Product Design | Features synthesized from selected Discovery proof |
| Product Design Completion | Product Design | a justified missing Feature or an honest no-change |

Product Design Completion starts after the product goal is coherent. Selecting the Product
Source triggers the operation; it is not a manual Context boundary. The Product Source and
every accepted Product Design Feature sibling are implicit primary Context. The user's
Instruction identifies a possible product gap. The
Harness first decides whether the concern deserves a separate Feature. Existing coverage
returns no-change, a missing rule inside one Feature routes to refinement, and material
ambiguity returns one clarification. It must not create a nominal Feature merely to answer.
Every Product Design Feature remains a direct child of the Product Source. Interactions
with sibling Features belong in Markdown; only true prerequisites become dependencies.
When no accepted Product Design Feature exists, Completion may create the first Feature or
several Features from a coherent Source when the Instruction exposes equally clear,
independent product boundaries. A supplied Product Design document may define many such
boundaries. Unspecified Motion returns one Candidate per real boundary without an arbitrary
Card-count limit. A broad request without boundaries returns clarification.

Document synthesis may later create a Product Context candidate, but direct repository
document writes remain outside What’s Next.

## Motion

Motion controls how the selected evidence is transformed. It does not decide the
destination Layer.

### Diverge

- Generate two to five materially distinct nodes.
- Expand the meaningful option space under the selected Intention.
- Stay honest about unsupported invention and duplication.

### Converge

- Generate exactly one aggregate node.
- Preserve important contributions from every selected source.
- Identify conflicts, exclusions and unresolved assumptions.
- Refuse forced synthesis through one bounded clarification when sources are materially
  incompatible.

Examples:

```text
Several MVPs + Feature Synthesis + Converge
→ one Product Design Feature

Several MVPs + Domain Model synthesis + Converge
→ one Domain Model proposal
```

The system should allow evidence-supported cross-Layer transformations without enforcing a
fixed pipeline. Intention owns the destination; Motion owns cardinality and transformation.

## Additive exploration from the same Source

The same Source must support several additive Runs under different intentions. A prior Run
must not monopolize the Source.

Required operations are:

- Append: add new nodes without abandoning prior accepted or candidate meaning;
- Redo: explicitly abandon one unaccepted proposal and replace it;
- Refine: revise exactly one Candidate in place;
- Converge: aggregate selected nodes into one new node.

Examples:

```json
{
  "sourceUid": "product-source",
  "intent": "prototype-exploration",
  "operation": "append"
}
```

and later:

```json
{
  "sourceUid": "product-source",
  "intent": "product-hypothesis",
  "operation": "append"
}
```

Existing nodes remain comparison Context. The Harness should return no-change rather than
inventing near-duplicates solely because Append was requested.

## Canvas interaction

The first What’s Next Canvas uses a Layer switcher:

```text
[Discovery] [Product Design]
```

The global Source remains visible in every Layer. The rest of the rendered nodes and
internal edges belong to the selected Layer.

Cross-Layer provenance is shown through compact portals or source summaries, for example:

```text
Discovery sources · 3
Product Design sources · 1
```

Selecting the portal switches Layer and highlights the referenced nodes. An optional
Overview may later show a read-only high-level cross-Layer projection, but it is not the
default work surface.

The node plus action is replaced in What’s Next by a persistent check-mark control. Single
and multiple selections use the same fixed bottom-right action card. The card owns optional
guidance, Intention, Motion and Agent settings. The generated artifact is placed in the
destination owned by Intention.

Source is the shared anchor and has an exclusive selection rule: it may be selected only by
itself and cannot be combined with another node. Repeated Runs from Source, including the
same Intention, append new meaning rather than replacing earlier nodes. Redo remains the
explicit replacement operation.

## Relationship semantics

The graph keeps different relationships distinct:

- `productRoot`: the shared global Source;
- `derivedFrom`: conceptual provenance and evidence;
- `dependsOn`: an execution or completion prerequisite;
- Layer-specific semantic relations, such as Domain relationships.

When a Candidate requires an unfinished origin’s behavior to exist, that origin must be an
explicit `dependsOn` relationship as well as provenance. Conceptual influence alone remains
`derivedFrom`.

Just Do It dependency review now detects unfinished formal origins in
`derivedFrom - dependsOn` and requires an explicit user decision before planning or
execution. That delivered guard remains independent from the future What’s Next Harness
improvements.

## Lightweight implementation bridge

AgentManager is designed for one person working with Agents. It should not require a large
Technical Design document before ordinary feature delivery. The default path is:

```text
Discovery → Product Design → EXPERIENCE → Agent implementation and user UI acceptance
```

Domain Model is an optional input when product concepts or relationships need explicit
clarification. Existing projects may start directly from their Product Design, EXPERIENCE,
Project context and codebase.

### Implementation Readiness Check

Before Just Do It confirms a Plan, the Coordinator performs a bounded readiness check. It
asks whether one unresolved technical decision would materially change persistence, public
interfaces, migration, synchronization, concurrency, security or several future features.

If no such decision exists, planning continues immediately. The execution Agent owns local
implementation choices.

If one exists, the system opens a lightweight Implementation Approach discussion. This is
not a new default module and does not require a fixed document structure. It records only
what the current feature needs, commonly:

- objective and current constraint;
- alternatives that materially differ;
- chosen approach and user ruling;
- migration, risk or validation notes when applicable.

A simple note may be only a few paragraphs. For example, a local-first persistence decision
may compare retaining JSON with adopting SwiftData, record the user preference for
SwiftData plus portable JSON export, and then return to planning. It does not need generic
sections for module boundaries, performance, rollout or error handling when those topics are
not material.

### Triggers

The optional discussion is appropriate when:

- persistence or schema migration has durable consequences;
- a shared package or public API changes;
- synchronization, concurrency, security or destructive data behavior is involved;
- several plausible approaches have significantly different future costs;
- the user explicitly asks to compare implementation approaches.

It is skipped for straightforward local features, ordinary UI work and decisions that an
implementation Agent can safely make and validate inside one delivery.

### Handoff to execution

Product Design and EXPERIENCE remain the normal product contract. Domain Model and a
lightweight Implementation Approach are attached only when relevant. Just Do It then creates
its existing concrete Plan, Action contracts and required checks. A separate Delivery
Contract is not mandatory for ordinary personal-app work.

Complex work may still be sent to Break It Down before execution. That is a user choice, not
a required pipeline stage.

## Break It Down remains independent

Break It Down accepts any sufficiently complete input, including an existing project,
Project JSON, Product Design, EXPERIENCE, an optional Implementation Approach or a direct
user request.
It is not coupled to What’s Next.

The same Intention and Motion vocabulary may later make decomposition more focused:

- decompose for understanding;
- decompose for Product Design;
- decompose for an implementation approach;
- decompose for delivery;
- decompose for risk analysis.

That reuse does not create a mandatory pipeline.

## HereItIs search example

### Discovery

- Exact-search MVP
- Container-note-search MVP
- Entry-independent-search MVP
- Unified Search Feature

### Product Design

- Unified Search Product Design

### Domain Model

- Item
- Container
- Container Note
- Location
- accepted relationship model

### Optional Implementation Approach

Only if the persistence choice is material:

- compare retaining JSON with adopting SwiftData;
- record the chosen primary store and portable export boundary;
- note the one-time migration and validation requirements.

### Execution

Just Do It uses the Product Design, EXPERIENCE, current repository and any relevant Domain
Model or decision note. Required code checks stay separate from user UI acceptance.

## Proposed implementation sequence

Only Phase 1 is a plausible near-term product change, and it still requires focused design
agreement and real-use validation. Later phases remain optional directions rather than a
committed roadmap. Each phase should stop for dogfooding before another begins.

### Phase 0: dependency and Card safety

Delivered:

- unfinished lineage dependency review before planning/execution;
- explicit prerequisite versus conceptual-source decisions;
- deletion of an unconfirmed Just Do It Card through system Trash.

### Phase 1: Discovery and Product Design slice

- add Intention, Motion and Append/Redo/Refine/Converge operations;
- remove prototype-only wording from the Core Harness;
- make output cardinality depend on Motion;
- preserve backward compatibility by treating existing nodes as Discovery directions;
- provide MVP Exploration and Feature Synthesis profiles;
- provide Product Design Completion with implicit Source and accepted-Feature Context;
- generate Product Design Features directly from Discovery evidence;
- replace node plus actions with persistent check-mark selection and one fixed action card;
- keep Source selection exclusive and repeated Source exploration additive.

### Phase 2: broader Layer projections and Product Anchor

- introduce global Source identity and Layer metadata;
- extend Discovery and Product Design projections when dogfooding supports it;
- consider Domain Model as a separate projection only after concrete use earns it;
- retain separate layout state per Layer;
- show cross-Layer provenance through compact portals;
- add the cross-Layer selection basket.

### Phase 3: optional Domain Model profiles

- add intent-specific Harness profiles and Skills;
- support Domain Model divergence and convergence;
- persist artifact kind and execution-readiness metadata.

### Phase 4: lightweight implementation bridge and module reuse

- add a bounded Implementation Readiness Check before Plan confirmation;
- surface only material technical decisions as a short, revisable note;
- keep straightforward implementation choices Agent-owned;
- allow optional Break It Down routing;
- evaluate shared Intention/Motion concepts inside Break It Down;
- support Product Context document candidates without direct repository writes.

## Open product decisions

The following remain intentionally unresolved for focused follow-up discussion:

1. Final user-facing Intention labels and how many appear in the first release.
2. Whether a later Product Design intention should support one whole-product Design Doc in
   addition to Feature Synthesis.
3. Whether future Domain concepts use individual nodes or may remain one aggregate proposal
   before convergence.
4. How the cross-Layer selection basket behaves when source nodes conflict.
5. Which concrete conditions trigger a lightweight Implementation Approach instead of
   immediate planning.
6. Which Intention/Motion concepts should be shared with Break It Down in its first update.

## Evaluation

The redesign is successful when:

- one Source can append several non-duplicative explorations under different intentions;
- Diverge yields several useful alternatives and Converge yields exactly one honest
  aggregate;
- selected Discovery evidence can become a rich but visually simple Product Design Feature
  without an intermediate translation node;
- Domain Model explains concepts without prematurely choosing storage technology;
- straightforward personal-app work reaches execution without a mandatory technical-design
  document;
- material, durable technical choices receive one bounded user/Agent decision before
  execution;
- existing projects and direct Break It Down use remain valid;
- Canvas projections remain readable even as the global Product Graph grows.
