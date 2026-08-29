# AgentManager Architecture Decisions

## Local-first boundary

AgentManager is a local web application. Its browser interface talks to a service running on the same computer. Core behavior must not depend on a hosted database, hosted object storage, a user account, or a proprietary cloud runtime.

The initial implementation uses TypeScript and React for the interface and a local Node.js service for filesystem and Git access. Technology choices may evolve, but local portability is a product requirement rather than an implementation detail.

## Two repositories per managed product

A managed product can have two independent Git repositories:

1. The code repository, which contains source code, tests, durable product documents, and pull requests.
2. An AgentManager companion repository, which contains versioned planning data.

Example remotes:

```text
alex-coding-studio/HereItIs
alex-coding-studio/HereItIs-AgentManager
```

The companion repository can be checked out inside the code repository:

```text
HereItIs/
├── .git/
├── HereItIs/
├── docs/
└── .agent-manager/
    ├── .git/
    ├── project.json
    ├── context/
    ├── task-decomposition/
    └── task-graph/
        └── nodes/
```

This is an independent nested repository, not a Git submodule.

## Why Git submodules are rejected

A submodule makes the outer code repository track a companion-repository commit pointer. Every planning update would leave the code repository with a modified submodule pointer and would require a code-repository commit to propagate the new planning revision.

That behavior violates the primary isolation requirement: planning-state changes must not alter the code repository's history or pull-request diff.

## Code-repository isolation

The outer code repository should ignore the nested `.agent-manager/` directory through its clone-local exclusion file:

```text
.git/info/exclude
```

with this entry:

```gitignore
.agent-manager/
```

This is preferred over editing the tracked `.gitignore` because enabling AgentManager should not produce a code change.

Required behavior:

- `git status` in the code repository does not show AgentManager data.
- Code pull requests never contain planning-state changes.
- Removing AgentManager does not affect the build.
- The planning repository can commit, push, pull, and roll back independently.
- Deleting the local companion checkout does not delete the remote planning history.

## Global registry

AgentManager keeps a minimal machine-local registry, initially as a config file rather than a database. Its responsibility is only to locate projects and their companion repositories.

Conceptual shape:

```json
{
  "schemaVersion": 1,
  "projects": [
    {
      "id": "generated-uuid",
      "kind": "repository",
      "name": "Here It Is",
      "description": "A place-based memory app.",
      "rootPath": "/path/to/HereItIs",
      "codePath": "/path/to/HereItIs",
      "planningPath": "/path/to/HereItIs/.agent-manager",
      "createdAt": "2026-08-28T12:00:00.000Z"
    }
  ]
}
```

For a standalone product idea, `kind` is `standalone` and `codePath` is null.
The user still selects the root directory explicitly. The registry does not own
task data or product assets.

## Companion-repository data

Human-readable and diffable files are the versioned source of truth for planning data.

Planned layout:

```text
.agent-manager/
├── project.json
├── context/
│   ├── README.md
│   ├── product/
│   │   └── README.md
│   ├── design/
│   │   └── README.md
│   ├── engineering/
│   │   └── README.md
│   ├── milestones/
│   │   └── README.md
│   ├── references/
│   │   └── README.md
│   └── other/
│       └── README.md
├── task-decomposition/
│   ├── settings.json
│   ├── instructions.md
│   └── attachments/
├── task-graph/
│   └── nodes/
│       ├── NODE-0001/
│       │   ├── node.json
│       │   └── resources/
│       │       └── product-foundation.md
│       └── NODE-0002/
│           └── node.json
└── .cache/
    └── project.sqlite
```

This layout is an opinionated product contract and is not user-configurable.
Users choose the project root directory; AgentManager owns every path beneath
`.agent-manager/`. A stable layout keeps agents, Skills, synchronization,
validation, and migrations deterministic. Because AgentManager is open source,
specialized installations can change the implementation instead of adding a
configuration system to the core product.

Product Context uses the filesystem as its canonical index. Each section is a
folder, and an optional `README.md` can define the section's purpose, content
boundary, and Agent loading guidance. AgentManager discovers sections by
scanning the directory. It does not duplicate the context tree in SQLite or a
manifest. Context source selection uses a recursive folder browser so nested
folders remain navigable while only concrete Markdown files can become
Resources.

Task Decomposition Context is user-owned feature context. Its Markdown
instructions and Markdown or JSON attachments apply to future decomposition
requests without being copied into every node. It is separate from the
AgentManager-owned Harness. A future Harness defines only the stable generation
contract: required Card fields, inference discipline, prohibited scope, and the
minimum valid output. It must not impose a rigid domain workflow or assume what
kind of input a user supplies.

Markdown is used for flexible human-readable product and acceptance content. JSON is used for stable structured records and agent interchange. SQLite is introduced only when graph queries require it.

## SQLite policy

SQLite is not part of the current architecture. Markdown and small JSON files
are sufficient for the intended personal scale. If measured graph-query or
filesystem-scan performance later requires an index, SQLite may be introduced
only as a derived local cache, never as canonical versioned state.

Reasons:

- Git cannot show meaningful line-level SQLite diffs.
- Small logical changes can create new binary blobs.
- Concurrent agent changes to a SQLite file are difficult to merge.
- Markdown and JSON make planning history reviewable and portable.

Any future SQLite cache must be regenerated from canonical Markdown and JSON
files. Its WAL, shared-memory files, and cache directory remain untracked.

Structured graph state uses small JSON files with explicit `schemaVersion`
fields. Prefer one file per node, including its direct dependency identifiers,
instead of one large project blob, so Agent writes remain bounded and Git diffs
remain readable. Scanning a few hundred small node files is acceptable for the
intended personal scale; a derived index is added only after measurement shows
that it is needed.

Graph structure and product semantics are separate. A node's `role` is either
`start` or `node`. Its open-ended `type` can be `source`, `experience`, `module`,
`task`, or a future product-specific value. A Start has no incoming graph
requirement and each Canvas owns exactly one. Independent roots will be modeled
as separate Canvases rather than coexisting in one graph. There is no `leaf`
role: a node is simply an endpoint while nothing continues from it.

Each node owns its direct `dependsOn` identifiers, its optional `derivedFrom`
lineage identifiers, and a list of typed Resources whose paths are relative to
`.agent-manager/`. Reverse dependency and lineage edges are derived by scanning
the node folders. This avoids maintaining a second relationship record that can
drift away from the cards it connects. Flexible type-specific fields live under
`metadata`; optional card rendering hints live under `presentation`.

React Flow is the canvas rendering and interaction layer. Canonical graph facts
remain in node JSON; the library does not own product state. Formal lineage
edges come from `derivedFrom`. The Composer sends a bounded request to a
selected local Agent. The request inherits source-node Resources and can add
request-only Context or local Markdown without mutating the source. Those
optional inputs share one collapsed `Run-only context` disclosure rather than
occupying the default Composer path. A connected
transient card represents the Run while it executes, and a validated proposal
replaces it with Candidate cards. Node
positions are a deterministic Dagre projection driven only by lineage and
Request edges. The layout uses a left-to-right rank direction, generous rank
and sibling spacing, and bounded stable offsets so every target remains to the
right of its source without forcing a rigid grid. Dependency edges do not
influence placement. Users can pan and zoom the canvas, but Nodes are not
draggable and no presentation coordinates become canonical planning data.

Lineage and dependency edges retain separate directions and visual grammar. A
lineage edge runs from an origin to the Node derived from it and uses a neutral
solid stroke. Dependency edges stay hidden in the resting graph. Focusing a
card reveals each direct dependency from the dependent Node to the prerequisite
named in its `dependsOn` array as an amber dashed Bezier curve. The focused
card, direct lineage neighbors, direct dependency neighbors, and their edges
remain prominent while unrelated cards and edges dim. Card focus is separate
from the explicit details control that opens the inspector. A development-only
`?preview=graph-layout` fixture generates a single-root, four-generation graph
in memory for visual checks; it never replaces or mutates project data in
production.

The Node inspector derives four directional relationship lists from canonical
Node JSON: origins from `derivedFrom`, prerequisites from `dependsOn`, Nodes
that name the current Node as an origin, and Nodes that name it as a
prerequisite. Relationship navigation focuses and centers the chosen card
without storing viewport state. A Node is deletable only when the latter two
lists are empty. The server repeats that reference check immediately before
moving the complete Node directory to the operating system Trash. Deletion
never reconnects Nodes or cascades through the graph; the deleted Node's own
upstream relationships disappear with its directory.

Local Agent invocation is isolated behind a transport boundary. The first
transport launches the installed Codex CLI as a persistent-session, read-only child
process and uses the user's existing subscription login rather than storing an
API key. AgentManager sends the complete Harness and bounded request packet on
standard input, consumes structured JSON-line events, records the provider
thread identifier and reported usage when available, and validates the final
JSON before rendering it. Claude remains a separate future transport behind
the same Agent selector and Run contract.

Each invocation owns a durable `task-decomposition/runs/RUN-*/run.json` record
with AgentManager request identity, the exact User Instruction, project
decomposition instruction, Resource paths, input fingerprint, Harness revision,
transport, lifecycle timestamps, provider session identifier, usage, validated
result, and terminal error. Durable Run results can be reproduced and restored
after a page reload. Cancel marks the Run terminal before interrupting its process,
so late output cannot replace the restored Composer input. Proposal,
clarification, insufficient-evidence, failure, and cancellation remain distinct
states; only a later explicit acceptance can create formal Node folders.

One bounded Coordinator Agent Session belongs to each decomposition root. The
first Run creates a persistent provider Session; later parent-level additions
resume its `agentSessionId` and send supplemental Instructions, Resources, graph
deltas, and the current immutable sibling versions. The transport starts a fresh
Session when no resumable identifier exists or when bounded Session policy
requires a handoff. The initial Codex capability probe used an ephemeral Session
and remains evidence only; it is not a reusable Coordinator baseline.

Run operations are explicit. `propose` discovers the first direct children,
`append-candidates` may add new siblings without modifying existing children,
and `revise-candidate` may return only the same Candidate at its next revision.
The validator rejects identifier collisions and output outside the operation
boundary. `no-change` is a valid incremental result; conflicts with existing
boundaries become clarification rather than implicit rewrites.

Discarding an unaccepted Candidate moves its generated directory to the
operating system Trash and removes it from the Proposal result. Sibling
Candidates remain unchanged. When the discarded Candidate is the Proposal's
last result, the complete Run directory moves to Trash. Accepted Candidates are
formal Nodes and cannot use this transient deletion path.

Every node is a folder so it can carry its JSON card, node-local Resources, and
future generated artifacts without inventing a database relationship. Semantic
types are not registered in application code. The first accepted card of a new
type becomes its project-local reference and points `typeTemplateRef` to itself.
Later cards of that type point to the same reference card so an Agent can reuse
its color, metadata shape, and output conventions.

Editing a start node rewrites its `node.json` atomically, preserves its stable
identifier, and removes a copied Resource only when it is removed from the
node. The Markdown reader accepts only validated Context Library paths or
node-local Resource paths inside the selected project's planning directory.

The reference node is an editable type template. Its `presentation` supplies
the default card appearance. The keys and value shapes in its `metadata` are
the required structural example for newly generated cards of that type; an
Agent fills those keys with node-specific values rather than copying instance
data blindly. An optional `template.md` beside `node.json` can add field
semantics and natural-language generation rules. Before generating a known
type, an Agent resolves `typeTemplateRef` and reads both files when present.
Changing the reference affects future generation and never silently rewrites
existing nodes.

Example start node:

```json
{
  "schemaVersion": 1,
  "id": "NODE-0001",
  "role": "start",
  "type": "source",
  "title": "Task decomposition MVP",
  "status": "captured",
  "resources": [
    {
      "kind": "context",
      "path": "context/product/project.md"
    },
    {
      "kind": "attachment",
      "path": "task-graph/nodes/NODE-0001/resources/interaction-notes.md"
    }
  ],
  "dependsOn": [],
  "typeTemplateRef": "NODE-0001",
  "metadata": {},
  "presentation": {
    "color": "#525252"
  }
}
```

If later evidence shows that canonical SQLite is necessary, AgentManager must also produce a deterministic textual snapshot suitable for review and recovery before that architecture changes.

## Worktree identity

Agents may implement code from Git worktrees. A worktree must not create a second planning database.

AgentManager resolves a worktree back to the registered project using stable repository evidence such as the Git remote, Git common directory, or project identifier. All worktrees access the same registered companion repository through AgentManager or its MCP server.

## Future synchronization model

Synchronization is eventual and reproducible rather than real-time.

### Deterministic reconciliation

Ordinary code handles facts that do not require product judgment:

- A branch exists.
- A pull request is open, draft, ready, approved, closed, or merged.
- Required checks passed or failed.
- A merge commit exists.
- A task identifier appears in a pull-request description.

AgentManager can reconcile these facts on application launch, manual refresh, implementation handoff, or task completion. No model call is required.

Example transition:

```text
planned -> in_progress -> in_review -> delivered
```

For UI-bearing work:

```text
in_review -> waiting_for_ui -> delivered
```

### Semantic reconciliation

An agent is used only when meaning cannot be determined mechanically:

- A pull request delivers only part of a task.
- One pull request delivers multiple tasks.
- Review uncovers a new dependency.
- A task must be split or merged.
- A non-blocking review finding should become a follow-up task.
- A discovery changes product behavior rather than implementation planning.

Semantic changes must eventually be expressed as validated structured operations rather than unrestricted filesystem or database writes.

## Companion-repository Git behavior

After a validated planning operation, AgentManager may eventually:

1. Write the updated Markdown or JSON files.
2. Validate graph integrity.
3. Rebuild the local SQLite cache.
4. Create a focused companion-repository commit.
5. Push when a remote is configured and the network is available.

Examples of useful commit messages:

```text
Split destination picker into three executable tasks
Link TASK-042 to PR #79
Mark TASK-042 delivered
Record UI acceptance for deletion flow
```

These commits never modify the code repository.

## Deferred architecture

The following are intentionally not implemented in the first project-creation slice:

- Companion-repository creation on GitHub
- Git push or pull automation
- Canonical planning schemas
- SQLite task indexes
- MCP server
- Agent invocation
- Manual canvas positioning
- Pull-request reconciliation
- Cross-machine synchronization
