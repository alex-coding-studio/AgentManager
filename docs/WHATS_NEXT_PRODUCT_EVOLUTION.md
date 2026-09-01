# What’s Next Product Evolution

Status: product and architecture proposal. This document preserves the agreed direction
before implementation. It does not change the current What’s Next Harness or graph data.

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

Technical Design is deliberately not a Graph Layer. It is a Card workspace that aggregates
multiple graph sources, project context and user decisions into one revisable design
document.

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
- Feature
- Module

An MVP does not have to remain a short sentence. Several validated MVP nodes may converge
into a detailed Feature node while remaining in Discovery.

Example:

```text
Product Source
├── Exact-search MVP
├── Container-note-search MVP
├── Entry-independent-search MVP
└── Unified Search Feature
```

The Unified Search Feature can carry rich Markdown describing:

- the user problem;
- evidence from each prototype;
- why the capability belongs in the product;
- boundaries and excluded experiments;
- interactions with already validated features;
- unresolved assumptions.

Discovery is therefore an organized product-learning space, not merely a collection of
small disposable cards.

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

A Product Design node may be generated from one or more validated Discovery nodes by a
dedicated Product Design intent and Skill. It is a new node, not a moved or retyped
Discovery node.

The global graph retains provenance:

```json
{
  "layer": "product-design",
  "artifactKind": "design-doc",
  "productRoot": "source-uid",
  "derivedFrom": ["discovery-feature-uid"]
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
questions. The accepted Domain Model gives Technical Design stable product semantics while
leaving storage technology open.

## Intentions

Intention determines the semantic goal, destination Layer and output artifact kind. It is
selected per Run; the project does not have one globally locked maturity phase.

Initial What’s Next intentions should include:

| Intention                      | Destination    | Typical output                     |
| ------------------------------ | -------------- | ---------------------------------- |
| Prototype exploration          | Discovery      | MVPs or experience hypotheses      |
| Product hypothesis exploration | Discovery      | user/value assumptions             |
| Feature synthesis              | Discovery      | one validated Feature or Module    |
| Product Design                 | Product Design | one formal Product Design document |
| Domain Model exploration       | Domain Model   | alternative concepts or models     |
| Domain Model synthesis         | Domain Model   | one accepted conceptual model      |

Technical Design is an intention that creates a Technical Design Card workspace rather
than a graph node in a Technical Design Layer.

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
Several MVPs + Feature synthesis + Converge
→ one Discovery Feature

Several Discovery Features + Product Design + Converge
→ one Product Design document

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

The What’s Next Canvas uses a Layer switcher:

```text
[Discovery] [Product Design] [Domain Model]
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

A temporary selection basket supports cross-Layer synthesis. Users can select nodes in one
Layer, switch Layer, add more sources, then choose Intention and Motion. The generated
artifact is placed in the destination owned by Intention.

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

## Technical Design Card workspace

Technical Design combines Product Design, Domain Model, Discovery evidence, current code
and project constraints. Its natural representation is one aggregate, revisable Card rather
than another graph projection.

### Sources

A Technical Design Card may retain:

- Product Design nodes;
- Domain Model nodes;
- validated Discovery evidence;
- repository and code context;
- current Project documents;
- platform constraints and user instructions.

### Document

The Card owns one Technical Design Markdown document with sections such as:

```markdown
# Technical Design

## Goal and source product behavior

## Current implementation

## Technical constraints

## Decisions

## Domain-to-storage mapping

## Module boundaries

## Data and control flow

## Persistence and migration

## Error handling

## Performance boundary

## Validation strategy

## Delivery and rollout

## Risks

## Open decisions
```

### Conversation and revision

The workspace reuses appropriate Card-shell interactions:

- whole-document feedback;
- inline Markdown annotations;
- section-scoped revisions;
- source additions;
- Agent/model settings;
- exact revision history;
- delete before confirmation;
- explicit confirmation.

It uses a dedicated Technical Design Harness. The Agent reads project code and sources but
does not modify repository files.

The Agent separates current facts, options, recommendations and user decisions. For a
local-first persistence choice, it must not treat the current JSON MVP as a permanent
decision. It should compare relevant options such as JSON, SwiftData and SQLite against
relationships, querying, migration, portability and testing. The user may explicitly
choose SwiftData while retaining JSON export, and the decision becomes part of the next
revision.

### State

```text
Collecting Sources
→ Drafting
→ Needs Decisions
→ Draft Ready
→ Confirmed
```

A design with unresolved material choices remains Needs Decisions. Confirmation freezes
one exact revision for downstream use.

## Technical translation and delivery readiness

Product Design answers what the product should do. Domain Model answers what concepts mean
and how they relate. Technical Design maps both into the current codebase, persistence,
queries, modules, migrations and validation strategy.

Technical Design may still be larger than one delivery. A Delivery Contract or
Implementation Brief provides the final executable boundary:

```markdown
# Deliver Unified Search v1

## Product outcome

## Inputs and confirmed design revisions

## Repository and current baseline

## Scope

## Required checks

## User UI acceptance

## Migration boundary

## Non-goals
```

Nodes and documents can expose an execution-readiness classification:

- non-executable;
- needs-product-design;
- needs-domain-model;
- needs-technical-design;
- needs-delivery-contract;
- delivery-ready.

Just Do It should consume delivery-ready artifacts. If a user imports a high-level Feature,
Product Design or Domain Model, the system should offer the missing transformation instead
of requiring an execution Agent to invent product, domain and technical decisions after
starting work.

Simple work may generate a Delivery Contract directly from Product Design and repository
facts. Complex work may use Technical Design and optionally Break It Down first.

## Break It Down remains independent

Break It Down accepts any sufficiently complete input, including an existing project,
Project JSON, Product Design, Technical Design, Delivery Contract or direct user request.
It is not coupled to What’s Next.

The same Intention and Motion vocabulary may later make decomposition more focused:

- decompose for understanding;
- decompose for Product Design;
- decompose for Technical Design;
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

### Technical Design Card

- map current BoxRecord JSON to accepted concepts;
- compare JSON, SwiftData and relational persistence;
- define query normalization and result mapping;
- design migration and portable export;
- identify module and UI integration boundaries.

### Delivery Contract

- implement Unified Search v1 against exact confirmed revisions;
- preserve existing records;
- cover item-name and container-note search;
- keep optional UI regression separate from required code acceptance;
- retain user UI acceptance as the final product verdict.

## Proposed implementation sequence

### Phase 0: dependency and Card safety

Delivered:

- unfinished lineage dependency review before planning/execution;
- explicit prerequisite versus conceptual-source decisions;
- deletion of an unconfirmed Just Do It Card through system Trash.

### Phase 1: neutral What’s Next request model

- add Intention, Motion and Append/Redo/Refine/Converge operations;
- remove prototype-only wording from the Core Harness;
- make output cardinality depend on Motion;
- preserve backward compatibility by treating existing nodes as Discovery directions.

### Phase 2: Layer projections and Product Anchor

- introduce global Source identity and Layer metadata;
- render Discovery, Product Design and Domain Model projections;
- retain separate layout state per Layer;
- show cross-Layer provenance through compact portals;
- add the cross-Layer selection basket.

### Phase 3: Product Design and Domain Model profiles

- add intent-specific Harness profiles and Skills;
- support rich Feature convergence inside Discovery;
- support Discovery-to-Product-Design translation;
- support Domain Model divergence and convergence;
- persist artifact kind and execution-readiness metadata.

### Phase 4: Technical Design Card workspace

- add the aggregate source model and Card shell;
- add Markdown revision and inline feedback;
- add open-decision records and user rulings;
- add Technical Design confirmation and exact revision handoff.

### Phase 5: delivery bridge and broader module reuse

- generate Delivery Contracts;
- gate Just Do It imports on execution readiness;
- allow optional Break It Down routing;
- evaluate shared Intention/Motion concepts inside Break It Down;
- support Product Context document candidates without direct repository writes.

## Open product decisions

The following remain intentionally unresolved for focused follow-up discussion:

1. Final user-facing Intention labels and how many appear in the first release.
2. Whether Product Design defaults to one document per Feature or supports one whole-product
   Design Doc from the start.
3. Whether Domain concepts always use individual nodes or may remain one aggregate proposal
   before convergence.
4. How the cross-Layer selection basket behaves when source nodes conflict.
5. Whether execution-readiness is manually confirmed, mechanically inferred or assessed by
   a bounded Agent operation.
6. Where confirmed Technical Design Markdown is mirrored in Product Context.
7. Which Intention/Motion concepts should be shared with Break It Down in its first update.

## Evaluation

The redesign is successful when:

- one Source can append several non-duplicative explorations under different intentions;
- Diverge yields several useful alternatives and Converge yields exactly one honest
  aggregate;
- a validated Discovery Feature can become a rich but visually simple Product Design node;
- Domain Model explains concepts without prematurely choosing storage technology;
- Technical Design supports real user/Agent decision dialogue and exact revisions;
- high-level nodes cannot silently enter code execution without required design translation;
- existing projects and direct Break It Down use remain valid;
- Canvas projections remain readable even as the global Product Graph grows.
