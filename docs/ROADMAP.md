# Roadmap

AgentManager's next priority is the smallest complete Task Decomposition loop.
Operational analytics remain planned work and must not delay that loop.

## Current MVP

### 1. Agent Run loop — implemented, pending live acceptance

- Replace the local-only Request Preview action with `Send to Agent`.
- Create a minimal Run record with `runId`, status, transport, start and end
  timestamps, and optional raw usage returned by the transport.
- Render a connected running Placeholder Card with honest transport and
  validation states.
- Let the user cancel a Run, interrupt the transport, remove the Placeholder,
  and restore the exact Instruction and Resources in the Composer.
- Ignore every late result from a canceled `runId`.
- Validate the Agent response through the Task Decomposition Harness before
  rendering Candidate Cards.
- Represent proposal, clarification, insufficient-evidence, failure, and
  cancellation outcomes without manufacturing a successful result.

The first implementation may execute one fresh local Agent per Run, but its
transport and records must preserve the seam required for Session reuse. A Run
therefore carries both its own `runId` and an optional provider-owned
`agentSessionId`, alongside the AgentManager Decomposition `sessionId`, request
identity, input fingerprint, and Harness revision.

Later Runs should reuse one Coordinator Agent only inside the same bounded
Decomposition Session. Candidate feedback, clarification answers, Resource
changes, and graph deltas can continue that Agent Session without reinjecting
the complete Harness and unchanged evidence. A different independent root
starts a new Agent Session. An independent Reviewer always starts fresh so it
does not inherit the Coordinator's assumptions.

Session reuse is bounded rather than permanent. AgentManager freezes a compact
handoff and creates a new Agent Session when the Context threshold is reached,
the Harness revision changes, the input boundary changes materially, the
transport or model changes, or repeated failures make the current Session
unreliable. Accepting the proposal or ending the Decomposition Session also
ends reuse. Run observability should later compare fresh and resumed Runs so
the cost benefit is measured rather than assumed.

### 2. Candidate delivery loop

- Inspect each Candidate and its proposed lineage and dependency relationships.
- Revise or discard temporary Candidates without mutating the formal graph.
- Accept one exact Candidate revision.
- Promote accepted output into a formal Node folder containing `node.json`, a
  readable Markdown artifact, and any Node-local Resources.
- Move superseded Candidate versions and transient Session history to the
  operating system Trash after successful promotion.
- Resume one bounded Coordinator Session for supplemental parent-level
  decomposition. Existing children remain immutable; the Agent can return only
  new siblings, `no-change`, or clarification.
- Restrict Candidate revision to the same Candidate identifier and next
  revision. Structural sibling or child changes return clarification.

## Deferred: Run observability

Run observability is intentionally outside the first MVP. The initial transport
should preserve raw usage when it is already available, but it should not block
Agent invocation on cost calculation, dashboards, or detailed attribution.

Later observability should record:

- actual provider-reported input, cached input, output, and reasoning tokens
  when available;
- model, transport, elapsed time, retries, context expansions, tool calls, Sub
  Agent usage, outcome, cancellation, and failure information;
- estimated cost only when a reliable model-price snapshot is available;
- AgentManager's measured request-payload attribution across the built-in
  Harness, user Instruction, Decomposition Context, Source Resources, graph
  map, expanded Nodes, type template, prior Candidate feedback, and output; and
- an explicit unallocated or platform-overhead category instead of pretending
  that attribution is exact.

Usage totals come from the transport or provider. The Agent must never be asked
to invent or self-report them. Payload attribution is a separate AgentManager
measurement and must be labeled as such.

Candidate and formal Node content should reference the generating `runId`
instead of duplicating telemetry. A compact immutable Run summary may remain
after transient Session content is discarded. It must not retain complete
prompts or abandoned Candidate content merely for analytics. Canceled Runs
retain the usage accumulated before interruption.

The future interface can expose a `Run statistics` view with totals, Context
breakdown, duration, expansions, retries, tools, Sub Agents, outcome, and cost
when known.
