# Live Just Do It planning

## Entry and scope

Open `/projects/<projectId>/implementation`, add a formal Node from What's Next
or Break It Down, provide requirements/resources and choose a local Agent profile.
The ordinary route now supports persistent import, generation, whole-plan and
single-step adjustment, cancel/retry, Finalize and reopening before execution.
`?preview=just-do-it` retains the separate frozen, in-memory demonstration.

Finalize copies the exact displayed contracts into ready Actions. There is no
Action execution, PR/Issue creation, merge, completion propagation or rollback
endpoint. Reopening is available because this slice cannot produce Action output.
The preview's simulation controls are never mounted on the live route.

## Runtime and context

The existing local transport launches fresh Codex or Claude sessions. Codex uses
`exec` with read-only sandbox and ignored user configuration/rules. Claude uses
safe/restricted mode with only Read/Glob/Grep. Model and effort are explicit CLI
arguments; blank values leave the controlled CLI defaults, not a fictional model
catalog. Unsupported selections fail rather than silently fall back. Requested
profile, Session ID and reported usage are recorded; account capability discovery
and resolved-model aliases are not implemented.

The installed CLI help was checked for these options. See the official
[Codex non-interactive permissions](https://learn.chatgpt.com/docs/non-interactive-mode).
No API-key integration or writable execution sandbox is introduced. Claude's
real provider path has not been smoke-tested in this delivery.

Every request receives the retained source, current Plan and Card handoff with
references, independent of previous provider memory. Session reuse is deferred.
Project-wide instructions can be edited on the dashboard; they are stored in
`.agent-manager/implementation/instructions.md` and snapshotted per run. Editing
them does not alter an active run. Automatic local Skill discovery/loading is
still deferred and instructions cannot expand runtime permissions.

Source enumeration is read-only and does not invoke graph identity migration.
Both existing `accepted` Nodes and `formal` Nodes qualify; Start nodes and
Candidates do not. One Card uses the source UUID, so re-import is idempotent.
The source's own output.md is preferred over inherited outputs. It is copied
on import; deleting the original source does not delete the Card or its context.

Selected Context Library documents and local text/Markdown uploads are bounded
snapshots: five resources, 256 KB each and 1 MB combined. Real-path checks keep
library/source reads within the registered planning root. Agents read relevant
files and handoff references rather than receiving every document body inline.

## Storage, races and recovery

`.agent-manager/implementation/cards/<UUID>/` holds immutable worklog revisions.
Each publishes `planning-state.json` atomically with its event, handoff and
reference documents, plus new request/resource/result files when relevant.
Providers start only after their input files exist. This is not a separate
database, mutable state file or product-wide Git migration. Old snapshots are
internal recovery evidence, not a Plan history interface; retention is deferred.

Mutations carry an expected revision. Active reservations and revision conflicts
prevent competing starts or late responses from overwriting newer state. Cancel
records its terminal status before stopping the runner. A ten-minute timeout
ends the attempt without automatic retry. Missing runners after interruption
become failed attempts; input and previous Plan are retained.

Use one local server. A process-owner check avoids treating another live server's
run as dead, but distributed hosting, PID reuse and orphan-child cleanup across
host crashes are not supported. Corrupt worklogs fail closed. The worklog's
previous power-loss durability and local-owner trust limits still apply.

## Scoped response revision 2

A live trial showed that requesting a full Plan for one step caused incidental
Overview changes. Revision 2 returns only `step` for scoped requests. The host
validates its UUID, inserts it at the original position and retains the Overview
and siblings from the current snapshot. Shared requirements/resources cannot be
changed through a scoped request. Whole-plan requests still return Overview and
steps. The detail pane shows scoped loading; other steps remain browsable.

Failed validation retains the old Plan and records the failure and usage, without
claiming the requested adjustment was applied. Current Finalize requires a
successful latest response. Retry is explicit. No raw response/history panel is
added to the UI.

## Verification

Run `npm run test:implementation-planning` for controlled-transport and isolated
filesystem tests, and `npm run test:implementation-harness` for schema/scope rules.
Tests cover reload, exact finalization, reopening, failure, timeout, cancellation,
late results, races, scoped patches, resource/instruction snapshots and CLI flags.
They are not model-quality evaluations.

See [live smoke evidence](../reports/just-do-it-harness/live-planning-smoke.md).
The user's real Plan remains unconfirmed. Finalize/reopen is tested on isolated
fixtures, not by accepting work on the user's behalf.
