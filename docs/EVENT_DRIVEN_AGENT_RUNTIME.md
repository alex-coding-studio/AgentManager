# Event-Driven Agent Runtime

Status: provider-neutral contract with a Codex App Server pilot for Full Access execution
workers. Read-only planning, ordinary workspace-write execution and Claude remain on the
legacy transport. No Claude SDK or background-job configuration is included.

## Responsibility boundary

AgentManager owns Card state, background processes, logs, cancellation and event routing.
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

## Push execution

The Codex driver uses the experimental App Server protocol with the current local Codex
login. `thread/start` registers one dynamic `run_job` tool. When Codex emits the
`item/tool/call` JSON-RPC request, AgentManager starts the process, immediately acknowledges
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

| Capability         | Codex App Server | Claude legacy |
| ------------------ | ---------------- | ------------- |
| Persistent thread  | yes              | no            |
| Push tool result   | yes              | no            |
| Resume turn/thread | yes              | no            |
| Interrupt          | yes              | yes           |

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
- Existing read-only, workspace-write and Claude flows remain on the legacy transport.
- Broader activation remains blocked on restart recovery and provider permission parity.
