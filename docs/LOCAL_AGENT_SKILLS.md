# Local Agent Skills context

Codex sessions started by Praxis receive the locally enabled Skills catalog
without project-specific setup, manual path entry, or a Skills management screen.
A catalog entry makes a Skill available; it does not invoke the Skill or preload
its body. The Agent chooses a relevant Skill and reads its entry point on demand.

Before a new or resumed Codex run, the shared transport initializes a short-lived
Codex app-server with the normal local configuration and calls `skills/list` for
the run's working directory with `forceReload: true`. Discovery does not create a
thread, start a model turn, install plugins, or change their enabled settings.
Codex owns plugin discovery, path resolution, project trust and Skill enablement;
Praxis does not scan versioned cache directories or invent an iOS registry.

Only enabled names, descriptions and absolute entry-point paths are appended to
the run input. These machine-local paths are resolved at runtime, not committed
as project configuration. Disabled entries are also passed as `skills.config`
overrides to prevent standalone Skills from reappearing in the isolated worker's
own discovery. The appended input is visible in the normal Codex Session record.

The execution process still ignores unrelated user configuration and execpolicy
rules. Discovery also reads `config/read` at the user's home directory, so an
Agent-written project config cannot grant itself Full Access on the next Round.
An explicit user `danger-full-access` selection (including the corresponding
built-in default permission profile) is honored for execution; explicit read-only
stays read-only. Other built-in defaults retain the Card workspace sandbox. Unknown
custom profiles fail rather than being replaced with broader permissions.

Planning stays read-only regardless of the user's execution choice. Full Access
allows macOS simulator/device services, but provides no OS write barrier protecting
the primary checkout or planning store: Card worktree, Git/PR, scope and acceptance
rules remain workflow requirements. The selected mode is included in the execution
prompt and completed Run record. There is no fallback escalation after a failed
command, and already running Sessions are never changed. Skill metadata alone still
does not load plugin tools or hooks.

Discovery failure, malformed/incomplete results or timeout fail the run preparation
instead of silently presenting an empty catalog. Cancellation during discovery
terminates its helper and cannot start a late execution. The catalog is refreshed
on each launch; an already running Action keeps the context it started with.

This correction is specific to the Codex transport. Claude's existing restricted
launch path is unchanged and has not been certified for plugin-Skill parity.

Validation uses `npm run test:runs`, including protocol, disabled-entry, startup,
resume, error and cancellation fixtures. A native `skills/list` check against the
HereItIsV2 working directory returned 38 enabled entries, including six
`ios-dev-agent` Skills, without starting a model turn. This verifies discovery,
not execution of those Skills or their external dependencies.
