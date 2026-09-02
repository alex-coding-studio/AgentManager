# What to Do

Status: product design accepted for documentation; implementation has not started.

## Purpose

What to Do is the delivery-shaping workspace between accepted Product Design and
Just Do It. It turns a mixed body of product meaning, domain meaning, repository
facts, user direction, and supporting files into a Delivery Map whose nodes are
independently deliverable Contracts.

The module answers:

> What must be delivered, in which independently verifiable units, and which
> units are hard prerequisites for others?

It does not prescribe source files, types, database tables, or a linear coding
plan. Those decisions belong to the Just Do It Plan for one selected Contract.

## Product position

Praxis supports two delivery paths:

1. **Exploratory delivery:** an accepted Discovery Node from What's Next or an
   accepted Formal Node from Break It Down may be added directly to Just Do It.
   This keeps the fast MVP loop available.
2. **Designed delivery:** an accepted Product Design Feature must pass through
   What to Do. One Feature may require several Contracts, and several Features
   may belong to one Contract.

A Product Design Feature cannot be imported directly into Just Do It. The UI
permits Just Do It imports from exactly three sources:

- What's Next Discovery;
- Break It Down Formal Nodes;
- What to Do Delivery Contracts.

## Terms

- **Source Feature:** an accepted Product Design Feature selected for one What
  to Do request.
- **Delivery Map:** the complete candidate graph proposed for the selected
  Source Features.
- **Contract Candidate:** one proposed node in an unaccepted Delivery Map.
- **Delivery Contract:** one formal Map node after the user accepts the complete
  Map.
- **Delivery Strategy:** the Agent's recommended way to approach a Contract,
  such as Foundation-first, Experience-first, Vertical slice, or Risk-first.
- **Hard dependency:** a Contract whose delivered result is required before a
  dependent Contract can enter Just Do It.
- **Focus selection:** optional selected Map nodes that narrow the user's current
  feedback without limiting the Agent's responsibility for the complete Map.

## Entry points

What to Do has two equivalent entry points.

### Start inside What to Do

The standard bottom-right Composer retains the shared Praxis input hierarchy:

1. User Input;
2. Extra Info and attachments;
3. Agent, model, and reasoning controls.

It adds one required Source Feature control. The user must select one or more
accepted Product Design Features before submitting. Concrete User Input remains
required and may explain the desired delivery boundary, urgency, constraints, or
concerns, but cannot replace the Source Features.

### Send from What's Next

The Product Design Layer provides an **Open in What to Do** action for one or
more selected accepted Features. It opens What to Do with those Features already
selected. The user can then add the same User Input, Extra Info, attachments, and
Agent configuration available in the native What to Do entry.

Both paths create the same request shape and use the same Harness.

## Standard Input Packet

The request follows the shared file-backed Input Packet model.

```text
content/
├── input/
│   └── user-input.md
├── references/
│   ├── product-design/
│   ├── related-breakdown/
│   ├── domain-model-summary.md
│   ├── domain-model.json
│   ├── repository-facts.json
│   ├── repository-summary.md
│   └── related-code-evidence/
└── external/
    └── user-supplied files
```

The required Product Design Features are primary references. Relevant accepted
Break It Down Nodes may be included as supporting references, but never replace
the required Features.

The existing Composer and Packet structure remain valid when Praxis later adds
images, PDF, HTML, or source-code attachments. Each external entry records its
workspace path, original name, MIME type, size, hash, and semantic kind. Current
format support remains an implementation capability rather than a reason to
redesign the Packet.

## Repository Context

What to Do must understand the current implementation boundary before proposing
a delivery boundary. It must not dump an entire repository into the prompt or
ask the user to decide how many files to scan.

Repository Context has two layers.

### Host-owned repository snapshot

Praxis deterministically produces `repository-facts.json` before the Agent
orients itself. This is not a framework or project-type detector. It is a
bounded inventory of directly observable repository state that saves the Agent
from spending a model turn on mechanical enumeration.

The snapshot contains:

- repository root, current branch, HEAD, and dirty state;
- whether the selected root is empty or contains source material;
- a bounded top-level directory and file inventory;
- file extensions and manifest, workspace, project, configuration, and
  documentation paths that actually exist;
- declared package scripts or equivalent command metadata when they can be read
  mechanically from existing files;
- hashes over the evidence included in the snapshot.

A snapshot is reusable only when its bounded file, top-level, and dirty-state
evidence is complete. Praxis marks a truncated snapshot as non-reusable and
refreshes Repository Context on every request until a complete snapshot is
available.

The Host does not decide what the project does, which architecture it uses,
which files are important, or which standards govern the work. It does not need
an iOS, Web, backend, database, or framework-specific detector.

### Agent-maintained repository summary

On the first What to Do request, the Agent performs the same general orientation
expected whenever a capable developer or coding Agent takes responsibility for
an unfamiliar project. It reads the Repository Snapshot, README, project-owned
instructions, relevant documents, manifests, configuration, and enough source
to understand the current boundary.

The Agent maintains `repository-summary.md` as a compact interpretation of that
evidence. Depending on what the repository establishes, the Summary may record:

- what the project is and which user or product problem it serves;
- primary languages, frameworks, platforms, and minimum supported versions;
- current architecture, module boundaries, data boundaries, and integration
  points;
- build, test, lint, format, generation, and delivery entry points;
- critical project standards and constraints that later work must preserve;
- whether the project is empty, partially established, mature, or intentionally
  mixed.

These are questions for Agent reasoning over real project evidence, not fields a
Host detector must always populate. The Summary must not force a repository into
one category when the current code uses several approaches.

For an empty project, the Summary distinguishes observed facts from accepted
intent. It may record an intended architecture, project manager, deployment
target, or UI framework only when the current User Input or accepted product
sources establish them. Unknown choices remain unknown rather than being
invented.

For an existing project, the Summary may evolve from one framework or
architecture to a mixed approach, or from one persistence boundary to another,
when current evidence changes. The Summary is navigation context, not authority
over the repository.

### Refresh ownership

Praxis refreshes Repository Context when:

- the first What to Do request starts for a project;
- the deterministic snapshot fingerprint changes;
- a delivered Contract changes relevant architecture facts;
- the user explicitly requests a refresh;
- the Agent discovers that the existing Summary conflicts with current evidence.

The Host always refreshes the mechanical snapshot. The Agent refreshes the
interpretive Summary only when the snapshot or relevant evidence requires it.
Runs retain their frozen Snapshot and Summary references; the current project
keeps one current Summary instead of asking the user to maintain a revision
history.

### Targeted repository reading

After its general project orientation, the Agent reads the Repository Summary
first on later requests, derives concrete questions from the selected Product
Design Features, and inspects the current evidence needed to answer them. Each
expansion records a path and reason. Reading stops when the Agent can identify
the implementation delta, Contract boundaries, hard dependencies, and unresolved
decisions.

## Domain Model Context

Every request automatically includes:

- `domain-model-summary.md`, bound to a model version and hash;
- the complete authoritative `domain-model.json`.

The Agent always reads the Summary. It decides whether the request is pure UI,
reuses existing domain meaning, changes existing objects, adds new objects, or
requires clarification. It reads the detailed model only when necessary.

Praxis supplies the evidence and summary/detail boundary. The Harness does not
teach the Agent a fixed database-first workflow or force a domain change into
every Contract.

Each Contract reports one evidence-backed Domain Impact:

- `none`;
- `reuse`;
- `change`;
- `add`;
- `uncertain`.

An `uncertain` impact blocks whole-Map acceptance when the uncertainty can
change Contract boundaries or dependencies.

## Delivery Strategy

Delivery Strategy belongs to Agent judgment. The first version does not require
a Strategy selector in the Composer. User Input may state a preference; otherwise
the Agent recommends the strategy supported by the current product, domain,
repository, and risk evidence.

Supported strategy vocabulary begins with:

- **Foundation-first:** establish shared data or architecture foundations before
  dependent experiences.
- **Experience-first:** validate interaction and presentation before connecting
  final lower layers.
- **Vertical slice:** deliver the smallest real end-to-end outcome first.
- **Risk-first:** resolve a technical, migration, performance, permission, or
  feasibility unknown before committing downstream scope.

A Strategy changes the Map only when it creates real hard prerequisites or
meaningfully changes Contract boundaries. It must not fabricate dependencies to
make the graph resemble a process diagram.

## Delivery Map

The Delivery Map is a first-class graph workspace, not a long Markdown response.
It uses the shared Praxis graph shell, Composer, Run status, Summary, Log, Latest
Response, selection, details, and dependency-focus behavior.

Latest Response explains why the Agent chose the current boundaries, identifies
risk or user attention, and links to the complete response. It does not replace
the Map.

Every Map is complete for the current request. A Contract Candidate represents
one independently deliverable result. It should:

- have one primary outcome;
- be reviewable through one coherent pull request or equivalent delivery;
- share one acceptance boundary;
- support a linear Just Do It Action sequence;
- avoid leaving an unusable intermediate result unless that result is an
  intentional reusable foundation;
- contain no unresolved product decision that requires a second design cycle;
- express every hard prerequisite explicitly.

The Agent splits when the scope contains independently deliverable outcomes,
shared reusable foundations, different acceptance surfaces, a risk gate that
must settle first, or a checkpoint that changes downstream design. It keeps work
together when splitting would create unusable scaffolding, when only an
end-to-end result can be accepted, or when separation adds handoff cost without
reducing risk.

There is no fixed Contract count.

## Hard dependencies

Map edges represent hard prerequisites only. They do not show every preferred or
chronological implementation step.

A dependency is valid when the dependent Contract cannot be completed or
honestly accepted without the delivered result of its prerequisite. Examples
include project setup before project code, a shared persistent model before a
Foundation-first feature set, or a resolved risk Contract before downstream
scope can be finalized.

Setup is generated only when Repository Context shows that the required project
foundation is absent. Existing setup is a satisfied fact, not a ceremonial
Contract.

The Host rejects unknown dependencies, self-dependencies, and cycles.

## Adjustment and coordination

The user cannot directly edit or delete a Contract Candidate. Direct mutation
would bypass the Agent's responsibility for coverage, sibling boundaries, and
dependencies.

Selection narrows feedback focus. It does not limit the output mutation scope.
The shared wording is:

> Focus selected; related Map nodes may change for consistency.

The user may select no nodes for whole-Map feedback, one node to discuss its
boundary, or several nodes to discuss overlap or separation. User feedback is
always natural language through the standard Composer.

The Agent receives the complete current Map, selected focus IDs, frozen sources,
current Repository Context, Domain Context, and new input. It returns a complete
new Map with explicit effects:

- `retain`;
- `replace`;
- `split`;
- `merge`;
- `add`;
- `remove`.

This reuses the atomic Recompose model already established in Break It Down.
The Host applies the new Map only after validating every old and new node exactly
once, all dependency endpoints, acyclicity, identity preservation, and source
coverage.

There is no delete button. A natural-language request to remove work can succeed
only when the Agent proves that acknowledged source meaning moved to another
Contract or that current User Input explicitly moved it out of scope.

## Evidence-bounded coverage

Praxis cannot mechanically prove that a model noticed every possible meaning in
free-form documents. It can prevent acknowledged meaning from silently
disappearing.

The Agent produces material source claims anchored to exact frozen source paths,
headings or excerpts, and hashes. The Host verifies those anchors exist. Every
material claim must be assigned to at least one Contract or explicitly marked
out of scope by current User Input. Map details expose this coverage before the
user accepts the Map.

Recompose validates that every previously acknowledged in-scope claim remains
covered or is explicitly removed by current user authority. It does not accept
an Agent statement of completeness as proof that no source meaning was missed.

## Whole-Map acceptance

The Delivery Map is accepted as one coordinated result. Individual Contract
Candidates cannot be accepted separately.

Acceptance requires:

- no blocking Open Decision;
- no `uncertain` Domain Impact that can change boundaries;
- valid hard dependencies;
- validated source anchors;
- complete coverage of acknowledged in-scope claims;
- one coherent Contract body for every Map node.

Acceptance materializes formal Delivery Contracts and freezes their dependency
graph. It does not create Just Do It Cards automatically.

## Delivery Contract

Each formal Contract contains:

- stable Contract ID and title;
- primary Outcome;
- Included and Excluded scope;
- Product Rules;
- Domain Impact;
- Required Experience States and design references;
- Repository Constraints and implementation anchors;
- hard dependencies;
- Acceptance criteria with stable IDs;
- validation expectations;
- Source Traceability;
- Open Decisions, which must be empty for an available Contract;
- recommended Delivery Strategy with evidence.

The Contract freezes what must become true and how the result is accepted. It may
record current integration boundaries that implementation must respect. It does
not prescribe an exhaustive filename inventory, class design, database schema,
or Action list unless an accepted source already makes one authoritative.

## Contract lifecycle

After whole-Map acceptance, a Contract is:

- **Available:** every hard prerequisite is delivered and the Contract has no
  Just Do It Card;
- **Waiting:** at least one hard prerequisite is not delivered;
- **In Delivery:** it has a corresponding Just Do It Card;
- **Delivered:** the corresponding Card's required output is accepted;
- **Superseded:** a later accepted Map replaced this not-yet-started Contract;
  it remains inspectable but cannot enter Just Do It.

The user manually chooses an Available Contract and invokes **Add to Just Do
It**. Praxis creates exactly one Card and preserves Contract identity, sources,
dependencies, and Acceptance IDs. Waiting Contracts cannot be added. Delivery of
a prerequisite unlocks its dependents.

Just Do It then inspects the real repository, creates one linear Plan for that
Contract, and determines concrete Actions and implementation choices.

## Product Design changes after delivery planning

Praxis keeps strict propagation rules underneath a small user-facing decision.
It uses three additional terms only:

- **Stale:** an unexecuted Map, Contract, or Plan was generated from an older
  Product Design or repository state and must be regenerated;
- **Locked:** at least one derived Just Do It Card is no longer deletable under
  the existing Just Do It rule, so the source Product Design cannot be edited
  in place;
- **Superseded:** a later effective artifact has replaced an earlier artifact in
  the same lineage. The earlier artifact remains evidence but cannot start new
  delivery.

Praxis does not use `deprecated` for this lifecycle because a replaced artifact
is not an older API that remains available. It does not use `suspended` because
that term belongs to temporary Agent and Host execution state.

### While every derived Card remains deletable

An accepted Product Design Feature remains editable while every derived Card is
still deletable. Just Do It already defines that boundary: a Card may be deleted
only when it has no confirmed Plan, no Actions, and no execution runs. A running
Planning Agent must first be stopped, but does not by itself create a durable
lock.

Editing the Feature marks every derived Candidate Map, formal Map,
not-yet-started Contract, deletable Card, and draft Plan as Stale. Stale
artifacts remain inspectable but cannot be accepted, converted, or executed.

The user does not manually unwind each layer. Opening What to Do from the
updated Feature regenerates the coordinated Map. Accepting that Map may mark
earlier Available or Waiting Contracts as Superseded. If a Contract already has
a deletable Card, the Host moves that Card to system Trash and Supersedes its
Contract atomically when accepting the replacement Map. No protected delivery
work is discarded.

### After a derived Card becomes non-deletable

As soon as any derived Card no longer satisfies the existing deletion rule, its
source Product Design becomes Locked. The normal UI asks one question:

> Does the requested change remain inside the current Contract's Outcome,
> Included scope, and Acceptance criteria?

If yes, the user continues with natural-language feedback in the current Just
Do It Card. Visual polish, implementation correction, and another attempt to
satisfy the same accepted result remain ordinary delivery work.

If no, the user starts a Redesign. Changes to product behavior, interaction
flow, information hierarchy, domain meaning, scope, or Acceptance belong to a
Redesign rather than an in-place edit.

Changing internal implementation while preserving the accepted product result
is not a Product Redesign. Before execution it belongs to Plan feedback. After
delivery it may become a separate refactor or engineering Contract.

### Redesign

Redesign is a new Product Design artifact linked to the locked original through
`redesignOf`. It records:

- the current accepted or delivered baseline;
- why a product change is needed;
- behavior and scope that change;
- behavior and scope that remain;
- behavior explicitly removed or added;
- affected Domain meaning and Experience states;
- new Acceptance expectations.

The original Feature is never rewritten. The Redesign becomes a new required
Source Feature for What to Do, alongside current implementation reality and
the Contracts already derived from the original.

A Redesign may be drafted and discussed while a related Card is In Delivery.
Its Candidate Map may also be generated. That Map cannot be accepted while a
non-deletable Card owns the same delivery boundary. The Card must first become
Delivered or complete a verified full rollback.

The original Feature remains the effective product truth until the Redesign's
Contracts are delivered and accepted. At that point the Redesign becomes the
effective Feature and the original becomes Superseded.

### Full rollback

Full rollback is a rare advanced action, not part of the normal Composer. A
delivery-chain detail view first shows every affected Map, Contract, Card,
Action, checkpoint, worktree, pull request, and accepted output.

The Host may unlock the original Product Design only after it verifies that all
derived active code changes, checkpoints, delivery outputs, and publication
state have returned to the pre-execution baseline. Canceling an Agent or closing
a panel is not a rollback. A Delivered result cannot be erased to unlock its
source; later product change must use Redesign.

### Propagation boundary

Accepted Maps may Supersede Available or Waiting Contracts and Contracts whose
Card remains deletable. They never rewrite Contracts with a non-deletable Card
or Delivered work. New Contracts treat delivered results as current
implementation reality and express the required delta.

Most users therefore see only:

1. edit safely while all derived Cards can still be deleted;
2. continue the current Card when the Contract still covers the change;
3. start Redesign when product meaning changes.

Stale propagation, dependency reconciliation, and rollback verification remain
Host-managed consequences rather than manual user workflow.

## Storage direction

The planned local layout is:

```text
<project-root>/.praxis/what-to-do/
├── repository-context/
│   ├── facts.json
│   └── summary.md
├── runs/
├── maps/
│   └── current.json
└── contracts/
    └── <contract-id>/
        ├── contract.json
        └── contract.md
```

Run directories retain frozen request, context, activity, response, summary, and
log evidence through the shared Agent Graph Run model. The current Map and
Repository Summary represent current truth; run evidence explains how that truth
was produced.

## Harness outcomes

The What to Do Harness returns one of:

- `map-proposal`;
- `clarification`;
- `insufficient-evidence`;
- `no-change`.

A map proposal always contains the complete Map, explicit Recompose effects when
adjusting an existing Map, Contract bodies, hard dependencies, source claims,
coverage assignments, Domain Impact, Delivery Strategy, and Open Decisions.

The Harness must prefer clarification or insufficient evidence over fabricated
repository facts, domain changes, scope, dependencies, or acceptance criteria.

## First implementation boundary

The first implementation should include:

- a What to Do sidebar route and shared graph workspace;
- both Product Design entry points;
- required accepted Feature selection;
- the standard Composer and file-backed Packet;
- deterministic Repository Facts and an Agent-maintained Summary;
- automatic Domain Summary and detailed-model references;
- complete Delivery Map generation;
- focused natural-language whole-Map Recompose;
- hard dependency validation;
- source-anchor and acknowledged-coverage validation;
- whole-Map acceptance and Contract materialization;
- manual, dependency-gated one-to-one Just Do It conversion;
- shared Run, Log, Summary, Latest Response, loading, error, and attention states.

The first implementation does not add image, PDF, or HTML readers; a general
repository indexer; direct Contract editing or deletion; automatic Just Do It
creation; soft ordering edges; multi-user workflows; or cloud storage.

## Open questions

The following remain for the next design round:

- exact Contract Candidate face fields and density;
- Contract detail-panel information hierarchy;
- how source coverage is summarized without overwhelming the user;
- placement and wording of whole-Map acceptance;
- how Repository Summary refresh is surfaced when it changes the Map;
- whether Delivery Strategy should remain detail-only or appear on the Card face;
- exact route and folder naming if `what-to-do` changes before implementation.
- exact information hierarchy and confirmation for the advanced delivery-chain
  rollback view.
