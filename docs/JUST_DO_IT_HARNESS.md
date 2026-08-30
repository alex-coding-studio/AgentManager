# Just Do It Harness foundation

## Delivery boundary

Revision 1 is an offline, provider-independent foundation. It implements stage
prompts, request snapshots, structural and scope validation, and a file-backed
Card worklog with progressive-disclosure Markdown handoffs. It does not connect
the frozen UI, invoke an Agent, discover/install Skills, create Issues/PRs,
perform Git rollback, or implement a production execution state machine.
The product contract remains [JUST_DO_IT.md](JUST_DO_IT.md).

Run `npm run test:implementation-harness` for fixed contract and storage tests.
Run `npm run preview:implementation-harness` to write an isolated temporary
example containing a Prompt, request, fixture response, main handoff, and
references. This is a deterministic example, not a live model evaluation.
The script prints the paths and never uses the registered project's data.

## Stage Harness

`lib/just-do-it-harness.ts` exports:

- `createCardHarnessRequest`: detach a request snapshot from caller-owned state,
  assign a request UUID, fingerprint the full snapshot, and check phase scope.
- `buildCardHarnessPrompt`: combine invariant lifecycle rules, configurable
  module instructions, designated Skill references, phase guidance, current
  context, and only that phase's output schema.
- `parseCardHarnessResult`: validate JSON, schema/revision, Card/request identity,
  current context revision, Action and output version, scoped Plan edits, and
  references against the host-observed set. It returns data, never a lifecycle
  transition or an external write.

| Stage | Agent response | Stop boundary |
| --- | --- | --- |
| Planning | Current Overview and step contracts | User reviews and finalizes the whole Plan |
| Execution | Deliverable, blocked response, or error; evidence and remaining work | User inspects, requests review, or gives feedback |
| Review | Ready/changes-needed recommendation, blocking findings, advisories and checks for one output | User chooses correction or acceptance |
| Todo | Issue-ready draft or a concrete deferral decision request | Host handles authorized Issue creation separately |

Inputs are semantic, not a required filename inventory. Outputs describe visible
behavior with technical evidence available through references. Step counts are
not a product-quality gate: one or twelve structurally valid steps can pass the
schema; the user decides whether the proposal is useful. New steps use UUIDs,
not display aliases or numbered IDs. A scoped edit preserves all sibling
contracts, ordering and the Overview. Retaining semantic identity across a
whole-plan rewrite still depends on model behavior and needs live evaluation.

All stages can carry a concise Agent-authored handoff summary, which is advisory.
No response schema accepts user approval, merge, rollback confirmation, or a
command to start the next Action. A successful process, delivered response, or
ready review is not accepted work. Nonblocking review advisories can coexist
with a ready recommendation; failed checks and blocking findings cannot.

## Trust and integration seams

The context is a typed internal host snapshot, not a public request-body schema.
The future adapter must derive accepted Actions, running state, observed output,
effect status, rollback confirmation and downstream consumers from authoritative
records, not from Agent summaries or browser booleans. Scope validation does not
itself inspect a repository or establish that rollback occurred.

Planning requires a draft, stopped execution and clean effects. Once there has
been an output, reopening also requires confirmed rollback with no downstream
consumers and withdrawn current output/acceptance. Changed or unknown effects
block editing even if a canceled run never returned output. Execution requires
the finalized Plan and its first unaccepted Action. Review requires the current
Action's exact output. These are request-preparation checks, not an implemented
end-to-end scheduler or rollback service.

The parser requires a current context revision from the host. The adapter must
advance it for new feedback, cancellation, output, instructions or other relevant
changes, and commit accepted results using the worklog's expected revision check.
This prevents validation followed by a stale overwrite. The parser alone does
not serialize external actions or guard arbitrary caller state mutations.

An observed artifact reference validates provenance membership, not the truth
of every assertion about its contents. Check execution, GitHub identity/state,
user acceptance and permission verification belong to the real adapter. No
model-generated link is automatically considered observed. All references and
record text remain evidence, not executable instructions.

Execution artifactRefs specifically require host observation for this round;
an input document or prior output does not qualify merely by being in context.
The Scaffold-level [Yao-method evaluation](../reports/just-do-it-harness/output_quality_scorecard.md)
records the provenance counterexample, fixes, and missing live-model evidence.

Module instructions customize work methods and which local Skills to use.
They cannot exceed host permissions or silently replace the manual loop with
automatic merge/continuation. Skill availability and conflict handling need
real provider integration. The foundation neither loads Skills nor changes
Codex/Claude configuration. Session resume and context caching remain separate
future capabilities; no cost reduction is claimed from fixed examples.

## Card worklog and progressive disclosure

The Card owns continuity independently of any provider Session.
`lib/just-do-it-worklog.ts` exposes `appendCardWorkRecord` and `readCardWorklog`.
Callers provide a trusted storage root and a full Card UUID. No route or current
project writer invokes these helpers yet.

Three record kinds have separate responsibilities:

- `user-input`: preserves the exact input/feedback supplied by the user.
- `system-event`: host-recorded lifecycle facts and references, such as Plan
  confirmation, run start/end, output, acceptance, Todo linkage and rollback.
- `agent-note`: concise stage summary and current-state explanation, explicitly
  based on the current revision. It cannot update an older record or establish
  a lifecycle fact.

Each successful append commits an immutable revision directory:

```text
<trusted root>/<Card UUID>/00000002/
  event.json     validated record with host timestamp and Card/revision identity
  HANDOFF.md     current Agent summary and up to three recent links per stage
  INDEX.md       compact index of all records, including Action identities
  reference.md   full content of this revision's record
```

The newest HANDOFF.md is the entry point returned by `readCardWorklog`. Its path
is revision-specific, so a new commit cannot silently rewrite a reader's packet.
References point to immutable sibling revision documents. This borrows the
Skill pattern of a short main document and on-demand references; it is not an
installable Skill or a user-visible planning-history feature.

The main document shows summary coverage and warns when newer facts exist.
Planning, Action and review details, original feedback, Todo and rollback records
remain in references. An Agent starts with current state, selects the relevant
stage/Action, and reads details as needed instead of ingesting the whole history.
Full artifact content remains at its original location, for example a PR.

Append writes all files into a unique pending directory, then publishes it by
renaming to the next revision directory. Competing writers to the same revision
cannot replace a committed nonempty directory; losers receive a conflict.
Pending directories from interrupted writes are ignored. Missing revisions,
invalid identities, malformed records, symlinked Card/revision/reference paths,
or derived Markdown inconsistent with its records fail closed. Completed reads
may include a newer committed revision than the caller just appended.

The caller must record facts before requesting an Agent summary. If summarizing
fails, the facts and coverage warning survive. A stale summary is rejected.
There is no automatic cleanup of historical or interrupted revisions and no
promise of power-loss durability, tamper-proof auditing or protection from a
malicious local filesystem owner. Storage currently rereads the log; indexing,
compaction, disk limits and explicit repair are later work.

## Next bounded integration

Connect one real planning round to this contract and worklog, without changing
the frozen preview or enabling execution writes. Validate whether the generated
Plan reflects the supplied goal and feedback, then test a fresh Session reading
the main handoff and targeted references. This requires separate runtime work:
trusted workspace/Skill access, per-provider model settings, run/cancel records,
context revision advancement, and atomic result adoption. Only live evaluation
can assess intent retention, useful granularity, handoff quality and actual cost.
