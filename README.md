# AgentManager

AgentManager is a local-first workspace for one developer building products with
AI agents. It is designed to turn product intent into small, executable,
independently verifiable tasks while keeping planning state separate from code
history.

It is a task-decomposition and dependency-synchronization tool, not a general
project-management system. Projects provide context boundaries for Agent work.

The current slice provides local project registration. A project can begin as a
standalone product idea or attach to an existing local code repository.

## Requirements

- Node.js 22.13 or later
- npm

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

## Local data

The machine registry is stored at `~/.agent-manager/config.json`. Each project
stores its own metadata in `<project-root>/.agent-manager/project.json`.

When the selected directory belongs to a Git repository, AgentManager adds
`.agent-manager/` to that clone's `.git/info/exclude`. It does not modify the
tracked `.gitignore`.

The internal `.agent-manager/` asset layout is fixed by the product. Users
choose the project root, while AgentManager owns the planning paths beneath it.

Set `AGENT_MANAGER_HOME` to use a different machine-registry directory.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

See [Product Foundation](docs/PRODUCT.md) and
[Architecture Decisions](docs/ARCHITECTURE.md) for the current product boundary.

## License

MIT
