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
    ├── modules/
    ├── tasks/
    └── relationships.json
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
├── sources/
├── modules/
│   └── deletion-works-on-screen.md
├── tasks/
│   ├── task-001.json
│   └── task-002.json
├── relationships.json
└── .cache/
    └── project.sqlite
```

This layout is an opinionated product contract and is not user-configurable.
Users choose the project root directory; AgentManager owns every path beneath
`.agent-manager/`. A stable layout keeps agents, Skills, synchronization,
validation, and migrations deterministic. Because AgentManager is open source,
specialized installations can change the implementation instead of adding a
configuration system to the core product.

Markdown is used for flexible human-readable product and acceptance content. JSON is used for stable structured records and agent interchange. SQLite is introduced only when graph queries require it.

## SQLite policy

SQLite is a derived local index by default, not the canonical versioned state.

Reasons:

- Git cannot show meaningful line-level SQLite diffs.
- Small logical changes can create new binary blobs.
- Concurrent agent changes to a SQLite file are difficult to merge.
- Markdown and JSON make planning history reviewable and portable.

The SQLite cache can be regenerated from canonical Markdown and JSON files. Its WAL, shared-memory files, and cache directory remain untracked.

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
- Task-graph rendering
- Pull-request reconciliation
- Cross-machine synchronization
