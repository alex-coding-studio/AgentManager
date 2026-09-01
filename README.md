# AgentManager

AgentManager is a local-first workspace for one developer building products with
AI agents. It is designed to grow product intent into coherent directions,
decompose selected scopes at a human-manageable resolution, and later carry
accepted work into independently verifiable delivery while keeping product and
execution state separate from code history.

It is a decomposition and dependency-synchronization tool, not a general
project-management system. Projects provide context boundaries for Agent work.

The current slices provide local project registration, a filesystem-backed
Product Context library, and capture of source-backed start nodes on the
Decomposition Canvas. Decomposition also has its own user-managed Markdown instructions
and Markdown or JSON attachments. A project can begin as a standalone product
idea or attach to an existing local code repository.

## Requirements

- Node.js 22.13 or later
- npm
- The Codex CLI or the Claude CLI, signed in with an existing subscription, for
  Decomposition Agent Runs

## Install the local command

```bash
npm install
npm run build
npm link
```

After that, start AgentManager from any terminal:

```bash
agent-manager
```

Open [http://localhost:3000](http://localhost:3000). Use
`agent-manager --port 3100` to choose another port.

For development with live reload:

```bash
agent-manager dev
```

To review the development server through a private Tailscale Serve hostname,
allow that hostname before starting the dev server:

```bash
AGENT_MANAGER_ALLOWED_DEV_ORIGINS=your-device.your-tailnet.ts.net agent-manager dev
tailscale serve --bg 3000
```

The hostname is machine-specific and must not be committed to configuration.
Tailscale Serve keeps the site inside the tailnet; this project does not require
or enable public Funnel access.

Publishing the port to a tailnet gives every device on that tailnet the ability to
register projects, write planning state and start Agent Runs on this machine.
AgentManager has no user authentication; `tailscale serve` bounds the network, not
the trust. See [API Request Boundary](docs/REQUEST_BOUNDARY.md) for what the
boundary does and does not cover.

## Settings, interface language, and appearance

Open **Settings** from the project sidebar or project-list header. Choose English
or Simplified Chinese under **Interface language**. The preference is saved
automatically in `~/.agent-manager/settings.json` (or `AGENT_MANAGER_HOME`) and
applies when the site is reopened.

Under **Appearance**, choose Light, Dark, or Follow system. Appearance is saved
in the same local settings file without changing the language preference. See
[Appearance](docs/APPEARANCE.md) for theme behavior.

This changes website interface text only. User input, Agent-generated cards,
Markdown, JSON, and project files remain unchanged. See
[Interface Language](docs/INTERFACE_LANGUAGE.md) for the boundary and persistence
details.

## Local data

The machine registry is stored at `~/.agent-manager/config.json`. Each project
stores its own metadata in `<project-root>/.agent-manager/project.json`. Registry
updates are serialized within one server process; see
[Project Registry Updates](docs/PROJECT_REGISTRY.md) for that boundary.

When the selected directory belongs to a Git repository, AgentManager adds
`.agent-manager/` to that clone's `.git/info/exclude`. It does not modify the
tracked `.gitignore`.

The internal `.agent-manager/` asset layout is fixed by the product. Users
choose the project root, while AgentManager owns the planning paths beneath it.
Product Context sections are discovered directly from folders and their
`README.md` files; no database or manifest duplicates that structure.
README files can be opened in a reusable focus reader or revealed in the system
file manager for external editing.
Markdown documents can be created from the interface or imported through a file
picker and drag and drop.
Decomposition Canvas start nodes are stored as one folder per node. Each node contains a
human-readable `node.json` and can carry its own Resource files. Context Library
Markdown can be selected through the folder browser, while external Markdown
can be attached directly during node creation.
Decomposition Context is stored in the compatibility directory
`<project-root>/.agent-manager/task-decomposition/`. It remains separate from
the built-in Harness that defines Agent output boundaries. Existing internal
paths and identifiers retain `task-decomposition` for data compatibility.

Set `AGENT_MANAGER_HOME` to use a different machine-registry directory.
Set `AGENT_MANAGER_ALLOWED_HOSTS` to accept additional `Host` values beyond
`localhost`, `127.0.0.1` and `[::1]`; see
[API Request Boundary](docs/REQUEST_BOUNDARY.md).

## Verification

```bash
npm run test:ci
```

That is the single gate CI runs: format check, lint, typecheck, the full portable
test suite, and the production build. Run it before opening a pull request.

While working, the focused commands are faster — one per domain:

```bash
npm run test:graph
npm run test:runs
npm run test:whats-next
npm run test:boundary
npm run test:registry
npm run test:api-errors
npm run test:implementation-execution
```

`npm test` runs every portable suite without the build. See `package.json` for the
full list.

Four commands are deliberately outside CI because they need a signed-in Codex CLI or
host-specific filesystem behavior: `test:coordination-smoke`, `test:simulator-access`,
`test:worktree-sandbox` and `test:appserver-code-smoke`. Run them locally when
changing the code they cover.

See [Product Foundation](docs/PRODUCT.md),
[Architecture Decisions](docs/ARCHITECTURE.md), and the
[Roadmap](docs/ROADMAP.md) for the current product boundary and next delivery
steps.

See [Just Do It](docs/JUST_DO_IT.md) for the execution-workspace design,
including settled workflow decisions and questions still open before implementation.

What's Next has a top-level **Context** control on both its empty start page and
its Canvas. Optional project Instructions are stored in
`.agent-manager/whats-next/instructions.md`. New projects start blank. Saving
applies to subsequent requests, including resumed sessions; clearing explicitly
removes earlier module Instructions without changing the Harness. Already running
requests retain their captured snapshot. This does not alter exploration strategy.

The Just Do It sidebar entry opens `/projects/<projectId>/implementation`,
where **Open preview** enters the [interactive demo](docs/JUST_DO_IT_DEMO.md)
at `/projects/<projectId>/implementation?preview=just-do-it`.
The UI baseline is frozen as of 2026-08-30. The ordinary route now supports
[real Planning](docs/JUST_DO_IT_PLANNING.md): import a formal Node, generate and
adjust a Plan with a local Agent, then Finalize. Action execution is not connected.
Preview uses fictional, in-memory data: no Agent calls, GitHub changes, or
project writes. Reload or leave preview to reset the examples.

In Preview, use **Add a goal** to try whole-plan generation, feedback, and confirmation
before any Actions appear. The demo also includes per-role model profiles and
Issue-style follow-ups; neither invokes a provider or writes to GitHub.

The [Just Do It Harness foundation](docs/JUST_DO_IT_HARNESS.md) is available
separately from the frozen UI. Run `npm run test:implementation-harness` for
contract/storage checks or `npm run preview:implementation-harness` to generate
a temporary Prompt, fixture response and progressive-disclosure handoff example.
Neither command invokes an Agent or modifies registered project data.

## License

MIT
