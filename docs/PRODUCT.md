# AgentManager Product Foundation

## Product intent

AgentManager is a local-first workspace for one independent developer working with AI agents. It helps turn an evolving product definition into small, executable, independently verifiable tasks with explicit relationships and delivery evidence.

The product exists because repository documents and pull requests are good homes for durable product facts and code, but they are too heavy for frequently changing planning state. AgentManager provides the missing planning and task-graph layer without replacing the repository.

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
