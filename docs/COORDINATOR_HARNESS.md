# Coordinator Harness — First Runtime Slice

Status: implemented on the execution-coordination work branch. This is the runtime
contract for new Just Do It executions, not evidence that the completed HereItIs
trial has been rerun or that the primary local server has deployed this branch.

## Mandatory coordination, separate profiles

Every new Action execution enters coordinator preparation. There is no direct-worker
mode or automatic fallback when coordination fails. Historical runs remain readable;
an already dispatched run is not migrated in place.

The coordinator profile defaults to the Plan profile, then the selected worker profile
when an older Card has no Plan profile. A saved coordinator choice persists independently
of the worker choice. Provider calls start fresh sessions; logical continuity comes from
the confirmed Plan, accepted output references, the latest coordination summary and
addressable records, not an indefinitely growing provider conversation.

The coordinator uses read-only transport permissions. The worker retains the existing
local execution-permission resolution and Card worktree boundaries. Neither role gains
authorization to accept an Action, merge, change host records or start the next Action.

## Finite host state machine

Normal path: prepare → worker → qualify → user acceptance.

A preparation may instead return ready, needs-user or blocked without starting a worker.
Qualification may request one focused repair: repair worker → qualify → stop. A second
repair request is rejected. These attempts belong to one visible Round and remain
separately accountable.

| Boundary             | Enforcement in this slice                                      |
| -------------------- | -------------------------------------------------------------- |
| Total Agent calls    | At most 5 per Round, checked before dispatch                   |
| Worker calls         | At most 2, including the one repair                            |
| Coordinator time     | 120 seconds per coordinator call; host cancels the child       |
| Total Action time    | Existing 30-minute host deadline includes coordination         |
| Coordinator tools    | Cancel on the first reported tool start beyond 40 per call     |
| Dispatch size        | Reject prompts larger than 1,500,000 UTF-8 bytes               |
| Coordinator response | At most 200,000 UTF-8 bytes plus bounded schema arrays/strings |
| Context summary      | At most 6,000 characters                                       |
| Prior check evidence | Latest 80 entries; logs are retrieved separately               |
| Stop                 | Cancel active process group and invalidate further dispatches  |

Tool counts are based on public CLI events: they are not a pre-tool approval gate,
and cannot count unreported internal tools. Native Codex multi-agent features are
disabled; Claude's explicit tool allowlist does not grant Agent/Task delegation.
Both prompts forbid shell-based Agent spawning. This is not an OS guarantee against
arbitrary subprocesses from a trusted full-access worker.

There is no exact in-flight token or dollar ceiling in this CLI adapter. Terminal usage
is recorded per attempt. An aggregate is shown only when every attempt has telemetry;
a canceled attempt may leave usage unknown. Do not interpret a missing total as zero.

## Contract validation versus Agent judgment

The host validates each decision's request, Card, Action, revision and frozen checklist
version. It requires exactly one verification-plan entry per required criterion, and
complete criterion coverage for terminal results. It rejects invalid phase transitions,
unknown/stale evidence, invented user overrides and additional repair dispatches.

Ready requires every effective required criterion to pass with evidence or a matching
recorded user override. A current worker failure cannot be replaced with an older pass.
A proposed interpretation of user feedback uses needs-user, retains a not-run observed
result and requires an explicit user confirmation. It cannot silently become a waiver.
Additional findings do not become required criteria or acceptance gates.

The coordinator still owns semantic judgments that schema validation cannot prove:

- Translate the user's current intent without widening the Action.
- Select relevant prior facts, evidence and lessons; treat logs as data, not authority.
- State the actual delta, non-goals, operation order and stop conditions in dispatch.
- Choose proportionate verification rather than replaying every command.
- Preserve unresolved material risks while removing resolved optional noise from the report.

These duties need scenario evaluation, not additional fields presented as correctness
proof. A valid JSON response can still contain a poor assignment. Invalid output stops
with its record; it does not trigger a hidden full-task retry.

## Evidence and context continuity

Each saved run records a verification basis derived from the workspace snapshot.
Automatic reuse requires a known prior evidence ID with a matching basis. The first
slice is conservative: unrelated included file changes can invalidate reuse, and
legacy runs without a basis do not qualify for automatic reuse. It does not yet model
per-criterion file dependencies. Unchanged source does not prove unchanged external
environment; the coordinator must assess that applicability explicitly.

Accepted-output Markdown retains the current summary and coordination/activity record
references for later Actions. Request/response records retain the worker evidence and
separate coordinator decisions. Presentation includes only unresolved additional findings
marked as needing attention; the underlying reports remain inspectable. Required checks
and explicit user overrides remain distinct from advisory artifact verification.

## Visibility, records and cancellation

The page shows total elapsed time, current public activity and time since its latest
update, without a percentage. Process events drive updates directly; no model is called
for each line or heartbeat. Coordinator/worker settings and per-attempt records are
separate. Empty additional-findings sections are omitted.

The host retains the last 300 public activity entries and bounded per-call request/response
records, and writes them on completion, failure or cancellation. This is not a full
crash-durable transcript stream: active activity can be lost on a host crash. Private
reasoning events are ignored. Common credential patterns are redacted from activity and
request/response copies; this is not comprehensive secret detection, and structured
reports can still contain sensitive user/project data. Records stay local by default.

The log endpoint resolves only recorded references and known attempt IDs inside the
registered planning root, rejects symlink escapes and limits a returned file to 2 MiB.
It does not accept arbitrary caller-supplied filesystem paths.

Stop does not wait for a coordinator verdict. The host signals the active process group;
the runner rejects subsequent dispatch even if a completion arrives late. Finalization
retains partial artifacts, trace and activity. It does not roll back code. Live corrective
messages into an active worker remain deferred.

## Reference mechanisms

- [Claude Agent SDK Python reference](https://code.claude.com/docs/en/agent-sdk/python)
  separates `max_turns` from `max_budget_usd`. The latter uses a client-side estimate.
  Borrow the separation of iteration and cost budgets; do not claim the CLI adapter
  implements SDK billing controls.
- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api)
  bounds graph supersteps and exposes remaining steps for graceful exits. Borrow the
  finite transition graph and explicit budget-exhausted outcome, without introducing
  the framework as another runtime dependency.
- [OpenAI guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
  distinguishes run-boundary checks from controls next to side-effecting operations.
  Accordingly, the host validates the coordinator decision immediately before worker
  dispatch; a prompt-only instruction is not the authority to start work.

## Validation evidence and limits

Deterministic tests cover normal dispatch, coordinator-only results, one focused repair,
repair exhaustion, identity/version validation, reuse rejection, current-failure
preservation, explicit user decisions, tool limits, timeout, stop races, cancellation
record retention and context delivery to the next Action. An integration test uses the
real coordination runner with a fake transport and the real host persistence path.

An isolated browser fixture exercised running progress, independent role settings,
coordinator report, trace and the acceptance entry. It did not modify the accepted
HereItIs Card or its production page.

One real CLI smoke on 2026-08-31 wrote and verified a temporary `delivery.txt` containing
`READY`. Coordinator: gpt-5.6-sol/low; worker: gpt-5.6-luna/low. It completed in 73.341
seconds with three calls and no repair:

| Role / phase          | Input tokens | Cached input | Output tokens |
| --------------------- | -----------: | -----------: | ------------: |
| Coordinator / prepare |       48,863 |       35,328 |           753 |
| Worker / execute      |       70,470 |       54,528 |           679 |
| Coordinator / qualify |       50,787 |       25,216 |           540 |
| Total                 |      170,120 |      115,072 |         1,972 |

Input includes cached input; uncached input was 55,048. This confirms protocol wiring,
not efficiency or successful iOS delivery. A real multi-Action follow-up must compare
elapsed time, repeated checks, usage by role and user interventions against the trial.
The live smoke did not exercise Claude. Run it only deliberately with explicitly chosen
models: `npm run test:coordination-smoke -- <coordinator-model> <worker-model>`.
