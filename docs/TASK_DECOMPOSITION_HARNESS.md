# Task Decomposition Harness Design

## Status

This document records the current product decisions for AgentManager's built-in
Task Decomposition Harness. It preserves the design before implementation. It is
not yet the executable Harness, a finalized storage schema, or an implementation
plan.

## Purpose

The Harness helps one developer turn ambiguous product material into a small
batch of inspectable Cards, calibrate those Cards through focused dialogue, and
promote accepted results into the Task Canvas.

It does not attempt to decompose an entire product from its root to executable
leaf tasks in one request. Its minimum useful result is a bounded set of
well-supported next-level options that the user can understand and refine.

## Product ownership

The Harness is an AgentManager-owned core capability.

- Ordinary users cannot edit, replace, disable, or select another Harness from
  the interface or settings.
- User-managed Task Decomposition Context remains separate and can contain
  project-specific instructions and Markdown or JSON attachments.
- Because AgentManager is open source, a user may fork the source or manually
  change an installation. AgentManager does not provide a customization workflow
  or compatibility guarantee for those modifications.

## Harness boundary

The Harness defines stable reasoning and output constraints at a high level:

- the minimum information every generated Card must contain;
- how the Agent reasons from incomplete or ambiguous input;
- when an inference is supported and when it must be surfaced to the user;
- what the Agent must not invent or silently change;
- the minimum useful delivery for one decomposition round; and
- how accepted Cards relate to their origins and execution dependencies.

The Harness must not prescribe a fixed domain sequence such as Experience to
Milestone to Task. It must not assume a fixed graph depth, Card count, semantic
type vocabulary, or input-document type.

## Harness packaging and size

The Harness follows the same progressive-disclosure principle as a focused
Agent Skill. Its always-loaded core must remain short enough to preserve the
user's sources and working graph as the dominant context.

The runtime package has three layers:

1. A compact core prompt defines the Agent's role, reasoning boundary,
   generation discipline, minimum delivery, and expansion rules.
2. A machine-readable structure contract defines JSON fields and validation
   without repeating the schema as explanatory prose throughout the prompt.
3. Examples, type templates, and full neighboring content are loaded only when
   the current request requires them.

New guidance does not automatically belong in the always-loaded core. Prefer a
validator for mechanical rules, a type template for type-specific structure,
or an on-demand reference for examples. The final size budget should be set by
evaluation against real decomposition tasks rather than by accumulating every
observed edge case in the core prompt.

## Decomposition Session

One invocation creates or continues a bounded Decomposition Session.

1. The user selects one or more source nodes or files and states the current
   decomposition goal.
2. The Coordinator assembles a bounded context packet.
3. The Agent generates a small batch of Candidate Cards, such as several
   possible functional modules.
4. The interface persists and displays every Candidate independently.
5. The user can keep, revise, split, merge, remove, or accept a Candidate.
6. Feedback about one Candidate revises that Candidate with only the relevant
   context instead of regenerating the entire batch.
7. Accepting a Candidate promotes it into a formal Canvas Node.

When a genuine product ambiguity has more than one reasonable resolution, the
Agent presents two or three concrete options, explains their effects, and gives
a recommendation. It must not make the user guess what kind of clarification is
needed.

The Harness does not require the Agent to manufacture a fixed number of Cards.
When the available evidence cannot support a useful proposal, the Agent either
asks one bounded clarification with concrete options or returns no Candidates
and identifies the missing evidence. It does not keep expanding context in an
attempt to force an answer.

## Candidate and Node separation

Candidate Cards are temporary session artifacts. Formal Nodes are durable graph
state. They do not share one lifecycle field.

- Candidates may be revised, compared, replaced, or discarded while a session
  is active.
- Formal Nodes are created only after explicit user acceptance.
- Once accepted, a Node cannot be silently rewritten by a later decomposition
  round.
- Dialogue state such as `draft`, `revising`, or `accepted` does not pollute the
  formal graph schema.

The active session may keep structured Candidate versions and feedback for
comparison or undo. It must not inject the complete conversation transcript into
every Agent call.

Every Candidate has a stable session-local identifier and a monotonically
increasing revision. User acceptance targets one exact revision rather than the
Candidate name in general. The session also records the input revision or
fingerprint used to generate that revision. If a relevant source, origin,
dependency, or protected Node changes before acceptance, AgentManager marks the
Candidate stale and requires reconciliation instead of silently promoting it.

## Proposal and mutation boundary

The Agent proposes graph changes but cannot mutate formal graph state.

1. The Agent returns Candidate Cards and proposed relationships.
2. AgentManager validates structure, identifiers, references, relationship
   semantics, and protected-node constraints.
3. The user accepts an exact Candidate revision.
4. AgentManager promotes the accepted revision through one crash-safe operation.

Malformed, partial, or unsupported Agent output remains session evidence and
never becomes a formal Node. Promotion either writes the complete validated
result or leaves the formal graph unchanged. Existing accepted Nodes cannot be
edited or deleted as a side effect of accepting a new Candidate; such changes
require a separate explicit proposal and user decision.

## Confirmation and cleanup

Confirmation is a responsibility boundary.

1. AgentManager writes the accepted formal Nodes first.
2. After the write succeeds, abandoned Candidate files, superseded versions, and
   transient session history are moved to the operating system's Trash.
3. AgentManager keeps no private trash directory, trash index, restore interface,
   retention policy, or recovery metadata.
4. If the system Trash operation fails, AgentManager reports that cleanup failed
   and does not claim that the session was completely finalized.

The user and the operating system own retention after deletion. A user who
manually restores an older Candidate can supply it later as fresh input for a
replacement proposal.

## Context Coordinator

The Coordinator is a Context Broker, not a second omniscient reasoning Agent.
It provides broad discoverability while keeping the initial prompt narrow.

### Initial full context

Every decomposition round initially includes:

- the built-in Harness;
- the user's current decomposition goal;
- the project's user-managed `instructions.md`;
- the selected source node, current node, or current Candidate;
- explicitly selected source documents; and
- feedback for the current revision.

Task Decomposition Context attachments are not all loaded eagerly. Explicitly
selected attachments are included in full. Other attachments appear only as a
lightweight inventory and are expanded when the Agent identifies a concrete
need. The interface should warn when the always-loaded instructions themselves
become unusually large rather than silently truncating user constraints.

### Instruction authority

The context packet preserves an explicit authority order:

1. the immutable built-in Harness and structural contract;
2. the user's current goal and explicit answers for this session;
3. the project's user-managed decomposition instructions;
4. the selected semantic type template; and
5. source documents and neighboring graph content as evidence.

Source documents may describe a product or contain quoted prompts, but they are
not operational instructions unless the user explicitly selected them for that
purpose. A lower-authority source cannot override a higher-authority boundary.

### Initial graph map

The packet also includes a lightweight map of potentially relevant graph state.
For each mapped item, the Agent receives only stable identity and navigation
information:

- identifier;
- title;
- semantic type;
- short summary;
- decomposition origin relationships;
- execution dependencies; and
- reverse execution dependents derived by AgentManager.

This map may include the selected item's origins, siblings, dependencies,
reverse dependents, shared-source neighbors, adjacent working-set Candidates,
and accepted or frozen Nodes.

### Expansion rule

Full Node or Candidate content is loaded only when the Agent identifies a
specific possible impact that cannot be resolved from the lightweight map.

Before proposing a result, the Agent must perform an impact pass covering:

- direct dependencies;
- reverse dependencies;
- siblings from the same decomposition origin;
- Nodes that share relevant Resources;
- adjacent Candidates in the active working set; and
- accepted or otherwise protected Nodes.

If the Agent claims that an existing item is affected, it must read that item's
full content before making the proposal. Context access is therefore available
on demand, but content is not eagerly injected.

Each round receives a fresh bounded packet rebuilt from structured session
state. Prompt size does not grow by appending the complete prior conversation.
After a bounded expansion cycle, unresolved material ambiguity is returned to
the user through the clarification behavior instead of triggering an unlimited
graph traversal. The concrete expansion budget remains an evaluated runtime
policy rather than a fixed semantic rule in the Harness.

## Relationship semantics

Decomposition lineage and execution ordering are separate relationships.

```json
{
  "derivedFrom": ["NODE-0001"],
  "dependsOn": ["NODE-0032"]
}
```

`derivedFrom` records why a Node exists in the decomposition graph:

- a start node has an empty `derivedFrom` array;
- a generated Node has one or more origin Nodes;
- siblings share at least one origin;
- multiple origins are allowed when a result synthesizes several branches; and
- source documents are not origins and remain Resources.

`dependsOn` records only execution or capability prerequisites. Reverse children,
siblings, and dependents are derived dynamically and are never duplicated as
canonical fields.

## Formal Node core fields

Every formal Node has a stable, compact description suitable for the graph map.

```json
{
  "schemaVersion": 2,
  "id": "NODE-0042",
  "role": "node",
  "type": "module",
  "title": "Task Decomposition",
  "summary": "Turns selected product context into a bounded set of inspectable Candidate Cards without committing them to the formal graph.",
  "derivedFrom": ["NODE-0001"],
  "dependsOn": [],
  "resources": [],
  "typeTemplateRef": "NODE-0010",
  "metadata": {},
  "presentation": {}
}
```

`summary` is required for every Node. It contains one or two stable sentences
describing what the Node owns and where its boundary ends. It is not a delivery
report or a substitute for type-specific acceptance data. Detailed outputs,
acceptance criteria, and other semantic fields remain in the type template and
`metadata`.

The example uses a future schema version only to show that adding `summary` and
`derivedFrom` requires an explicit migration. The exact version number remains
an implementation decision.

## Minimal provenance

An accepted Node records enough provenance to explain how it was produced
without retaining the complete dialogue:

- Harness identifier and version or revision;
- source references;
- acceptance timestamp; and
- the decomposition origins represented by `derivedFrom`.

The final field placement and migration behavior remain implementation work.

## Evaluation contract

The first Harness is an evaluated baseline rather than a claim of final quality.
Real decomposition cases compare an unguided baseline with Harness-guided output
and record at least:

- the share of Candidates accepted without revision;
- the amount and type of user correction;
- material capability omissions;
- incorrect execution dependencies;
- unsupported invention;
- initial and expanded context size;
- Agent rounds, elapsed time, and token usage when available; and
- malformed output, stale-input, and validation failure behavior.

Assertions test product meaning and relationship correctness rather than exact
wording. The initial smoke set should include a real AgentManager or HereItIs
decomposition, a large but mostly irrelevant context library, a sibling-impact
case, and a case where the correct result is clarification or no Candidate.
Observed failures first enter the evaluation taxonomy. A new rule moves into the
always-loaded Harness only when evidence shows that a validator, type template,
Coordinator rule, or on-demand reference cannot enforce it more cheaply.

## Decisions intentionally deferred

The following details should be settled when implementation begins:

- the complete Candidate JSON and readable Markdown representation beyond the
  required stable identifier, revision, and input fingerprint;
- active-session directory names and file lifecycle;
- the precise provenance object shape;
- context-size budgets and expansion limits;
- the Agent invocation transport and model selection;
- crash-safe confirmation and system-Trash behavior;
- schema migration from the current Node format; and
- the first experimental prompt used to compare AgentManager output with the
  existing project decomposition process.
