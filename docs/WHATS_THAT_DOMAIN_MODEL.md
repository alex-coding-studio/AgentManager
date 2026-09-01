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

It is useful when the user wants to make product concepts and relationships explicit. It
remains optional; a project does not need a Domain Model merely to look complete.

## Independent module boundary

What’s That? is not a Domain Layer inside What’s Next. The two modules may share stable
identity, Agent transport, run observability and local versioning mechanisms, but their
content and work surfaces have different semantics.

What’s Next uses Source-oriented product exploration, Intention, Motion and generated
Cards. What’s That? uses entities, fields, relationships, constraints and a continuously
editable model. It does not inherit What’s Next selection rules, Candidate promotion,
Layer switching, Diverge or Converge.

The user-facing module name is `What’s That?`. Internal paths and code use `domain-model`
so storage and implementation terminology remain precise.

## Standalone context boundary

The first slice treats What’s That? as an independent Data Model module. It does not require
What’s Next, Product Design, Break It Down or Just Do It, and it does not render or import
their Nodes. The required Context is the user's current Instruction and the current Domain
Model. A project may begin with an empty model.

Cross-module inputs and handoffs remain future possibilities rather than first-slice
behavior. The persisted model keeps stable identities and revisions so another module may
consume it later without requiring a storage migration, but no workflow or dependency is
promised now.

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

## Latest Response

The top-left response surface follows the shared
[Latest Response presentation contract](LATEST_RESPONSE.md). Ordinary applied and no-change
results remain quiet. Clarification, decision-required, warning and error outcomes expose
their state in the collapsed row and use the shared attention behavior.

For an applied model revision, the expanded response summarizes added, updated, removed and
derived Entities, relationships and Constraints, plus any change outside the selected
discussion boundary. It may offer `Undo this change`. The provider's raw response and
private chain-of-thought are never presented as the model change summary.

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
├── title: required text
├── note: optional text
├── photos: zero or more attachments
├── id: stable identity
└── createdAt: creation time when justified
```

The Agent must not add a generic template of `id`, `createdAt`, `updatedAt`, soft-delete,
sync and audit fields to every Entity merely for completeness. Each inferred field needs a
concrete purpose in current product context.

Field data rules and display importance are separate. A field may be optional but still
primary because the user cares about it. A technically required field may remain hidden
because the Host owns it rather than the product experience.

- primary business fields appear first in the Entity property panel;
- secondary business fields appear under one collapsed `Other fields · N` section in that
  panel;
- system fields such as stable IDs, schema revision and storage coordination remain hidden
  from the ordinary UI and do not contribute to the secondary-field count.

The Agent assigns display importance from the user's language and current product meaning.
The user may correct that judgment in natural language, for example, "Quantity is important;
show it as a primary Item field." The user does not maintain a presentation schema by hand.

### Relationship

A Relationship has stable identity, two Entity endpoints, a concise text label, optional
direction, cardinality and relevant lifecycle or ownership rules. The visible vocabulary is
open-ended. The Agent chooses the shortest phrase that makes the relationship read clearly,
such as `is a`, `contains`, `belongs to`, `records`, `attached to` or `located in`.

The Harness does not expose a closed relationship-type picker. A broad internal semantic
role may support mechanical validation such as inheritance-cycle or containment-cycle
checks, but it does not constrain the visible wording. A user may ask the Agent to replace
`manages` with the more precise `contains` without recreating the relationship identity.

Labels prefer one to four words, express one relationship, avoid repeating Entity names and
leave reasons, conditions and lifecycle detail to the property panel or Constraints.

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

Selecting an Entity's details control opens the established property panel pattern used by
the other graph modules. The panel owns the Entity meaning, primary fields, collapsed
secondary fields, relationships, constraints, provenance and revision. The Canvas Card does
not expand fields. The primary edit control remains natural language rather than a database
property grid. System fields are not part of the ordinary details surface.

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

## Relationship reading and provenance

Every visible node and edge belongs to the current formal model. Relationship meaning comes
from its concise text label and the graph's existing focus interaction rather than a large
visual taxonomy. Focusing an Entity keeps it and its direct relationships prominent while
unrelated Entities and edges dim. With several checked Entities, selected Entities and the
relationships among them are strongest; direct neighbors remain secondary Context.

Resting Cards and edges use one neutral visual language. There is no relationship-type
color, source color or complex legend. Directional meaning may use an arrow; the label does
the explanatory work. Self-containment remains visible as a labeled self-loop.

The property panel still records how meaning was established:

- explicit: directly stated by the user in the current or earlier Domain instruction;
- inferred: added by the Agent because it is necessary for a coherent model;
- derived: calculated from other canonical model facts for visualization.

Provenance is textual detail, not a Card or edge color. It must not look like a pass/fail
state or a Candidate awaiting acceptance. Removing or changing a canonical fact recomputes
its derived visual relationships atomically.

## Canvas and inspection

The first implementation should reuse the installed React Flow foundation for pan, zoom,
selection, custom nodes and labeled edges. It should not extend `TaskGraphCanvas`
with Domain semantics. A separate `DomainModelCanvas` may share low-level controls, theme
tokens, run status, dialogs and inspector primitives.

The initial layout may use the installed Dagre projection. Domain graphs introduce
self-loops, multiple labeled edges and potentially denser topology; move to ELK only when
measured examples show that Dagre cannot keep them readable. The canonical model never
stores renderer-owned geometry as product meaning.

Entity Nodes are not draggable. Multi-selection, focus and details reuse the already
validated graph interactions without adding manual layout state. The same model produces a
deterministic layout; field-only changes do not move Nodes; new Entities appear near their
relationships; deletion or relationship changes disturb only the smallest possible area.
The user may pan, zoom and fit the viewport but does not arrange, lock or persist Entity
positions.

An Entity Card remains compact because the Canvas exists to show relationships. It contains
the neutral round checkmark, Entity kind, title, optional one-line meaning and established
details control. Fields, Constraints, provenance and revision stay in the property panel.
Relationship labels show concise meaning; self-containment remains visible rather than
hidden in Markdown.

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
foreign keys, migrations or framework choices appear in Entity details only when they
materially affect product meaning. They do not create another Layer.

## Agent Harness

The What’s That? Harness is independent from What’s Next Intention and Motion profiles. It
enforces these high-level rules:

1. Treat the user's current instruction as the highest modeling authority.
2. Read the current model before adding or changing meaning.
3. Use the current Instruction, compact model index, selected Entity definitions and
   on-demand related Entity files as the complete first-slice Context boundary.
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
14. Use the compact whole-model index for discovery, selected Entity definitions as primary
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

## Independent module output

The first slice opens What’s That? directly from project navigation and produces one
standalone, revisioned Domain Model. No first-slice control opens the module from a Product
Design Card, sends an Entity to Break It Down, attaches a revision to Just Do It or converts
a Domain relationship into an execution dependency.

Other modules may consume an exact Domain Model revision in the future. That possibility
justifies stable identity and revision records, but cross-module freshness, handoff and
navigation behavior remain deferred until real use proves the need.

## First implementation slice

The first slice should prove one complete modeling loop:

1. Open What’s That? as an independent project module.
2. Show an empty Canvas with only the persistent Composer when no model exists.
3. Accept a required Canvas-level natural-language instruction with no selection.
4. Run one Agent and display objective elapsed time.
5. Validate and atomically apply generated Entities, fields, relationships and constraints.
6. Render labeled relationships, inheritance and one derived self-containment loop.
7. Keep Cards compact and put primary, secondary and hidden-system field policy in the
   property panel.
8. Select one Entity and revise it through natural language.
9. Select Item and Container through round checkmarks, describe their relationship in the
   Composer and create the valid labeled relationship without drag direction.
10. Preserve stable identity and revision history across both changes.
11. Cancel or fail one Run without changing the current model.
12. Restore the most recent successful model change.
13. Keep automatic layout stable across field-only and selection changes.

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
- manual Entity layout or persisted presentation coordinates;
- cross-module import, navigation, freshness or downstream handoff;
- automatic synchronization from source code back into product meaning.

## Evaluation

The first slice succeeds when a user who does not maintain UML or database schemas can:

- describe one Entity in ordinary language and receive a useful current model;
- see primary business fields directly, secondary business fields on demand and no normal
  system-field noise in the property panel while Cards remain compact;
- optionally select several Entities to bound Context, then describe their relationship
  without encoding direction in the UI;
- state a relationship with no selection and see every relevant visual relationship;
- express `Container is-a Item` and receive a coherent cross-model refactor;
- see self-containment, inheritance, cardinality and constraints on the Canvas;
- correct the model through another natural-language instruction without a Finalize flow;
- cancel, fail or undo safely without leaving partial graph state; and
- provide the resulting model to an implementation Agent without prematurely choosing a
  storage technology in a future integration without requiring a model migration.

## Remaining implementation decisions

These choices should be settled while implementing the first real scenario rather than by
expanding the product contract now:

1. The smallest visual distinction between explicit, inferred and derived meaning that does
   not resemble acceptance status.
2. The exact revision substrate before shared companion-repository Git versioning exists.
3. The measured topology threshold for replacing Dagre with ELK.
