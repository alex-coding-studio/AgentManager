# Event-Driven Agent Runtime

Status: provider-neutral contract with a Codex App Server pilot for Full Access execution
workers and a Claude CLI session driver for Claude coordinators and workspace-write Claude
workers. Read-only planning and ordinary Codex workspace-write execution remain on the legacy
transport. No Claude SDK or background-job configuration is included.

## Responsibility boundary

Praxis owns Card state, background processes, logs, cancellation and event routing.
Provider drivers own thread/turn protocol translation. Coordinator, worker and future
Reviewer flows consume the same runtime events and never depend on Codex- or Claude-specific
identifiers.

`AgentSessionDriver` declares thread creation/resume, turn start/interrupt and capability
flags. `HostJobBroker` runs one generic executable plus arguments inside the Card worktree,
writes bounded output and a durable job record, emits progress and completion events and
terminates the process group on Stop. It does not contain Xcode, Swift, test or repository
commands. Project entry points define their own argument-based selection, such as complete,
targeted or skipped checks; the Host only executes the supplied executable and argument
vector.

Quick deterministic Host operations do not create another physical turn. Full Access Codex
workers receive `publish_candidate`, which audits and publishes one clean Candidate HEAD
through the Host. Long validation remains outside the model through System validation runs.
See `CARD_HOST_OPERATIONS.md`.

A Host tool may instead suspend the turn. Its result carries an acknowledgement for the model
and a continuation promise owned by the Host. The driver acknowledges, interrupts the physical
turn and, when the promise settles, either starts a continuation turn in the same thread with
the supplied prompt or settles the logical turn directly with a Host-supplied final output.
`run_job` is one such tool; `dispatch_worker` is another (below). One suspension is pending per
turn; a second suspending call is rejected while the first is pending.

## Coordinator suspension boundary

The event boundary that resumes a Worker after a Host job now also resumes the Coordinator
after its Worker settles:

| Boundary                                     | Suspended thread | Continuation                                           |
| -------------------------------------------- | ---------------- | ------------------------------------------------------ |
| Host job completed                           | Worker           | `HOST_JOB_COMPLETED` with the job record               |
| Worker completed with unresolved required    | Coordinator      | `WORKER_COMPLETED` with the report and a new requestId |
| Worker reported `blocked` or `error`         | Coordinator      | `WORKER_ATTENTION_REQUIRED`                            |
| Worker returned no valid report or failed    | Coordinator      | `WORKER_FAILED`; repair is not offered                 |
| Worker passed every effective required check | Coordinator      | none: the Host settles the logical turn itself         |

The Coordinator runs as one read-only App Server thread per Round with a single Host tool,
`dispatch_worker`, whose argument is the complete JSON coordination decision (`dispatch` or
`repair`). The Host validates it against the current coordination request, records the
decision, starts the Worker through the existing Worker transport, and suspends the
Coordinator's physical turn. A dispatch or repair decision returned as text instead of a tool
call is dispatched the same way and resumed in the same thread. Budgets are unchanged: five
Agent calls, two Worker calls, one repair, a 300-second deadline and a 40-tool cap per
Coordinator physical turn. Stop interrupts the Coordinator thread, cancels the Worker and
prevents a late continuation.

Attention is derived by the Host from the Worker's report outcome; the Worker receives no new
tool. Activation: a Codex Coordinator profile follows the Worker pilot rule (the user's Full
Access selection); a Claude Coordinator profile always uses the Claude session driver below.
`lib/coordinator-events.ts` owns the event classification and continuation prompts.

## Claude session driver

`lib/claude-session-driver.ts` implements `AgentSessionDriver` on the Claude CLI without an
SDK dependency. A thread is one Claude session id; the first physical turn uses `--session-id`
and every later one, logical or continuation, uses `--resume`. Host tools reach the model
through a loopback MCP endpoint owned by the driver: `http://127.0.0.1:<port>/mcp/<thread>`,
bearer token per thread, `--mcp-config` plus `--strict-mcp-config`, and `--allowedTools`
naming only the registered `mcp__praxis__*` tools. Thread instructions are injected with
`--append-system-prompt` on the session-creating process. A coordinator thread keeps
`--restricted --tools Read,Glob,Grep`, so it cannot poll with a shell; a worker thread adds
Edit, Write and Bash with `acceptEdits`.

Customizations are disabled with `--restricted --setting-sources '' --strict-mcp-config`
rather than `--safe-mode`. Safe mode disables every customization _including MCP servers_, so
a safe-mode session cannot see the Host tools at all; a live smoke against Claude Code 2.1.258
had the model answer that its only tools were Glob, Grep and Read. The chosen combination was
verified to expose the Host tool while leaving a project `CLAUDE.md` unread.

Suspension differs from Codex in one way: the Claude CLI has no turn interrupt RPC. A
suspending tool result tells the model to end the turn with one short line; the driver waits
for the process to exit, then starts the continuation process with `--resume`. Stop kills the
process group. A second Host tool call while one suspension is pending is refused. Killing the
process mid-turn is avoided during suspension so the resumed transcript keeps its tool result.

Because ending the turn is the model's action rather than a Host RPC, the Host bounds it: a
suspension arms a grace deadline (`claudeSuspensionGraceMs`, 60 s by default). If the process
has not exited by then, the Host stops the process group and the logical turn fails with an
explicit message instead of waiting for the Action lease. Every Claude Host-tool call emits a
`Running tool: <name>` activity before validation, so rejected calls count against the
Coordinator tool cap exactly as they do on Codex. The logical turn result accumulates usage
across every physical turn, while each `turn-completed` event keeps its own process usage.

The Claude worker path in `startEventDrivenWorkerRun` now uses this driver for every
workspace-write Claude execution, with `run_job` and, when a Candidate can be published,
`publish_candidate`. Deterministic fixtures exercise the loopback endpoint end to end with a
fake `claude` binary.

One bounded live smoke against Claude Code 2.1.258 exercised the real Coordinator path: a
read-only thread received `coordinatorThreadInstructions`, called the Host `dispatch_worker`
tool rather than returning a decision as text, ended its physical turn inside the suspension
grace, was resumed on the same session id by a Worker settlement event and returned a terminal
result. Two physical turns, one Host tool call, about 6.6 s. The Worker path and a multi-round
Coordinator have not been exercised live.

## Push execution

The Codex driver uses the experimental App Server protocol with the current local Codex
login. `thread/start` registers one dynamic `run_job` tool. When Codex emits the
`item/tool/call` JSON-RPC request, Praxis starts the process, immediately acknowledges
the job identifier and interrupts that physical turn. The operating-system exit event then
starts a continuation turn in the same provider thread with structured job status. The
logical worker call remains pending until the continuation produces the final report. No
model polling or long-lived outer tool call is involved.

The dynamic tool must acknowledge startup immediately. Holding its response open until
process exit is insufficient because Codex invokes nested tools through an outer execution
cell; that cell yields after its own bounded wait and exposes a `wait` handle to the model.
Ending the physical turn removes that polling surface instead of merely reducing its
frequency.

The generic tool accepts a label, executable, argument vector, worktree-relative directory
and optional timeout. The Host validates that the resolved directory remains under the
Card root. Full command output stays in the Host log. Bounded output tails refresh the UI
without a model turn. The model receives status, exit code, timestamps and log reference.

The pilot removes provider API keys from the App Server environment so it uses the local
Codex login, fixes approval policy to never, and disables implicit multi-agent delegation.
It activates only after the existing permission catalog resolves the user's execution
choice to Full Access. This does not broaden a read-only or workspace-write Session.

## Provider capabilities

| Capability                | Codex App Server | Claude session driver           | Claude legacy |
| ------------------------- | ---------------- | ------------------------------- | ------------- |
| Persistent thread         | yes              | yes (`--session-id`/`--resume`) | no            |
| Push tool result          | yes              | yes (loopback MCP)              | no            |
| Resume turn/thread        | yes              | yes (new process)               | no            |
| Interrupt                 | yes              | kill only                       | yes           |
| Suspending Host tools     | yes              | yes, model ends the turn        | no            |
| Coordinator resume events | yes              | yes                             | no            |

These are adapter capabilities, not product switches. When Claude later gains an SDK or
protocol integration, it implements `AgentSessionDriver` and the same Host tool contract.
Card, Coordinator, checklist, job and UI code must not branch on Claude-specific APIs.

## Recovery

The initial App Server driver keeps the logical turn and pending continuation in memory.
Before activating the push driver outside the controlled Full Access pilot, add restart
recovery: persist provider thread, physical turn and job IDs beside the Host job, reconnect or
`thread/resume` after restart, and send a new recovery turn when the original pending RPC
connection cannot be restored. A recovered result must preserve the original job evidence
and cannot launch the command again automatically.

## Pilot acceptance

- A temporary coding task changes a file, calls `run_job`, ends its first physical turn,
  receives the exit result in a continuation turn and returns one logical final result.
- The provider Session contains one dynamic tool call, two physical turns and no
  model-mediated process polls.
- Logs, elapsed activity and Stop remain observable while the turn waits.
- The command is restricted to the Card worktree and a symlink/path escape is rejected.
- One cancellation test terminates the process group and returns a canceled tool result.
- Existing read-only and Codex workspace-write flows remain on the legacy transport.
- Broader activation remains blocked on restart recovery and provider permission parity.
- Coordinator suspension is covered by deterministic driver and runner fixtures: dispatch through
  the Host tool, `WORKER_COMPLETED` followed by one repair, `WORKER_FAILED` without repair,
  `WORKER_ATTENTION_REQUIRED` leading to needs-user, text-returned dispatch, stop during
  suspension, per-turn timeout and the Claude fallback. A real Coordinator thread against the
  Codex App Server has not been exercised yet; that live smoke is the next evidence step.
