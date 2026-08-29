# AgentManager Product Foundation

## Product intent

AgentManager is a local-first workspace for one independent developer working with AI agents. It helps turn an evolving product definition into small, executable, independently verifiable tasks with explicit relationships and delivery evidence.

The product exists because repository documents and pull requests are good homes for durable product facts and code, but they are too heavy for frequently changing planning state. AgentManager provides the missing planning and task-graph layer without replacing the repository.

AgentManager is not a project-management product. A project is only the boundary
that supplies product context and local assets. The product's center is task
decomposition, dependency synchronization, and additional personal Agent
workflows built on those two capabilities. It does not add planning ceremony for
its own sake.

## Primary user

The primary user is one developer working across one or more software repositories with coding agents. The user owns product judgment and acceptance. Agents help clarify intent, decompose work, implement bounded tasks, review changes, and preserve delivery evidence.

AgentManager is not being designed for a multi-user organization. Team permissions, roles, billing, shared cloud workspaces, and real-time collaborative editing are outside the product boundary.

## Operating principles

1. Local operation is the default and complete operating mode.
2. No cloud account or paid service is required.
3. The product is intended to be open source.
4. A fresh clone can be installed and run locally using documented dependencies.
5. Repository documents remain the source of truth for durable product behavior, architecture, code, and tests.
6. AgentManager owns planning state, task decomposition, task relationships, and delivery traceability.
7. Product facts and task-planning state must remain distinct.
8. Every new capability must solve a problem observed while using AgentManager to build AgentManager.
9. Repository documentation, product contracts, interface copy, examples, data fields, and delivery notes are written in English.
10. AgentManager owns one fixed internal asset layout; users choose the project
    root but do not configure internal planning paths.

## Self-hosting and self-iteration

AgentManager is its own first real project. Its product loop is:

1. Discuss an idea with an agent.
2. Produce or revise a user-approved Product Foundation.
3. Decompose the next product capability into executable tasks.
4. Implement one ready task.
5. Validate the delivered behavior through real use.
6. Feed observed friction back into the Product Foundation or task graph.

This process develops the website and tests the product method at the same time.

## Product lifecycle

The intended lifecycle for any managed product is:

1. Create or register a project.
2. Attach existing Markdown or JSON sources, or begin from an idea.
3. Use dialogue to produce a normalized Product Foundation.
4. Confirm the Product Foundation with the user.
5. Ask an agent to decompose a capability into small tasks.
6. Review and calibrate the proposed task graph.
7. Select a task whose dependencies are satisfied.
8. Hand the bounded task to an implementation agent.
9. Link implementation, review, pull request, merge, and human acceptance evidence back to the task.
10. Reconcile new discoveries into product facts or planning state according to their meaning.

## Core MVP

The core MVP is AI-assisted task decomposition:

1. The user selects a product capability or oversized task.
2. The user optionally adds a natural-language decomposition instruction.
3. An agent receives the selected task, bounded neighboring context, relevant product sources, and task-size policy.
4. The agent returns a structured proposal containing smaller tasks, acceptance criteria, and dependencies.
5. The interface renders the proposal as a graph.
6. The user can accept it, reject it, edit it, or provide one more calibration instruction.
7. The accepted result becomes planning state.

The MVP succeeds when the resulting tasks are small enough for one agent session, independently verifiable, and understandable from the visual graph with at most one normal calibration round.

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

## Canvas direction

Task Decomposition is an open canvas rather than a traditional project board or
a single-root tree. A canvas can contain many independent start nodes. Future
Agent operations can continue from any selected node and produce additional
nodes and dependency edges.

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
