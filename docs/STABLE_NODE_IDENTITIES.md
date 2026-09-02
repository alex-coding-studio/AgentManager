# Stable Node Identities

## Contract

`uid` is the immutable UUID of a product object. Praxis allocates it when
a Start or a validated Candidate is first created. Refinement changes content
and revision, not identity. Acceptance preserves the Candidate UUID in the
Formal Node. A new descendant receives a new UUID.

`id` (`NODE-*`) and `candidateId` (`CANDIDATE-*`) remain human-readable aliases.
Aliases use the last eight hexadecimal characters of the UUID, extending by four
characters if a suffix is already owned by another UUID. Candidate and Formal
Node aliases retain the same suffix. API parameters, resource paths, and directory
names use these aliases. There is no numeric sequence or high-water counter.
Canvas headers show the small type label with the relationship count and
detail/cancel action grouped on its right. `Node-` or `Candidate-` with the
complete allocated suffix appears in small muted text at the bottom right,
without a divider. Input/output counts share that footer row on the left, together
with the revision for Candidates. Formal cards use the inspector's input/output
partition; Candidates count distinct Resource paths as input and their generated
document as one output. New loading requests show zero outputs, while refinement
retains the existing Candidate output. Actual file names and open actions remain
in the inspector. The footer stays in
normal flow so it cannot overlap content. Formal summaries and Candidate
descriptions preview up to three lines, using the space saved by the shared
metadata footer rather than reducing the reading font size.
Type labels wrap rather than truncate. The card's
minimum height and layout reservation share one constant. This presentation never
changes identity, storage paths, generated type names, or relationships.

`GraphNodeCard` is the shared presentation component for Formal, Candidate and
Loading cards; React Flow handles and graph selection stay in the canvas adapter.
Clicking a card highlights its incident lineage and dependency relationships.
Clicking its dependency-count button highlights only the incident dependency
edges and their endpoints. The count comes from those same edges, so a count of
one highlights exactly the selected card and one neighbor. Other cards and edges
are dimmed, and a normal card click restores the broader focus mode.
Aliases are not the canonical identity. Run and Session
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
output schema; Praxis resolves and persists UUID endpoints after validating
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

The identity index retains only alias-to-UUID bindings and active Formal aliases.
It does not retain discarded Markdown or conversation content.
Candidate aliases are reserved after discard so stale references
cannot attach to unrelated new content.

For new proposals, Agent-emitted Candidate identifiers are local to that response.
The application allocates UUID-based aliases, rewrites structured intra-proposal
dependencies, validates the complete result, and persists identities under one
allocation lock. Duplicate local declarations, invented references, invalid
schemas, and cycles still fail validation without consuming aliases. A local
declaration takes precedence over an identically named older Candidate; it never
replaces that older object. Refine remains strictly one-to-one and retains its
target identity. Persisted `candidateAliases` maps local labels to permanent
aliases; continuation packets provide the preceding proposal's reconciliation.

## Identity backfill

Each project graph owns an `identities.json` beside its `nodes` directory.
UUID values are globally unique and portable with the object.

On first access, identity backfill reads existing Node JSON and proposal Run JSON,
unifies all revisions and accepted Nodes through Candidate provenance, then
adds UUIDs and stable relationships. Existing Markdown, resource paths, content
revisions, timestamps, and request snapshots are not rewritten.

Before replacing a changed JSON record, backfill preserves its original bytes
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
