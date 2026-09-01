# AgentManager Product Foundation

## Product intent

AgentManager is a local-first workspace for one independent developer working
with AI agents. It helps grow an evolving product definition into coherent
directions and decompose selected scopes into independently understandable,
human-manageable units with explicit relationships.

The product exists because repository documents and pull requests are good homes for durable product facts and code, but they are too heavy for frequently changing planning state. AgentManager provides the missing planning and task-graph layer without replacing the repository.

AgentManager is not a project-management product. A project is only the boundary
that supplies product context and local assets. The product's center is
decomposition, dependency synchronization, and additional personal Agent
workflows built on those two capabilities. It does not add planning ceremony for
its own sake.

The broader relationship between product growth, human-manageable
decomposition, and delivery-sized implementation is defined in
[`DECOMPOSITION_MODEL.md`](DECOMPOSITION_MODEL.md). Existing Task Decomposition
terminology describes the current implementation and does not make one Agent
Session the universal size limit for every product-level Card.

The adjacent [What’s That?](WHATS_THAT_DOMAIN_MODEL.md) design defines an optional,
natural-language-first Domain Model workspace. It keeps Entities and semantic relationships
separate from What’s Next product exploration and from Break It Down delivery structure.

## Primary user

The primary user is one developer working across one or more software repositories with coding agents. The user owns product judgment and acceptance. Agents help clarify intent, decompose work, implement bounded tasks, review changes, and preserve delivery evidence.

AgentManager is not being designed for a multi-user organization. Team permissions, roles, billing, shared cloud workspaces, and real-time collaborative editing are outside the product boundary.

## Operating principles

1. Local operation is the default and complete operating mode.
2. No cloud account or paid service is required.
3. The product is intended to be open source.
4. A fresh clone can be installed and run locally using documented dependencies.
5. Repository documents remain the source of truth for durable product behavior, architecture, code, and tests.
6. AgentManager owns product-growth and decomposition state, graph
   relationships, and—when Implementation is introduced—delivery traceability.
7. Product facts and task-planning state must remain distinct.
8. Every new capability must solve a problem observed while using AgentManager to build AgentManager.
9. Repository documentation, product contracts, interface copy, examples, data fields, and delivery notes are written in English.
10. AgentManager owns one fixed internal asset layout; users choose the project
    root but do not configure internal planning paths.

## Self-hosting and self-iteration

AgentManager is its own first real project. Its product loop is:

1. Discuss an idea with an agent.
2. Produce or revise a user-approved Product Foundation.
3. Decompose the next product capability to a resolution that is useful for the
   current decision.
4. Pull one accepted item into implementation and resolve its delivery slices.
5. Validate the delivered behavior through real use.
6. Feed observed friction back into the Product Foundation or task graph.

This process develops the website and tests the product method at the same time.

## Product lifecycle

The intended lifecycle for any managed product is:

1. Create or register a project.
2. Attach existing Markdown or JSON sources, or begin from an idea.
3. Use dialogue to produce a normalized Product Foundation.
4. Confirm the Product Foundation with the user.
5. Ask an agent to decompose a selected scope into coherent, manageable units.
6. Review and calibrate the proposed graph at the desired resolution.
7. Select an accepted item for further decomposition or future implementation.
8. In the future Implementation workspace, turn that item into delivery slices.
9. Link implementation, review, pull request, merge, and human acceptance
   evidence back to the originating item.
10. Reconcile new discoveries into product facts or planning state according to their meaning.

## Core MVP

The core MVP is AI-assisted decomposition:

1. The user selects a product idea, capability, research direction,
   implementation goal, or another oversized scope.
2. The user optionally adds a natural-language decomposition instruction.
3. An agent receives the selected scope, bounded neighboring context, relevant
   sources, and the user's desired resolution.
4. The agent returns a structured proposal containing coherent next-level
   units, their boundaries, and any relevant dependencies.
5. The interface renders the proposal as a graph.
6. The user can accept it, reject it, edit it, or provide one more calibration instruction.
7. The accepted result becomes planning state.

The MVP succeeds when the resulting Cards are coherent, distinguishable,
independently inspectable, and manageable for the user's current purpose. The
user—not a universal Agent Session or pull-request limit—decides when the
resolution is feasible.

## First implementation slice

Before task decomposition can be tested, AgentManager needs the smallest project container.

The first slice only allows the user to:

1. Register a local project directory.
2. Give the project a name.
3. Give the project a short description.
4. See the registered project after restarting AgentManager.

Markdown upload, Product Foundation generation, SQLite task storage, task decomposition, graph visualization, MCP access, Git synchronization, and pull-request reconciliation are explicitly deferred.

## Second implementation slice

The second slice establishes Product Context as a readable filesystem-backed
library:

1. Initialize fixed Product, Design, Engineering, Milestones, References, and
   Other folders.
2. Give the context root and every section an English `README.md` explaining its
   purpose and Agent loading boundary.
3. Discover sections directly from the filesystem without a database or
   manifest.
4. Select a section and read its rendered Markdown in a persistent preview
   area.
5. Open any README in a reusable focus-reading overlay for long documents.
6. Reveal the selected section in the operating system's file manager for
   external editing.
7. Create a titled Markdown document in the selected section.
8. Import one or more Markdown files through a file picker or drag and drop,
   explicitly confirming before replacing existing content.
9. Create and rename context folders while leaving folder deletion to the
   operating system's file manager.
10. Delete individual Markdown documents without deleting their folder.

Editing Markdown in the browser, moving documents between folders, and
previewing non-Markdown assets remain deferred.

## Third implementation slice

The third slice captures stable starting points for later Agent decomposition:

1. Open a canvas-backed Task Decomposition workspace.
2. Give a start node a concise title.
3. Select one or more Markdown documents already stored in Product Context.
4. Add one or more local Markdown sources by file picker or drag and drop.
5. Copy external sources into the node's own Resource folder.
6. Persist one human-readable JSON record with relative source references.
7. Render the captured start node on the canvas.
8. Show each source by file name and open Markdown sources in the shared reader.
9. Edit the node title and source set without changing the node identity.
10. Keep the Canvas full-width and open node creation in a modal workspace.
11. Open a node Inspector by selecting its Card.
12. Offer editing from the Inspector rather than placing edit controls on Cards.

Agent invocation, generated child nodes, dependency edges, manual canvas
positioning, and prompt calibration remain outside this slice.

## Fourth implementation slice

The fourth slice creates user-managed context for Task Decomposition:

1. Open a dedicated Context workspace from the Task Canvas or project navigation.
2. Save project-specific decomposition guidance as Markdown.
3. Add, preview, and remove Markdown or JSON context attachments.
4. Persist the feature context under the project's `.agent-manager/` directory.
5. Keep user context independent from the future AgentManager-owned Harness.

The Harness and Agent invocation remain outside this slice. The future Harness
will define a high-level generation contract rather than a fixed sequence. It
will describe Card requirements, how to reason from incomplete input, inference
boundaries, prohibited behavior, and the minimum useful delivery while leaving
domain-specific structure to user context and source material.

The accepted pre-implementation design is recorded in
[`TASK_DECOMPOSITION_HARNESS.md`](TASK_DECOMPOSITION_HARNESS.md).

## Fifth implementation slice

The fifth slice turns the agreed Harness design into an executable contract
without invoking an Agent yet:

1. Compile an immutable, compact Task Decomposition Harness into AgentManager.
2. Expose one machine-readable output contract for proposals, bounded
   clarifications, and insufficient-evidence results.
3. Validate request identity, Candidate revisions, graph references, Resource
   references, and impact claims before any future persistence step.
4. Reject stale, malformed, unsupported, or invented output before it can reach
   the formal graph.
5. Keep deterministic tests for the three outcomes and the Harness context
   budget.

Agent transport, Decomposition Session persistence, Candidate UI, context
expansion, acceptance, and formal Node promotion remain outside this slice.

## Sixth implementation slice

The sixth slice makes the Task Canvas a real graph workspace before Agent
transport is introduced:

1. Render formal Nodes and lineage edges on a pannable, zoomable React Flow
   canvas.
2. Derive immutable Node placement from lineage depth, with each generation in
   the next column and siblings arranged within that column.
3. Keep Cards project-defined while using a shared visual language for formal
   Nodes and temporary requests.
4. Start decomposition from the plus control on any formal Node.
5. Reuse the source Node's Resources and collect one bounded instruction in the
   Composer. Keep optional request-only Context and local Markdown inside one
   collapsed `Run-only context` disclosure.
6. Show a local-only request summary beside its source with a visible dashed
   directional edge; generated titles belong only to later Candidate Cards.
7. Keep the Draft explicitly ephemeral: it is neither persisted nor sent to an
   Agent and disappears when the page reloads.

Agent transport, validated Candidate output, Candidate persistence, acceptance,
and formal Node promotion remain outside this slice.

## Seventh implementation slice

The seventh slice completes relationship visualization before Agent transport:

1. Render execution prerequisites from each formal Node's `dependsOn` field.
2. Keep lineage as a neutral solid arrow and show dependencies as amber dashed
   arrows with a shared legend so the two meanings cannot be confused.
3. Provide a development-only `?preview=graph-layout` fixture with one root,
   four generations, sibling branches, multiple origins, cross-branch
   dependencies, and one Request Preview.
4. Generate the fixture in memory without reading or writing project graph
   data.
5. Enforce one Start per Canvas in both the interface and server writes; future
   independent roots belong to separate Canvases.

The fixture exists for visual acceptance and regression checks. It is disabled
in production and is not a simulation of Agent behavior.

## Eighth implementation slice

The eighth slice makes larger graphs readable without persisting presentation
coordinates:

1. Derive a deterministic left-to-right layout from lineage and Request edges
   with wider spacing and small stable offsets instead of a rigid grid.
2. Guarantee that every derived Node remains to the right of its origin while
   allowing flexible vertical placement.
3. Hide dependency edges in the resting graph, then reveal direct dependencies
   as amber dashed curves when the user focuses a card.
4. Dim unrelated cards and edges while preserving the focused card and all of
   its direct lineage and dependency relationships.
5. Let a card click focus relationships and provide a separate details control
   for opening the inspector.
6. Keep the initial fitted view readable while allowing manual zoom down to
   twenty percent for large graphs.

## Ninth implementation slice

The ninth slice makes graph relationships inspectable and establishes safe
manual deletion:

1. List `Derived from`, `Depends on`, `Derived nodes`, and `Dependents`
   separately in the Node inspector.
2. Let every relationship row close the inspector, focus the related card, and
   center it on the Canvas.
3. Allow deletion only when no formal Node derives from or depends on the
   selected Node.
4. Move the complete Node folder to the operating system Trash after both the
   interface and server validate that it is no longer referenced.
5. Apply the same rule to Start so deleting the final unreferenced Start returns
   the Canvas to its empty state.
6. Let the development fixture simulate deletion in memory without touching
   project data.

## Tenth implementation slice

The tenth slice completes the first local Codex Agent Run loop:

1. Choose Codex in the decomposition Composer and send the Instruction,
   inherited Resources, explicit Run-only Resources, feature Context, graph
   map, and immutable Harness through one bounded Run package.
2. Use the installed Codex CLI with the user's existing subscription login; do
   not require an API key, hosted AgentManager service, or model configuration.
3. Render a connected running card immediately and let the user cancel it,
   interrupt the local process, and restore the exact in-memory Composer input.
4. Persist Run identity, lifecycle, provider session identity, raw usage when
   available, validated result, and errors beneath the project's planning data.
5. Restore durable Run results after reload and replace a successful Run with
   one or more validated Candidate cards.
6. Keep clarification, insufficient evidence, failure, and cancellation visible
   as honest outcomes rather than manufacturing a proposal.
7. Keep every Candidate temporary while supporting inspection, constrained
   revision, deterministic Markdown generation, and explicit promotion to a
   formal Node.
8. Let the user discard an unaccepted Candidate. Move that Candidate and its
   output to the operating system Trash without changing sibling Candidates;
   discarding the final Candidate removes the complete Proposal Run.

## Eleventh implementation slice

The eleventh slice adds Claude as a second local Agent transport:

1. Choose Codex or Claude in the decomposition Composer and send an identical
   bounded request through the same Harness, validation, and Run contract.
2. Use the installed Claude CLI with the user's existing subscription login; do
   not require an API key or model configuration.
3. Restrict the Claude child process to read-only file tools inside its own Run
   directory, matching the containment the Codex transport already applies.
4. Record the selected transport on the Run so a restored Run names the Agent
   that produced it.
5. Continue a Coordinator Session only within one transport; selecting the other
   Agent starts a fresh Session.
6. Keep proposal, clarification, insufficient evidence, no change, failure, and
   cancellation identical across both transports.

Per-provider model selection, cost comparison, and running both Agents on one
request remain outside this slice.

## Twelfth implementation slice

The twelfth slice makes dependencies between proposed siblings first-class:

1. Let a Candidate name either an accepted Node or another Candidate from the
   same bounded proposal as an execution prerequisite.
2. Render Candidate dependencies on the Canvas and in the Candidate inspector
   instead of storing them only in open-ended metadata.
3. Reject unknown references, self-dependencies, and dependency cycles before a
   proposal reaches the Canvas.
4. Require prerequisites to be accepted first, then map their Candidate
   identifiers to formal Node identifiers during promotion.
5. Prevent discarding a Candidate while another unaccepted Candidate still
   depends on it.

## Thirteenth implementation slice

The thirteenth slice makes bounded Context access uniform at every graph level:

1. Give every Run one read-only Context Workspace and manifest.
2. Treat all selected Start-node sources as primary for root decomposition.
3. Treat only a descendant Node's `output.md` as inherited primary Context for
   its next layer.
4. Keep ancestor sources, neighboring Node outputs, and feature attachments as
   related files that the running Agent may inspect with its own read tools.
   Bound neighboring Nodes to direct graph and shared-Resource relationships.
5. Treat explicitly added Run-only Context as primary for that Run.
6. Snapshot files and hashes with the Run while keeping document bodies out of
   the initial prompt.

## Decomposition continuity

Every action preserves the meaning of already visible boundaries:

1. The plus control on a parent asks its Coordinator Agent to discover new
   direct children from supplemental Instructions or Resources. Existing formal
   Nodes and Candidates are immutable inputs and are never silently replaced,
   renamed, merged, or deleted.
2. The Composer states that existing children will not be replaced. An
   incremental Run returns only genuinely new sibling Candidates. It may return
   `no-change` when no additional boundary is supported, or clarification when
   new evidence conflicts with an existing child.
3. Candidate `Revise` redefines exactly that Candidate. It returns the same
   Candidate identifier at the next revision and cannot create siblings or
   children. A material structural change becomes clarification rather than a
   hidden expansion.
4. Child decomposition begins only from that child after its current boundary
   is accepted. Its plus control then generates that child's own next layer.
5. Parent-level incremental discovery reuses the parent's bounded Coordinator
   Agent Session when possible. It sends only new Instructions, new Resources,
   graph deltas, and current version fingerprints instead of reinjecting
   unchanged Context. An independent review never reuses that Session.

These rules let a project boundary become more complete as facts arrive without
allowing stochastic regeneration to overwrite work the user already reviewed.

## Canvas direction

Decomposition is an open canvas rather than a traditional project board.
Each Canvas owns exactly one Start and expands from that root. Future Agent
operations can continue from any selected node and produce additional nodes and
dependency edges. Independent roots will belong to separate Canvases rather
than sharing one graph.

Graph role and semantic type are independent. `start` and `node` describe where
an item sits in the graph. Open-ended semantic types such as `source`,
`experience`, `module`, and `task` determine what the card means. A node with no
continuation is naturally an endpoint; the model does not require a separate
leaf type.

Each node is a folder containing its `node.json`, node-local Resources, and
future generated artifacts. Node JSON can carry type-specific `metadata`
without a relational schema migration. It may also carry presentation hints
such as a card color. Semantic types are project-defined strings rather than an
application enum. The first accepted card of a new type becomes its reference;
later cards of that type point to it and inherit its visual and structural
conventions. Users can extend the reference card's metadata or add a
`template.md` with type-specific generation rules. Agents resolve that reference
before creating another card of the same type, so project conventions can
evolve without an application schema migration. The canvas renders newly
introduced types from their JSON. Future decomposition requests package
selected Resources, user instructions, and answers collected by the interface
for an Agent through MCP. The Agent returns validated node JSON and edges rather
than unstructured prose.

## Planned domain concepts

### Project

A registered local product and its planning companion. It has a stable identity,
a user-selected root directory, a name, and a short description. It may point to
an existing code repository or begin as a standalone product idea without code.

### Product source

An original Markdown or JSON asset that contributes product context. Original assets remain inspectable files.

### Product Foundation

A normalized and user-approved product definition produced through dialogue or derived from existing sources.

### Module

A user-visible capability that can be accepted as a meaningful product result. A module can require one or more tasks.

### Task

An executable and independently verifiable unit of work with explicit acceptance criteria.

### Dependency

A directional relationship indicating that one task must be completed before another task can become ready.

### Delivery evidence

Branches, pull requests, reviews, merge commits, automated gates, and human acceptance linked to a task.

## Explicit non-goals for early versions

- Multi-user collaboration
- Accounts, roles, or permissions
- Cloud-first storage
- Real-time synchronization
- Sprint planning or time tracking
- General-purpose team project management
- Replacing GitHub, repositories, or product contracts
- Running coding agents inside a hosted AgentManager service
- Automatic product decisions without user confirmation
