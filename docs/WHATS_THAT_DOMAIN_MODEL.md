# What’s That? Domain Model

Status: agreed product direction. This document defines the module boundary and first
implementation slice; it does not claim that the runtime or UI exists.

## Purpose

What’s That? helps one developer describe the things in a product and understand how those
things relate. The user speaks in product language. An Agent translates that language into
a structured, visual domain model without requiring the user to maintain database columns,
UML notation or implementation inheritance by hand.

The module answers questions such as:

- What is an Item?
- Is a Container a kind of Item?
- Which fields belong to every Item and which belong only to a Container?
- Can a Container contain another Container?
- What changes when an Item moves, is deleted or is restored?
- Which relationships are explicit product facts and which are derived from other facts?

It is useful when Product Design is clear enough to name capabilities but implementation
still lacks stable concepts and relationships. It remains optional. Straightforward work
may continue directly to Break It Down or Just Do It.

## Independent module boundary

What’s That? is not a Domain Layer inside What’s Next. The two modules share product
context, stable identity, Agent transport, run observability and local versioning
mechanisms, but their work surfaces have different semantics.

What’s Next uses Source-oriented product exploration, Intention, Motion and generated
Cards. What’s That? uses entities, fields, relationships, constraints and a continuously
editable model. It does not inherit What’s Next selection rules, Candidate promotion,
Layer switching, Diverge or Converge.

The user-facing module name is `What’s That?`. Internal paths and code use `domain-model`
so storage and implementation terminology remain precise.

## Product context

The Product Source and accepted Product Design Features are implicit primary context for
the Agent. Source is provenance, not a visible root Entity. It is hidden from the model
Canvas by default and available through a compact context disclosure.

The Domain Canvas displays domain objects and domain relationships only. It does not draw
Source-to-Entity edges or reproduce the Product Design tree. A details surface may show
which Source, Features, instructions and prior revisions informed an element.

A project with only a Source may still use What’s That? when the user supplies a concrete
modeling instruction. A vague Source alone must not cause the Agent to manufacture a
complete schema.

## Living current model

What’s That? has no Candidate, Accepted or Finalized lifecycle. Every valid successful
generation becomes the current formal model immediately. Formal means usable now, not
immutable.

Later natural-language changes create new revisions while preserving stable element
identity. The system records the instruction, structured change and affected identifiers.
The user may continue editing any generated Entity or relationship and may restore an
earlier revision.

Only runtime state is transient:

- `running`: an Agent operation is in progress;
- `error`: validation or execution failed and the current model is unchanged;
- `current`: the element belongs to the current model revision.

One operation applies atomically. A failed, canceled, stale or ambiguous result must not
leave partial Entities, fields, relationships or layout changes.

## Domain elements

The canonical model begins with three concepts rather than a complete UML vocabulary.

### Entity

An Entity has stable identity, a user-facing name, a product meaning, fields, attached
constraints and relationships. Renaming an Entity does not change its identifier or break
its relationships.

The user may describe an Entity in natural language:

> An Item has a required title, an optional note and any number of photos.

The Agent distinguishes fields explicitly requested by the user from system fields it
infers to keep identity, persistence or lifecycle coherent.

```text
Item
├── Primary fields
│   ├── title: required text
│   ├── note: optional text
│   └── photos: zero or more attachments
├── Other fields · 2                     collapsed
└── System fields                        hidden
```

The Agent must not add a generic template of `id`, `createdAt`, `updatedAt`, soft-delete,
sync and audit fields to every Entity merely for completeness. Each inferred field needs a
concrete purpose in current product context.

Field data rules and display importance are separate. A field may be optional but still
primary because the user cares about it. A technically required field may remain hidden
because the Host owns it rather than the product experience.

- primary business fields appear directly on the Entity card;
- secondary business fields appear under one collapsed `Other fields · N` row;
- system fields such as stable IDs, schema revision and storage coordination remain hidden
  from the normal card and do not contribute to the secondary-field count.

The Agent assigns display importance from the user's language and current product meaning.
The user may correct that judgment in natural language, for example, "Quantity is important;
show it as a primary Item field." The user does not maintain a presentation schema by hand.

### Relationship

A Relationship has stable identity, two Entity endpoints, a semantic name, direction,
optional inverse name, cardinality and relevant lifecycle or ownership rules. Relationship
vocabulary is open-ended but common meanings include `is-a`, `contains`, `references`,
`owns`, `produces` and `affects`.

The relationship stores whether its meaning came directly from user instruction or was
derived from current canonical model facts. This is provenance, not an acceptance state.

### Constraint

A Constraint records a rule that cannot be expressed safely by an edge alone. It may apply
to one Entity, one Relationship or the model as a whole. Examples include:

- an Item has at most one parent Container;
- a Container cannot directly or indirectly contain itself at the instance level;
- only a Container can manage child Items;
- sibling order is stable inside one Container.

Constraints are visible from the relevant Entity or edge and participate in Agent context
and consistency checks.

## Natural-language-first interaction

The first view is an empty Canvas with no onboarding Card, plus button, blank-Canvas creation
gesture or manual Entity form. A persistent bottom-right Composer is the only creation
entrypoint and accepts instructions without requiring a selection:

```text
Describe an entity, field, relationship or rule to add or change…
```

The instruction is required; Intention, selection or inherited context never substitutes
for a concrete user request. One instruction may create one Entity or several Entities when
the user's wording exposes several clear domain boundaries. The Harness imposes no arbitrary
one-to-five output count.

While an Agent runs, the Composer becomes a compact control bar showing the Agent, objective
elapsed time, current observable activity and cancel. The Canvas retains its last valid
model and does not render a fake Domain Entity or partial generated model. A valid result
appears atomically; clarification, failure and cancellation leave the Canvas unchanged and
restore the Instruction.

Selection narrows attention but is not an authorization boundary:

| Selection        | Agent scope                                                       |
| ---------------- | ----------------------------------------------------------------- |
| Nothing selected | Resolve the instruction against the whole current model           |
| One Entity       | Focus on that Entity and inspect every relationship it may affect |
| Several Entities | Focus on their shared meaning and relationships                   |
| One Relationship | Revise that relationship and its attached constraints             |

Entity cards reuse the neutral round-checkmark multi-selection pattern already validated in
What’s Next. The checkmark adds an Entity to the discussion boundary; clicking the card body
opens details. The Composer summarizes selected Entity names and lets the user clear one or
all selections.

Selection does not encode edge direction, dependency, inheritance or containment. Those
meanings come from the user's Instruction and the Agent's supported interpretation. Two or
more selected Entities define primary Context, not a user-drawn relationship.

To keep Context cost bounded:

- the model's compact identity, title, summary and relationship index is always available;
- selected Entities, their full definitions and relationships among them are primary;
- direct neighbors are related summaries available for on-demand reading;
- unrelated full Entity definitions are not injected eagerly;
- the Agent may read or update an unselected Entity only when model consistency requires it,
  and the change summary must name that expansion.

The Agent may update related elements outside the selection when the requested change
requires model consistency. The resulting change summary names every affected element.

If a referenced name is absent and the instruction clearly defines a new domain object,
the Agent may create it. If the name could refer to several existing Entities, the Agent
returns one bounded clarification and changes nothing.

The model grows incrementally. The Agent does not need to complete the whole product during
one operation and must not add nominal Entities merely to make the Canvas look comprehensive.

## Entity editing

Selecting an Entity opens details with its business description, primary and secondary
business fields, relationships and constraints. The primary edit control remains natural
language rather than a database property grid. System fields are not part of the ordinary
details surface.

For example:

> Item should also have a quantity. Most Items have a quantity of one.

A successful operation updates the existing Item identifier, adds the field and default,
increments the model revision and shows a concise change record. Direct structured field
editing may be added later for precise corrections, but it is not required for the first
slice.

## Relationship creation and editing

Relationship creation uses the same Composer and multi-selection model rather than a second
drag-to-connect mode. The user may select Item and Container and write:

```text
A Container is an Item with the additional ability to manage other Items.
```

The Agent resolves semantic name, direction, inverse meaning, cardinality and relevant
constraints. If the instruction is sufficiently clear, the valid result becomes the
current formal relationship immediately. If it is materially ambiguous, the Agent asks a
clarifying question before changing the model.

The selected pair or group narrows primary Context but does not predetermine who depends on
whom. More than two Entities may participate in one modeling instruction. Clicking an
existing edge focuses that relationship in the Composer. The Agent revises it in place and
retains stable identity when its conceptual meaning remains the same. Replacing one meaning
with another creates an explicit relationship change in revision history.

Drag-to-connect, handles and a manual relationship-type picker remain deferred efficiency
shortcuts. They are not part of the first slice.

## Whole-model instructions

The Agent must translate a Canvas-level instruction into visual model operations rather
than answer with prose alone.

Given no selection and this instruction:

> A Container can contain Containers and Items.

the Agent resolves existing Entity identities, current inheritance and current constraints.
If the current model already says `Container is-a Item`, the canonical model
may store:

```text
Container is-a Item
Container contains Item
```

The visualization also renders the derived self-containment meaning:

```text
Container contains Container
```

The derived self-loop is a current formal visualization with provenance explaining that it
follows from inheritance plus the canonical containment relationship. It is not a duplicate
canonical record that can drift independently.

If no `Container is-a Item` fact exists, the same instruction creates two explicit
containment relationships and does not invent inheritance. The ability to contain a
Container does not by itself establish that a Container is an Item.

## Inheritance and capability changes

Natural-language editing may require a cross-model refactor. Given:

> A Container is itself an Item, but it has the additional ability to manage Items.

the Agent should derive and apply one coherent operation:

- add the `Container is-a Item` generalization;
- move shared fields to Item instead of duplicating them;
- retain Container-specific child-management capability;
- simplify redundant containment relationships;
- add parent uniqueness and cycle-prevention constraints;
- identify affected move, deletion, restoration, search and Activity semantics.

Domain inheritance expresses product meaning. It does not force Swift inheritance,
SwiftData model inheritance or a particular table layout. Implementation may later map the
same current meaning to inheritance, a common model with a kind discriminator, a protocol,
a capability or composition.

## Explicit and derived visualization

Every visible node and edge belongs to the current formal model, but the UI distinguishes
how its meaning was established:

- explicit: directly stated by the user or an accepted product source;
- inferred: added by the Agent because it is necessary for a coherent model;
- derived: calculated from other canonical model facts for visualization.

This origin appears in details and a compact visual treatment. It must not look like a
pass/fail state or a Candidate awaiting acceptance. Removing or changing a canonical fact
recomputes its derived visual relationships atomically.

## Canvas and inspection

The first implementation should reuse the installed React Flow foundation for pan, zoom,
selection, custom nodes and labeled edges. It should not extend `TaskGraphCanvas`
with Domain semantics. A separate `DomainModelCanvas` may share low-level controls, theme
tokens, run status, dialogs and inspector primitives.

The initial layout may use the installed Dagre projection. Domain graphs introduce
self-loops, multiple edge types, labels, ports and potentially denser topology; move to ELK
only when measured examples show that Dagre cannot keep them readable. The canonical model
never stores renderer-owned geometry as product meaning.

Unlike the lineage-oriented What’s Next Canvas, Domain Entities may be dragged so the user
can clarify a dense UML-like view. User positions persist as separate presentation metadata.
Automatic layout remains available for the first arrangement, newly generated elements and
an explicit reset; it must not overwrite a user arrangement on every model revision.

An Entity card shows its name, one concise meaning and primary business fields. One collapsed
row owns all secondary business fields. System fields stay hidden. Relationship labels show
semantic meaning and cardinality. Self-containment is visible rather than hidden in
Markdown.

Source remains hidden by default. A compact context control reveals the Source, accepted
Product Design Features and other evidence available to the current Agent operation.

Renaming preserves stable identity. Removing an Entity or relationship is also a model
operation: the Agent identifies affected references and derived views, applies the deletion
atomically and provides restore. It must not leave dangling edges or silently delete
unrelated product meaning.

## One model with progressive disclosure

What’s That? has one Domain Canvas and one canonical Entity identity. Natural-language
meaning and structured fields are two representations of the same Entity, not separate
Conceptual and Storage Layers. The product does not duplicate nodes or ask the user to keep
two projections synchronized.

The structured model may include semantic field types and relationships useful to later
implementation, but the normal Canvas remains product-facing. Storage-specific indexes,
foreign keys, migrations or SwiftData choices appear in Entity details only when they
materially affect product meaning, or in a lightweight Implementation Approach before Just
Do It. They do not create another Layer.

## Agent Harness

The What’s That? Harness is independent from What’s Next Intention and Motion profiles. It
enforces these high-level rules:

1. Treat the user's current instruction as the highest modeling authority.
2. Read the current model before adding or changing meaning.
3. Use Source and accepted Product Design as evidence without rendering them as Domain
   Entities.
4. Resolve references by stable identity and treat display names as renameable labels.
5. Translate natural language into structured Entities, fields, relationships and
   constraints.
6. Separate explicit, inferred and derived meaning.
7. Infer only what is necessary for coherence; do not manufacture product behavior or a
   generic enterprise schema.
8. Create a separate Entity only when identity, lifecycle, behavior or independent
   relationships justify it; do not turn every noun or field into a node.
9. Ask one bounded clarification only when ambiguity would materially change the model.
10. Return a structured atomic change, not advice-only prose.
11. Preserve unchanged identifiers and reject dangling references, inheritance cycles,
    invalid cardinality and stale input revisions.
12. Apply a valid result directly as the current model revision; do not create Candidate or
    Finalize states.
13. Retain the user instruction, affected identifiers and concise change summary without
    exposing private chain-of-thought.
14. Never silently rewrite Source or Product Design. When a Domain change exposes a conflict
    with upstream product meaning, apply only the requested Domain change and report the
    upstream inconsistency for explicit follow-up.
15. Use the compact whole-model index for discovery, selected Entity definitions as primary
    Context and related Entity bodies on demand. Selection narrows cost but never supplies
    relationship semantics or blocks a required consistency update.

The Host validates schema, referenced identifiers, base revision and atomicity before
changing canonical state. A late result from an older base revision is stale and cannot
overwrite newer user work.

## Persistence direction

Canonical state remains small, versionable JSON and optional human-readable Markdown in the
project companion repository. A plausible first layout is:

```text
.agent-manager/domain-model/
├── model.json
├── entities/
│   └── ENTITY-<uuid>/
│       ├── entity.json
│       └── definition.md
└── relationships/
    └── RELATIONSHIP-<uuid>.json
```

`model.json` owns schema version, model revision and context references. Each Entity and
Relationship owns stable identity and provenance. Reverse edges and derived visual
relationships are computed rather than stored twice. Exact file boundaries may change
during implementation, but no SQLite database or opaque Canvas state becomes canonical.

Each successful Agent operation records one coherent model revision. Undo restores the
entire affected change rather than independently rolling back one field while leaving its
relationships inconsistent. Shared companion-repository Git versioning may later provide
the mechanical revision substrate; the product requirement is atomic revision and restore,
not a particular implementation.

## Integration with other modules

- What’s Next supplies Source and accepted Product Design context but does not own Domain
  elements.
- What’s That? may be opened directly from the project navigation or from relevant Product
  Design context.
- Break It Down may consume the current Domain Model when it helps define delivery
  boundaries, but it does not require What’s That? as a predecessor.
- Just Do It receives the current relevant Domain Model as implementation context. It does
  not treat every Domain relationship as an execution dependency.
- Implementation results may reveal a product-model correction, but code structure does
  not silently rewrite the Domain Model.

Because the Domain Model remains editable and has no Finalize boundary, every downstream
handoff pins the exact model revision it received. A later Domain edit does not silently
change an active Break It Down request, Plan or Action. A new run may explicitly refresh to
the latest revision.

Likewise, each Domain revision records the Source and Product Design revisions used as
context. When those upstream facts change, the UI reports that newer context is available;
it does not automatically rewrite or invalidate the current model. The user may ask the
Agent to reconcile the model against that new context.

## First implementation slice

The first slice should prove one complete modeling loop:

1. Open What’s That? as an independent project module.
2. Load hidden Source and accepted Product Design context.
3. Show an empty Canvas with only the persistent Composer when no model exists.
4. Accept a required Canvas-level natural-language instruction with no selection.
5. Run one Agent and display objective elapsed time.
6. Validate and atomically apply generated Entities, fields, relationships and constraints.
7. Render explicit relationships, inheritance and one derived self-containment loop.
8. Allow the user to arrange Entities without changing semantic model facts.
9. Show primary business fields, collapse secondary fields and hide system fields.
10. Select one Entity and revise it through natural language.
11. Select Item and Container through round checkmarks, describe their relationship in the
    Composer and create the valid labeled relationship without drag direction.
12. Preserve stable identity and revision history across both changes.
13. Cancel or fail one Run without changing the current model.
14. Restore the most recent successful model change.
15. Pin one exact model revision in a downstream handoff.

Use HereItIs as the first scenario: create Item and Container, make Container an Item with
child-management capability, and express that a Container can contain both ordinary Items
and Containers.

## Deferred scope

The first slice does not require:

- complete UML notation;
- a general database designer;
- SwiftData or SQL code generation;
- automatic migration generation;
- multiple simultaneous users;
- manual maintenance of every inferred system field;
- What’s Next Intention or Motion controls;
- Candidate acceptance or Finalize states;
- a second Conceptual, Storage or ERD Canvas;
- blank-Canvas creation, plus buttons, drag-to-connect or manual relationship-type controls;
- automatic synchronization from source code back into product meaning.

## Evaluation

The first slice succeeds when a user who does not maintain UML or database schemas can:

- describe one Entity in ordinary language and receive a useful current model;
- see primary business fields directly, secondary business fields on demand and no normal
  system-field noise;
- optionally select several Entities to bound Context, then describe their relationship
  without encoding direction in the UI;
- state a relationship with no selection and see every relevant visual relationship;
- express `Container is-a Item` and receive a coherent cross-model refactor;
- see self-containment, inheritance, cardinality and constraints on the Canvas;
- correct the model through another natural-language instruction without a Finalize flow;
- cancel, fail or undo safely without leaving partial graph state; and
- provide the resulting model to an implementation Agent without prematurely choosing a
  storage technology.

## Remaining implementation decisions

These choices should be settled while implementing the first real scenario rather than by
expanding the product contract now:

1. The smallest visual distinction between explicit, inferred and derived meaning that does
   not resemble acceptance status.
2. The exact revision substrate before shared companion-repository Git versioning exists.
3. The measured topology threshold for replacing Dagre with ELK.
