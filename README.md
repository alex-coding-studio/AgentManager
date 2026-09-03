# Praxis

**From intent to action.**

Praxis is a local-first workspace for one developer building products with AI
agents. It keeps evolving product intent, domain meaning, decomposition, and
delivery work visible without turning them into project-management ceremony or
mixing planning state into the code repository.

Praxis is designed for a single trusted user on one machine. It can start from
an existing repository or from a product idea that has no code yet.

## Workspaces

- **Product Context** is the system-managed index of accepted module outputs.
  It groups MVP prototypes, product design, domain models, task breakdowns,
  delivery contracts, and task execution artifacts without copying them. It
  also discovers Markdown that a person or Agent maintains directly under
  `.praxis/context/`.
- **Product Discovery & Design** explores supported product directions. It separates Discovery
  from Product Design, applies module-specific Intention and Motion profiles,
  and keeps generated Candidates temporary until the user accepts them as
  Formal Nodes.
- **Scope Decomposition** turns a selected scope into coherent, human-manageable
  Candidates. A working set can be refined or atomically recomposed before its
  Candidates are accepted into the formal graph.
- **Domain Modeling** maintains a visual model of entities, fields,
  relationships, and constraints. Valid Agent changes become the current model
  immediately; the latest successful change has one Undo opportunity rather
  than a Candidate/finalization lifecycle.
- **Delivery Planning** turns accepted Product Design into one formal Delivery Map.
  Every validated update atomically replaces the Map; its Contracts and hard
  dependencies become executable sources without a separate Candidate phase.
- **Implementation** imports a Discovery Node, Scope Decomposition Node, or Delivery
  Contract as a goal, develops and finalizes an
  Agent-generated Plan, and executes one Action at a time in a Card-owned
  worktree. Required-check evidence, output review, user acceptance, local
  checkpoints, and GitHub delivery evidence remain distinct states.

Product Discovery & Design, Scope Decomposition, and Delivery Planning share the Agent Graph Workspace shell: canvas,
Card structure, Composer, Agent controls, file-backed input packets, Run status,
Summary, Log, and Latest Response presentation. Domain Modeling reuses the common
input and Run surfaces while keeping a Domain Model-specific graph. Harnesses,
profiles, context assembly, validation, and product language remain
module-specific.

### Agent input and instructions

Product Discovery & Design, Scope Decomposition, Domain Modeling, and Delivery Planning package direct user input as
`user-input.md`. Selected Product Context and graph resources become references;
temporary uploads become external inputs. The Agent receives an indexed packet
whose file paths and hashes identify the captured request instead of one large
inline prompt.

Each Agent workspace provides persistent module instructions for later
requests. Changing them does not rewrite an active Run. The graph Composers
currently accept Markdown uploads; Implementation also accepts plain-text files.
Scope Decomposition's persistent context area accepts Markdown or JSON.

## Requirements

- Node.js 26
- npm
- A locally installed and authenticated Codex CLI or Claude CLI for Agent
  operations across Product Discovery & Design, Scope Decomposition, Domain Modeling,
  Delivery Planning, and Implementation
- Git for Implementation worktrees and repository delivery
- Optional: GitHub CLI (`gh`) to resolve and refresh pull-request evidence

Praxis uses the Agent account and model access already configured on the local
machine. It does not include a hosted Agent service or its own account system.

## Install and run

```bash
npm install
npm run build
npm link
praxis
```

Open [http://localhost:3000](http://localhost:3000). Pass normal Next.js options
through the command when needed:

```bash
praxis --port 3100
```

For development with live reload:

```bash
praxis dev
praxis dev --port 3100
```

Run `praxis --help` to see the supported command forms.

## Local data and trust boundary

The machine-wide registry and interface settings live under `~/.praxis` by
default:

```text
~/.praxis/
├── config.json
└── settings.json
```

Each registered project keeps its Praxis-owned state under the selected project
root:

```text
<project-root>/.praxis/
├── project.json
├── context/
├── whats-next/
├── task-decomposition/
├── domain-model/
└── implementation/
```

For a Git repository, Praxis adds `.praxis/` to that clone's
`.git/info/exclude`; it does not edit the tracked `.gitignore`. Planning records,
Run evidence, generated Markdown, and execution worklogs remain local unless the
user deliberately versions or publishes them.

Set `PRAXIS_HOME` to relocate the machine-wide registry and settings. Set
`PRAXIS_ALLOWED_HOSTS` or `PRAXIS_ALLOWED_DEV_ORIGINS` to allow additional local
hostnames. Values are comma-separated.

Praxis has no user authentication. Its request boundary rejects unrecognized
hosts and cross-origin browser writes, but any process on the machine—and any
trusted-network device that can reach an allowed host—can use the local API.
Exposing Praxis through Tailscale Serve therefore grants that tailnet access to
project registration, planning writes, and Agent Runs. See
[API Request Boundary](docs/REQUEST_BOUNDARY.md) before exposing the server.

Agent execution can read or change local files according to the selected Agent's
effective permissions. Implementation uses isolated Card worktrees and explicit
workflow rules, but these are not an operating-system security boundary when the
Agent itself runs with Full Access.

## Interface

Settings supports English and Simplified Chinese interface text, plus Light,
Dark, and Follow system appearance. These preferences affect application-owned
UI only; project names, user input, filenames, Markdown, JSON, and Agent output
remain unchanged.

See [Interface Language](docs/INTERFACE_LANGUAGE.md) and
[Appearance](docs/APPEARANCE.md) for the exact persistence and fallback rules.

## Verification

Run the same full gate used by CI:

```bash
npm run test:ci
```

It checks formatting, lint, types, the portable test suite, and the production
build. Focused suites are available while working on one area:

```bash
npm run test:whats-next
npm run test:harness
npm run test:runs
npm run test:domain-model
npm run test:implementation-planning
npm run test:implementation-execution
npm run test:boundary
```

Host-dependent smoke tests are intentionally outside CI. See `package.json` for
their exact commands and prerequisites.

## Detailed references

- [Product foundation](docs/PRODUCT.md)
- [Architecture decisions](docs/ARCHITECTURE.md)
- [Scope Decomposition](docs/BREAK_IT_DOWN_PRODUCT_EVOLUTION.md)
- [Domain Modeling](docs/WHATS_THAT_DOMAIN_MODEL.md)
- [Implementation planning](docs/JUST_DO_IT_PLANNING.md)
- [Implementation execution](docs/JUST_DO_IT_EXECUTION.md)
- [Process boundaries](docs/PROCESS_BOUNDARIES.md)

## License

[MIT](LICENSE)
