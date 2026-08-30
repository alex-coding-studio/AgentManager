# Stable Node Identities

## Contract

`uid` is the immutable UUID of a product object. AgentManager allocates it when
a Start or a validated Candidate is first created. Refinement changes content
and revision, not identity. Acceptance preserves the Candidate UUID in the
Formal Node. A new descendant receives a new UUID.

`id` (`NODE-*`) and `candidateId` (`CANDIDATE-*`) remain human-readable aliases.
Existing API parameters, resource paths, and directory names retain these
aliases for compatibility. They are not the canonical identity. Run and Session
IDs identify execution and conversation, not product objects.

## Stable relationships

Persisted `relations.derivedFrom` and `relations.dependsOn` contain UUIDs.
The first records provenance; the second records prerequisites. Both may refer
to another Candidate before it is accepted. Acceptance changes the preferred
display alias of that UUID without changing any neighboring relationship.

Legacy `derivedFrom` and `dependsOn` arrays remain an adapter for short Agent
prompts and existing APIs. Reads project the stable relationships to current
display aliases. After migration, editing only a legacy alias array does not
change the canonical relationship; intentional graph edits must update the
UUID relationship. The Agent still returns short aliases in the existing
output schema; AgentManager resolves and persists UUID endpoints after validating
the complete response. Agents cannot assign or overwrite UUIDs.

Canvas node keys, edge endpoints, focus and layout use stable identity. Cards
and inspector actions continue to display and resolve short aliases. Adding or
removing graph topology may change layout; an alias or acceptance-state change
alone does not.

## Lifecycle

| Operation           | Identity and relationship behavior                                                            |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Create Start        | Allocate a new UUID before publishing the node.                                               |
| Generate Candidates | Allocate one UUID per new Candidate, then resolve all sibling links together.                 |
| Refine              | Preserve the selected Candidate UUID; validate the next revision and resolve supported links. |
| Accept              | Bind the new Node alias to the existing Candidate UUID.                                       |
| Grow or Decompose   | New objects receive new UUIDs and point to existing origin UUIDs.                             |
| Delete and recreate | A new object gets a new UUID and a new, non-recycled alias.                                   |
| Restore             | A restored object's saved UUID remains its identity.                                          |

The identity index retains only alias-to-UUID bindings and the Node-number
high-water mark. It does not retain discarded Markdown or conversation content.
An abandoned allocation may leave a numbering gap; it must never cause identity
reuse. Candidate aliases are also reserved after discard so stale references
cannot attach to unrelated new content.

## Compatibility migration

Each project graph owns an `identities.json` beside its `nodes` directory.
Graph-scoped aliases prevent the same display number in two workspaces from
colliding, while UUID values are globally unique and portable with the object.

On first access, migration reads existing Node JSON and proposal Run JSON,
unifies all revisions and accepted Nodes through Candidate provenance, then
adds UUIDs and stable relationships. Existing Markdown, resource paths, content
revisions, timestamps, and request snapshots are not rewritten.

Before replacing a changed JSON record, migration preserves its original bytes
under `identity-migration-backup` in that graph. Writes use atomic rename. The
index is persisted before individual records, so interruption and rerun retain
the same assignments. Conflicting identity claims fail visibly rather than
silently merging objects. Missing legacy targets reserve unresolved identities;
they do not get rebound to later objects.

Keep the index with the graph when copying or syncing project data. Do not reset
it merely because the Canvas is empty. Backups are migration rollback material,
not application history; blanket restoration after further user changes can
discard that newer work and requires explicit reconciliation.

The current store serializes allocation within the single local application
process, including development hot reload. Concurrent independent servers or
external writers must not modify the same sidecar. Multi-process locking and
cross-workspace graph moves are outside this migration.

## Verification

Tests cover both graph scopes, migration backups, multi-revision identity,
acceptance, descendant and sibling references, reload, deleted/recreated objects,
non-recycled aliases, concurrent local allocations, conflict rejection, and
coordinate preservation with stale display aliases. Browser checks verify UUID
Canvas keys, unchanged visible labels, live edges, selection and inspector access.
