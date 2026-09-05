# Execution Observability, Response, Logging, and Recovery

Status: Ready for implementation

## Task Summary

Praxis currently presents Agent state, running activity, results, errors, logs, and recovery actions through several unrelated controls. The same Run can show different phases in the Sticky Header, Round history, and lower-right running card. Logs are difficult to discover, some links expose JSON instead of a readable record, and internal parser or validation messages can become the only visible explanation.

Implement one lifecycle and logging model with two output presentations:

- Graph and Flow modules use one collapsible Latest Response card in the upper-left corner.
- Development Execution uses the Sticky Header as its response and running surface.
- The lower-right Composer remains the only user-input surface.
- Every Run and every meaningful standalone Host operation receives a browser-readable, human-readable `.log`.

Deliver the implementation as an ordered series of pull requests, each of which leaves the product self-consistent after merge:

1. Shared core: status classification, Run Log, Latest Response store, Active Run ownership, Host operation logs. No caller changes.
2. Global Log Viewer: log routes, incremental API, and adapters for existing records.
3. Graph and Flow modules: service lifecycle and the upper-left Latest Response presentation together.
4. Development Execution: Card ownership, cancellation, summaries, and the Sticky Header presentation together.

Within one pull request, do not split status, logging, response presentation, and recovery into independent product changes that leave the lifecycle partially connected.

## Goals

- Make the current state understandable without opening another chat.
- Make every running or terminal operation traceable through one Log button.
- Keep Agent, Coordinator, Worker, Host, and Host Job activity distinguishable.
- Replace generic or internal error text with a short title and useful detail.
- State exactly what user input is required when a Run needs information.
- Keep cancellation, retry, result re-read, continued modification, Undo, and acceptance behavior distinct.
- Preserve user control over the two collapsible corner surfaces.
- Support independent Development Execution Cards running concurrently.

## Non-Goals

- Do not expose private Agent reasoning.
- Do not display the full Log inline inside Latest Response or the Sticky Header.
- Do not make JSON the default user-facing Log format.
- Do not add a fifth terminal response color for cancellation, pending work, acceptance, or non-blocking findings.
- Do not make Latest Response the source of truth for Product Context, Domain Model, Delivery Contracts, code, or accepted Action output.
- Do not start an Agent only to paraphrase a deterministic Host event.
- Do not add cloud collaboration, remote log upload, or Git-tracked execution logs.

## Core Model

Praxis separates three concepts:

1. Active Run: temporary execution state from successful start through terminal settlement.
2. Latest Response: the one current response owned by a module or Development Execution Card.
3. Run Log: an immutable identity and append-only record for one Run.

An Active Run and Latest Response always refer to the same current Run. Starting a new Run replaces the visible previous terminal response with the new blue Running presentation. The previous response document is not retained, while its Run Log remains available through history.

## Ownership and Concurrency

### Graph and Flow Modules

Each Project and user-visible Graph or Flow module owns:

- At most one Active Run
- At most one Latest Response document

Applicable modules initially include:

- Product Exploration and Design
- Scope Decomposition
- Domain Modeling
- Delivery Planning

Product Discovery and Product Design are two Layers inside one Product Exploration and Design module. They share one Active Run lock and one Latest Response. If Discovery is running, Product Design cannot start. If Product Design is running, Discovery cannot start. The response subject records which Layer produced the response, but a Layer does not own a second response.

### Development Execution

Development Execution uses Card ownership:

- Each Card owns at most one Active Action Run.
- Each Card owns at most one Latest Response document.
- Different Cards may run concurrently.
- Cards in the same Project may run concurrently when their worktrees and dependencies are independent.
- Cards in different Projects never block one another merely because they use Development Execution.
- A Card allows only one current Action Run at a time.

Selecting another Card changes the Sticky Header to the selected Card. It does not stop background work. A background-running Card keeps a blue running marker on the Card and in the Card list.

Shared external resources may use narrower locks. Examples include GitHub account switching, one simulator device, or another process-global tool. A narrow resource lock must not become a Project-wide or module-wide execution lock.

### Required Implementation Change

Development Execution currently keys active work by Project root. Replace that ownership lookup with Card identity. Cancellation, refresh, liveness, progress, and settlement must all resolve the same Card-owned Active Run.

## Lifecycle

### Initial Waiting

Before the first Run:

- No Latest Response document exists.
- Graph and Flow modules show no upper-left Response card.
- Development Execution shows the selected Action and an empty/default status area.
- The lower-right Composer is available.

Waiting is the only state with no response.

### Transactional Start

Praxis changes the current response to Running only after all of these succeed:

- User input validation
- Owner revision validation
- Run identity creation
- Run Log creation
- Active Run reservation

If any preflight validation fails before this boundary, keep the previous Latest Response visible and show the validation error next to the Composer. Do not create a failed Run or erase a useful response for malformed input that never started.

After the boundary succeeds:

- Create a new Run Log.
- Replace Latest Response with the blue Running presentation.
- Collapse the lower-right Composer to the non-interactive blue running point.
- Begin recording phase and role activity.

### Running

Running is a transient mode, not one of the four response results.

`Running`, `In progress`, `运行中`, and `正在进行` are synonyms for the same blue state. Modules may use the phrase that reads naturally without changing the underlying state or color.

Running phases provide detail:

| Phase        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| Coordinating | Coordinator is preparing or qualifying work                          |
| Executing    | Worker or Agent is reading, reasoning, or editing                    |
| Verifying    | A required test, build, lint, or validation is running               |
| Publishing   | Git or pull request delivery is running                              |
| Finalizing   | Host or Coordinator is preparing the terminal response               |
| Stopping     | Host has received cancellation and is terminating the active process |

The current role is separate from the phase:

- `COORDINATOR · preparing the Worker assignment`
- `WORKER · reading CheckMe Design System files`
- `JOB · running LocusKit unit tests`
- `HOST · verifying pull request HEAD`

Long periods without new activity are valid. While the Run owner and process remain valid:

- Keep Running blue.
- Continue showing total elapsed time.
- Keep the Log button available.
- Do not create a Warning solely because the Agent has not emitted a recent Tool Call.

Only confirmed process or ownership loss closes the Run as Fail.

### Terminal Response

Running transitions to exactly one terminal response category:

- Completed
- Warning
- Fail

The terminal response atomically replaces the Running response and remains visible until the user successfully starts another Run.

Editing possible follow-up input, opening Log, refreshing the page, switching canvas selection, or collapsing a surface does not clear the terminal response.

### Starting the Next Run

When the user starts the next Run:

- Create a new Run identity and distinct Log.
- Replace the visible terminal response with the new blue Running response.
- Do not preserve a separate historical Response document.
- Keep the previous Run Log in history.

A continuation may reuse an Agent Session, but it never reuses or overwrites the previous Run Log.

## Four Response Statuses

Every non-running response uses exactly four statuses.

| Status    | UI behavior                                                                                                                | Tone  |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | ----- |
| Waiting   | Default before the first Run; no Response card or document                                                                 | None  |
| Completed | A reliable result exists and every required condition owned by the Run passed                                              | Green |
| Warning   | A reliable response exists but user input, recoverable blocking, cancellation, pending work, or material attention remains | Amber |
| Fail      | No reliable deliverable exists because execution or a required condition clearly failed                                    | Red   |

### Deterministic Classification

Host owns the status category. It derives the result from existing structured facts:

- Run state
- Agent or Worker outcome
- Coordinator decision
- Required-check assessment
- Cancellation and termination result
- Timeout
- Parsing and schema validation
- Persistence and response publication
- Host verification

Coordinator, Worker, and module Agent wording cannot choose the color category.

Use this mapping:

| Condition                                                                     | Response status                               |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| All required conditions passed                                                | Completed                                     |
| All required conditions passed and additional non-blocking findings remain    | Completed with visible supplementary warnings |
| Clarification or specific user information is required                        | Warning                                       |
| Recoverable blocking condition with a reliable response                       | Warning                                       |
| User cancellation completed and retained effects are known                    | Warning with title `Canceled`                 |
| External delivery action is pending but the Run has a reliable response       | Warning                                       |
| Partial result is safely preserved and can be continued                       | Warning                                       |
| Required test, build, lint, or other required check failed                    | Fail                                          |
| Agent transport, parsing, schema, persistence, or response publication failed | Fail                                          |
| Process or Active Run ownership was lost                                      | Fail                                          |
| Host could not confirm process termination                                    | Fail                                          |
| No reliable result exists                                                     | Fail                                          |

`Need more info`, `Pending`, `Canceled`, and recoverable blocking conditions are dynamic titles inside Warning. They do not create more colors.

Additional non-blocking findings do not turn a Completed response amber. Show their count and details inside the green response.

User acceptance does not create a fifth status. Accepted output remains Completed; the title or supporting metadata may change to `Accepted`.

## Single Latest Response Document

Latest Response ownership follows the interaction boundary:

- Graph and Flow: one document per Project and module
- Development Execution: one document per Card

Logical locations:

```text
<planning-root>/<module>/latest-response.md
<planning-root>/implementation/cards/<card-id>/latest-response.md
```

Each owner has at most one file. Praxis does not keep `response-1.md`, `response-2.md`, or another response history.

### Response Document Content

The response document is human-readable Markdown generated by Host. It contains:

```markdown
# <Title>

Status: <Running | Completed | Warning | Fail>
Run: <run-id>
Subject: <layer, Node, entity, Contract, Card, or Action>
Updated: <ISO-8601 timestamp>
Log: <relative Run Log reference>

<Short detail>
```

The document is a durable UI summary. Typed state remains in the module or Card planning record for validation and rendering. The Markdown document is not parsed to recover machine state.

### Atomic Publication

- Write through the planning store's existing revision and commit boundary.
- Write the complete response to a temporary file.
- Atomically rename it into the single Latest Response location.
- Verify owner identity and revision before publication.
- Never expose a partially written document.

Every write verifies:

- Graph and Flow: Project, module, `runId`, and revision
- Development Execution: Project, Card, Action, `runId`, and revision

Canceled, timed-out, superseded, or earlier Agent output cannot overwrite a newer response.

If the Latest Response file is missing or unreadable after a Run exists, reconstruct an explicit Fail presentation from the current Run Log. Do not pretend the module has never run.

## Summary Ownership

Summary ownership depends on how much judgment is required.

### Host-Owned Summary

Host writes the summary when the cause and retained effects are deterministic:

- User cancellation
- Confirmed process interruption
- Timeout
- Parser or schema failure
- Persistence failure
- Lost process or Active Run ownership
- Failed response publication

Host does not start an Agent only to restate these facts.

### Worker or Module Agent Summary

Use an existing Agent response directly when it already provides a clear, evidence-grounded explanation of its own result.

### Coordinator-Owned Summary

Development Execution uses Coordinator to explain ambiguous semantic Warning or Fail outcomes after Worker settlement. Coordinator receives bounded response, error, required-check, retained-effect, and Log context. It does not reopen implementation or run broad investigation merely to write UI copy.

Coordinator supplies only:

1. Title
2. Short detail
3. Existing Log reference

This is a minimal display contract, not a large error ontology.

### Required Dynamic Detail

Warning and Fail titles and details are generated from the actual response and evidence. Module wording may differ, but equivalent outcomes should remain recognizable.

When user input is required, the detail must say exactly what is missing. These are invalid:

```text
Need more info.
Additional information is required.
The request is pending.
An invalidation object was returned.
```

A valid Warning is concrete:

```text
Title: Deployment target needs confirmation
Detail: project.yml declares iOS 26.0 while the supplied configuration declares iOS 26.1. Choose which deployment target should be authoritative.
Log: Open Run Log
```

A valid Fail is concrete:

```text
Title: LocusKit unit tests failed
Detail: Swift 6 rejected the new static token storage as non-Sendable. Current files and PR were preserved.
Log: Open Run Log
```

If Coordinator cannot produce a reliable explanation, Host uses this fallback:

```text
Title: Execution failed
Detail: Praxis preserved the original error and current effects but could not produce a reliable summary.
Log: Open Run Log
```

Original errors remain in Log and cannot be overwritten by a summary.

## Cancellation

Cancellation is Host-owned.

1. User clicks Cancel.
2. Host records the cancellation request.
3. Running changes to blue `Stopping`.
4. Host interrupts the active Coordinator, Worker, or module Agent.
5. Host waits for bounded process termination.
6. Host records retained files, checks, commits, checkpoints, and pull requests.
7. Host appends the terminal cancellation event to the Run Log.
8. Host atomically publishes a Warning response titled `Canceled`.

Example:

```text
Title: Canceled
Detail: You canceled this Run during Worker execution. Three modified files and PR #2 were preserved; unit tests had not started.
Log: Open Run Log
```

Late Agent output is rejected by Run identity. It cannot replace the cancellation response.

If termination cannot be confirmed within the bounded period, publish Fail instead:

```text
Title: Execution could not be stopped
Detail: Praxis sent cancellation but could not confirm that the Worker exited. Inspect the Run Log and workspace before continuing.
Log: Open Run Log
```

## Global Log Capability

Log is a global Praxis capability, not an error-only control and not a module-specific modal.

Every Run receives a Log identity at transactional start. Log remains available for Running, Completed, Warning, Fail, and cancellation.

Meaningful standalone Host operations also receive an Operation Log when they mutate state, take meaningful time, or can fail in a way that needs diagnosis.

Examples:

- Sync Up
- Worktree creation
- Undo
- Re-read result
- Acceptance persistence
- Git checkpointing
- Pull request publication or refresh

A Host operation inside a Run appends to that Run Log. A standalone Host operation receives its own Operation Log without generating a fake Agent response. Simple reads do not create logs.

## User-Facing `.log` Format

The user-facing log is UTF-8, append-only, line-oriented text with a `.log` extension. It is not Apple's binary `.logarchive` format.

Each line uses:

```text
<sequence> <ISO-8601 timestamp> <level> <actor> <phase> <event> — <message>
```

Fields:

- `sequence`: monotonically increasing within the Log
- `timestamp`: UTC with milliseconds
- `level`: `INFO`, `WARN`, or `ERROR`
- `actor`: `HOST`, `AGENT`, `COORDINATOR`, `WORKER`, or `JOB`
- `phase`: `RUN`, `PREPARE`, `EXECUTE`, `VERIFY`, `PUBLISH`, `FINALIZE`, `STOP`, or `RECOVERY`
- `event`: stable event identifier
- `message`: readable single-line message

Embedded newlines are indented as continuation lines so one event cannot masquerade as several entries.

Example:

```log
000001 2026-09-04T23:23:05.596Z INFO HOST RUN run.started — Action 1/2 started with Codex Luna xhigh
000002 2026-09-04T23:23:06.128Z INFO COORDINATOR PREPARE assignment.started — Preparing the Worker assignment
000003 2026-09-04T23:24:01.442Z INFO WORKER EXECUTE reference.opened — Read CheckMe/CheckMe/DesignSystem/AppColor.swift
000004 2026-09-04T23:26:42.811Z INFO JOB VERIFY job.started — LocusKit unit tests
000005 2026-09-04T23:26:45.317Z ERROR JOB VERIFY job.finished — LocusKit unit tests exited 1; job log job-300a7b4b
000006 2026-09-04T23:26:46.004Z INFO COORDINATOR FINALIZE response.summarized — LocusKit unit tests failed; implementation files and PR were preserved
000007 2026-09-04T23:26:46.117Z ERROR HOST RUN run.failed — Fail response published
```

The primary Run Log records lifecycle and readable activity. Large command stdout and stderr remain in the Host Job's existing `output.log`; the Run Log records and links that Job Log.

Internal JSON may remain for typed persistence and validation. Users never need to open it to understand a Run.

### Actor Separation

Every visible event names its actor:

- Host lifecycle and state transitions use `HOST`.
- Single-Agent Graph or Flow work uses `AGENT`.
- Development Execution assignment and qualification use `COORDINATOR`.
- Development Execution implementation uses `WORKER`.
- Host-managed commands use `JOB`.

Do not merge all activity under a generic Agent label.

### Log Safety

- Logs stay in the local planning store and are never added to Git.
- Logs exclude private reasoning.
- Reuse the existing deterministic masking already applied to public Agent activity and coordination records.
- Do not add another Agent call or asynchronous post-processing pass for redaction.
- Preserve useful file paths, commands, compiler diagnostics, and code context.
- Keep raw Host Job output behavior unchanged in the first implementation unless an existing redaction path already covers it.
- Log routes remain inside the current Praxis host and origin access boundary.

### Retention

- Keep one Run Log per retained Run.
- Keep one Operation Log per retained standalone Host operation.
- Deleting a Run, Card, module history, or Project removes its owned logs through the same existing deletion boundary.
- Do not add automatic time-based log deletion in the first implementation.
- Do not retain historical Latest Response documents.

## Global Log Viewer

Every output surface exposes one `Log` button. The button opens a browser page instead of expanding full output inline.

URL shapes:

```text
/projects/<project-id>/logs/<module>/<run-id>
/projects/<project-id>/logs/implementation/<card-id>/<run-id>
/projects/<project-id>/logs/host/<operation-id>
```

The URL uses the origin through which the user opened Praxis. A user on a LAN URL receives a LAN URL that can be pasted to another local Agent.

The Log Viewer displays:

- Project
- Module or Card
- Subject
- Run or operation ID
- Status
- Agent profile when applicable
- Start and end time
- Elapsed or final duration
- Chronological `.log` text
- Links to Host Job output logs
- Final title and detail
- Retained files, commits, checkpoints, and pull requests when applicable
- Copy Link action

The viewer follows a running Log by requesting only appended content. It does not download the whole growing file on every poll.

The default view is the readable `.log`. Do not add a raw JSON tab as a required user workflow.

## Presentation 1: Graph and Flow Latest Response

Place Latest Response in the upper-left corner of the canvas.

### Before First Run

- Do not render the card.
- Show the lower-right Composer.

### Running

The card shows:

- Blue Running status
- Current phase
- Current actor
- Elapsed time
- The latest three readable Log activities
- Log button
- Cancel when supported

Starting a Run replaces the previous visible response with this Running card.

### Terminal

The card shows:

- Completed, Warning, or Fail status
- Dynamic title
- Short detail
- Relevant subject or Layer
- Non-blocking warning count when Completed
- Log button
- Only the recovery action valid for that response

### Collapse

The user may collapse Latest Response independently from the Composer.

Collapsed presentation:

- Blue pulsing control: Running
- Green control: Completed
- Amber control: Warning
- Red control: Fail

Color is accompanied by icon and accessible text.

Status updates do not force open a card the user collapsed. Clicking the collapsed control expands it. Its preference persists across polling and ordinary refreshes for that Project and module.

## Presentation 2: Development Execution Sticky Header

Development Execution does not render an upper-left Latest Response card. The selected Card's Sticky Header owns running and response presentation.

Remove `Plan confirmed`. Entering Development Execution already proves that the Plan was confirmed.

### Left Side

Display:

- `Action <current>/<total>`
- Current Action title
- Running, Completed, Warning, or Fail
- Current actor and phase while running
- Elapsed or final duration
- One latest readable activity line while running
- Terminal title and short detail after settlement
- Required-check progress
- Non-blocking warning count
- Pull request link and live state when present
- Log button

Pull request state belongs on the left because it describes delivery output, not a command.

### Right Side

Display:

- Coordinator profile selector when editable
- Cancel while running
- State-specific recovery action
- Undo when available
- Pass when user acceptance is available

### Geometry

- Rounded while fully visible in normal document flow
- Flush to the top, without top corners or top gap, only while stuck
- Keep the accepted two-row structure when content requires it
- Keep right controls aligned to the same outer edge

### Background Cards

When another Card is selected while this Card runs:

- The running Card continues.
- Its Card and Card-list entry show the blue running marker.
- Selecting it again restores its Sticky Header and current Run state.

## Lower-Right Composer

The lower-right corner always belongs to user input.

### Waiting or Terminal

- Composer is available for initial input, clarification, modification, or continued work.
- User may collapse it manually.
- Persist the user's expansion preference through ordinary polling and refreshes.

### Running

- Automatically replace Composer with a pulsing blue point.
- The point is a status indicator, not a disclosure control.
- Clicking it while Running does nothing.
- Do not duplicate role, elapsed time, or Log activity in the lower-right corner.

### After Settlement

- Restore the user's previous Composer preference.
- If the user kept it expanded, restore the full input card.
- If the user manually collapsed it, show the clickable collapsed input control.
- Keep response content in Latest Response or Sticky Header.

## Recovery Actions

Do not use one generic Retry or Repair action.

| Response                                           | Actions                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Completed                                          | Log; continue through Composer; Pass when applicable                         |
| Completed with additional non-blockers             | Log; inspect warnings; continue; Pass when applicable                        |
| Warning: specific information required             | Log; answer through Composer                                                 |
| Warning: canceled                                  | Log; continue through Composer; Undo when available                          |
| Warning: recoverable external pending state        | Log; refresh the named external state                                        |
| Warning: partial result preserved                  | Log; continue through Composer; Undo when available                          |
| Fail: saved result could not be parsed or verified | Log; Re-read result; Undo when available                                     |
| Fail: required check failed                        | Log; continue with a changed implementation instruction; Undo when available |
| Fail: process or Host ownership lost               | Log; start a new Run after workspace inspection                              |
| Fail: termination unconfirmed                      | Log; inspect workspace; do not automatically rerun                           |

### Re-read Result

Re-read result is Host-only:

- Do not start Agent.
- Parse and verify the already saved result.
- Append recovery events to the same Run Log.
- If evidence is now valid, atomically replace Fail or Warning with Completed for that same Run.
- Do not create another Run or historical Response file.

### Continue Through Composer

Continued work creates a new Run and new Log. It may reuse an Agent Session when the current resume rules allow it.

### Undo

Undo restores the Card or Action baseline through the existing Host boundary. It creates or appends the appropriate Host operation Log and reports exactly what was restored and what external effects remain.

## Refresh and Recovery

- Refresh preserves selected Project, module, Card, Action, and Run.
- Polling reloads current Active Run state and appended Log activity.
- User collapse preferences are not reset by polling.
- A server restart reconnects to a live owned process when possible.
- A missing process or lost owner becomes Fail with the existing Log.
- A stale Running state is never left indefinitely after Host confirms loss.
- Partial files, commits, checkpoints, and pull requests remain visible.
- Dynamic pull request state refreshes independently from the response document.
- Late results cannot overwrite a newer Run.

## Compatibility and Migration

Existing stored Runs use several forms:

- Activity arrays in Run JSON
- Execution `activity.json`
- Coordination JSON and recorded request/response files
- Module response and summary Markdown
- Host Job `output.log`

Support them without a destructive bulk migration:

1. New Runs write the new `.log` and one Latest Response document.
2. The Log Viewer adapts existing activity arrays and execution records into the readable line format on read.
3. If Latest Response is absent but historical terminal Runs exist, derive the initial current response from the newest applicable terminal Run without creating multiple response files.
4. Preserve existing Run IDs, Agent Session IDs, Card history, PR references, and acceptance records.
5. Do not rewrite historical job output.

## Implementation Anchors

The implementing Agent should inspect these current locations before editing:

- `components/latest-response.tsx`
- `lib/latest-response.ts`
- `components/agent-graph-running-card.tsx`
- `components/agent-graph-composer-card.tsx`
- `components/whats-next-workspace.tsx`
- `components/task-decomposition-workspace.tsx`
- `components/domain-model-workspace.tsx`
- `components/what-to-do-workspace.tsx`
- `components/just-do-it-live-workspace.tsx`
- `components/just-do-it-action.tsx`
- `lib/modules/implementation/execution-types.ts`
- `lib/modules/implementation/execution-service.ts`
- `lib/modules/implementation/coordination.ts`
- `lib/modules/implementation/coordination-runner.ts`
- `app/api/projects/[projectId]/execution-log/route.ts`
- Graph and Flow Run services under `lib/modules/*/runs.ts`
- Existing Host Job records under `lib/agents/host-job-broker.ts`
- `lib/ui-language.ts`

Do not assume current component placement or status mapping is correct merely because a shared component already exists.

## Recommended Implementation Sequence

Implement in the pull request order above and keep the internal work ordered:

1. Add shared status classification, response ownership, and Log event types.
2. Add append-only `.log` writing and global Log Viewer routing.
3. Add one Latest Response document per owner with atomic publication and compatibility fallback.
4. Update Graph and Flow modules to use upper-left Latest Response for Running and terminal output.
5. Update Development Execution Sticky Header and remove redundant `Plan confirmed` and expanded lower-right running details.
6. Make the lower-right Composer auto-collapse to a non-interactive blue point while Running.
7. Connect deterministic Host summaries, Coordinator semantic summaries, and recovery actions.
8. Move Development Execution Active Run ownership from Project root to Card identity.
9. Add compatibility adapters for existing Run records.
10. Validate all states in the real UI before opening the pull request.

## Acceptance Criteria

### Status and Lifecycle

- Before the first Run, no Latest Response is displayed.
- Starting a Run requires successful Log creation and Active Run reservation before the UI changes.
- Running is blue in every module and displays elapsed time and Log.
- Running phase and actor are current and do not disagree across surfaces.
- Completed is green, Warning is amber, and Fail is red.
- Non-blocking findings do not change Completed to Warning.
- New Run start replaces the previous visible response with Running.
- Terminal response remains until another Run successfully starts.

### Response Ownership

- Product Discovery and Product Design share one response and one Active Run lock.
- Starting one Layer while the other runs is rejected without replacing the current response.
- Scope Decomposition, Domain Modeling, and Delivery Planning each have one response per Project and module.
- Development Execution has one response and one Active Run per Card.
- Two independent Cards can run concurrently.
- Late or canceled output cannot overwrite a newer response.
- Only one Latest Response document exists per owner.

### Graph and Flow UI

- Running and terminal output use the upper-left Latest Response card.
- No expanded running card appears in the lower-right corner.
- Latest Response can be manually collapsed and expanded.
- Collapsed status uses color, icon, and accessible text.
- Polling does not reset the user's collapse preference.
- The expanded Running card shows the latest three readable activities and Log.

### Development Execution UI

- Sticky Header shows the selected Action rather than `Plan confirmed`.
- Sticky Header shows current status, actor, phase, duration, one latest activity line, checks, PR, and Log.
- PR appears with output status on the left.
- Coordinator profile and state-specific actions remain on the right.
- Sticky geometry preserves normal rounded and stuck flush-top states.
- Background-running Cards remain visible and selectable.

### Composer

- Composer remains the only user-input surface.
- User can manually collapse it when input is available.
- Running automatically replaces it with a blue point.
- The blue running point cannot expand.
- Terminal settlement restores the user's previous expansion preference.

### Logging

- Every Run has a distinct `.log` from start.
- Every Log line has sequence, timestamp, level, actor, phase, event, and message.
- Host, Agent, Coordinator, Worker, and Job entries remain distinguishable.
- Long command output stays in linked Host Job `.log` files.
- Log button is present for Running, Completed, Warning, Fail, and canceled output.
- Log opens a browser page, not inline JSON.
- Log Viewer follows appended activity without reloading the whole file.
- Copy Link produces a URL for the exact Log through the user's current origin.
- Logs exclude private reasoning and are not tracked by Git.

### Error and Warning Summaries

- Need-more-info Warning names the exact missing information or decision.
- Fail never shows an internal object or parser phrase as its only explanation.
- Original errors remain available through Log.
- Deterministic Host events do not trigger a summary Agent.
- Coordinator supplies title and detail only when semantic interpretation is needed.
- Coordinator failure falls back to an honest Host summary and existing Log.

### Cancellation and Recovery

- Cancel immediately enters blue Stopping.
- Host confirms termination before publishing Warning Canceled.
- Canceled response states the interrupted phase and retained effects.
- Unconfirmed termination becomes Fail.
- Re-read result does not start Agent or create another Run.
- Continue creates a new Run and Log.
- Recovery controls expose their actual effect and only appear when valid.

### Refresh and Compatibility

- Refresh keeps current selection and response state.
- Live Run state reconnects after page refresh.
- Lost process ownership closes as Fail rather than remaining blue indefinitely.
- Existing Run history remains readable in the new Log Viewer.
- Existing PR, checkpoint, acceptance, and Agent Session references remain intact.

## Required Validation

The implementation must run the repository's normal formatting, lint, typecheck, test, and build entry points.

Add focused tests for:

- Four-status classification
- Non-blocker preservation under Completed
- Transactional Run start and failed Log creation
- One Latest Response per owner
- Discovery and Product Design mutual exclusion
- Card-scoped concurrent Development Execution Runs
- Late result rejection
- Cancellation and unconfirmed termination
- Human-readable Log rendering and actor separation
- Legacy Run adaptation
- Composer and Latest Response collapse behavior
- Sticky Header state content and PR placement

Do not add mutation tests or duplicate tests that only mirror implementation.

## Review Packet

The final independent Reviewer should receive:

- This document
- Exact implementation head
- Changed-file list
- Required validation results
- Screenshots of Graph/Flow Waiting, Running, Completed, Warning, and Fail
- Screenshots of Development Execution Running, Completed, Warning, and Fail
- A browser-opened Run Log showing Host, Coordinator, Worker, and Job entries
- Evidence that two independent Cards can run concurrently
- Evidence that Discovery and Product Design cannot run concurrently
- Evidence that cancel and late completion cannot overwrite the current response

The Reviewer should report blockers against this document and avoid reopening settled product decisions.
