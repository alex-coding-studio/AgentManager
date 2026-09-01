# Filesystem Store Inventory

## Purpose and scope

AgentManager is local-first and uses files as its database. This document inventories every
filesystem-backed store before any of them is migrated, so that Stabilization Item 6 can be
chosen from evidence rather than from code shape.

Correctness here depends on more than whether a write eventually calls `rename`. For each
store this audit asks what state it owns, which files form one logical record, where it is
read and written, whether publication is atomic, whether read-modify-write is serialized,
whether protection is process-local or cross-process, what the failure path leaves behind,
and what the existing tests actually prove.

This is a manual architecture audit. An earlier revision of this work built a TypeScript
analyzer and derived the inventory from its output. That approach was withdrawn: static call
sites cannot decide canonical ownership, logical commit boundaries, rollback behavior or
reachable concurrency, and every substantive error found in the generated inventory — a
misclassified worklog, an unread `createStartNode`, a missing Context-workspace write unit —
was found by reading code, not by improving the analyzer. No analyzer, generated metric or
input fingerprint appears in this document.

Base commit: `3c7af04`. This is the base the work started from, not the delivery head. The
exact head lives in the pull request description and merge record.

No production behavior was changed by this audit.

## Discovery commands and their limitations

`rg` was used to enumerate candidates. These commands are documented so the starting set is
reproducible; **their match counts are not write counts and carry no transaction meaning.**

```bash
rg -l "from '(node:)?fs(/promises)?'" app bin lib scripts
rg -l "\b(writeFile|appendFile|rename|unlink|rm|rmdir|mkdtemp)\(" app bin lib scripts
rg -l "from 'trash'" app bin lib scripts
rg -n "\bexec\('git'|execFile\('git'" app bin lib scripts
```

The first returns 38 modules that import the filesystem API. The second returns 24 modules
containing a call whose name suggests mutation.

Their limits are load-bearing, and one of them changed this document's own writer set:

- **A name match is not a mutation.** `scripts/smoke-just-do-it-execution.ts` appears in the
  second command's output solely because it calls `mkdtemp` and `mkdir`. Creating a temporary
  directory publishes no named durable record, so it is not a writer. Classifying it required
  reading it; the command cannot make that distinction.
- **A mutating call is not a write unit.** One `rename` may publish a whole directory of
  files, and one `rm` in a `catch` is cleanup. Counting call sites conflates all three.
- **Loops have dynamic cardinality.** A single `writeFile` inside a `for` over uploads writes
  a number of files known only at runtime.
- **Import discovery misses indirection.** A module reached through a local wrapper appears
  under neither pattern.

Every classification below therefore comes from reading the read path, the write path and the
failure path in the cited source, with tests checked separately.

## Store-class definitions

1. **Canonical state** — current product or workflow truth. Corruption or a lost update
   changes visible behavior.
2. **Append-only evidence** — event history and raw outputs. Supports recovery and review.
   May also be canonical input to a service, in which case both labels apply.
3. **Derived materialization** — reproducible from canonical state while that source remains
   available.
4. **Cache** — disposable optimization; loss must not change correctness.
5. **External repository state** — Git repository, branch, worktree or commit history. Not an
   AgentManager JSON store and not automatically eligible for atomic-store migration.
6. **Ephemeral process state** — in-memory maps, live Run handles, promise chains. Documented
   for its interaction with persisted state, never counted as a filesystem store.

One module may own more than one class. Distinct write units are listed separately even when
they share a source file.

## Summary

| write unit                       | class                           | owner                                         | publication boundary                                                      | serialization                          | priority             |
| -------------------------------- | ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- | -------------------- |
| project registry                 | canonical                       | `lib/project-registry.ts`                     | shared helper, `wx` temp + rename                                         | promise chain, per file                | no migration         |
| app settings                     | canonical                       | `lib/app-settings.ts`                         | `wx` temp + rename                                                        | promise chain, per file                | no migration         |
| worklog revision history         | canonical, append-only evidence | `lib/just-do-it-worklog.ts`                   | complete pending directory + rename                                       | rename is the compare-and-swap         | no migration         |
| worklog HANDOFF / INDEX / refs   | derived materialization         | `lib/just-do-it-worklog.ts`                   | inside the same revision directory                                        | inherited from the revision            | no migration         |
| Task Graph node creation         | canonical                       | `lib/task-graph.ts` `createStartNode`         | unique temp directory + rename                                            | process-local chain, per Canvas        | no migration         |
| Task Graph node update           | canonical                       | `lib/task-graph.ts` `updateStartNode`         | staged resources + `node.json` rename                                     | process-local chain, per Canvas        | no migration         |
| Task Graph node deletion         | canonical                       | `lib/task-graph.ts` `deleteTaskGraphNode`     | `trash` of the node directory                                             | process-local chain, per Canvas        | no migration         |
| Task Graph listing normalization | derived materialization         | `lib/task-graph.ts` `listTaskGraphNodes`      | `wx` temp + rename, on the read path                                      | process-local chain, per Canvas        | P3                   |
| Break It Down Runs               | canonical                       | `lib/task-decomposition-runs.ts`              | `wx` temp + rename per artifact                                           | process-local chain, per planning path | no migration         |
| What's Next Runs                 | canonical                       | `lib/whats-next-runs.ts`                      | `wx` temp + rename per artifact                                           | promise chain, per planning path       | P3                   |
| Run context workspace            | immutable Run-input evidence    | `lib/task-decomposition-context-workspace.ts` | **none**                                                                  | none                                   | P3                   |
| Break It Down context            | canonical                       | `lib/task-decomposition-context.ts`           | `wx` per attachment, batch compensation; settings create-once             | none                                   | P3, concurrency only |
| Context Library documents        | canonical                       | `lib/product-context.ts`                      | `wx` batch with compensation; staged rename for overwrite; section rename | none                                   | P3, concurrency only |
| What's Next instructions         | canonical                       | `lib/whats-next-context.ts`                   | `wx` temp + rename                                                        | none                                   | P3                   |
| Just Do It planning instructions | canonical                       | `lib/just-do-it-planning-service.ts`          | `wx` temp + rename                                                        | none                                   | P3                   |
| Card environment manifest        | canonical                       | `lib/card-host-operations.ts` `atomicJson`    | `wx` temp + rename                                                        | none                                   | P3                   |
| Card workspace record            | canonical                       | `lib/just-do-it-worktree.ts`                  | `wx` temp + rename                                                        | none                                   | P3                   |
| host job status record           | canonical, mutable              | `lib/host-job-broker.ts`                      | temp + rename, **no `wx`**, overwritten                                   | none                                   | P3                   |
| host job output log              | derived output                  | `lib/host-job-broker.ts`                      | written once at completion                                                | none                                   | no migration         |
| system validation result         | cache                           | `lib/system-validation-runner.ts`             | `wx` temp + rename                                                        | **`mkdir` lock, cross-process**        | no migration         |

Class totals: 14 canonical — 12 plain, one also append-only, one a mutable two-state record —
plus 2 derived materialization, 1 derived output, 1 immutable Run-input evidence and 1 cache,
for 19 write units.
External repository state and ephemeral process state own no JSON write unit and are covered in
their own sections below. Card candidate publication is Git-backed and appears there, not as
evidence for the manifest row.

## Detailed sections

### project registry — canonical

`lib/project-registry.ts` is the only consumer of `lib/atomic-json-store.ts`
(`lib/project-registry.ts:8,37`). `createProject` performs the duplicate check, the filesystem
effects and the registry update inside one link of the per-file promise chain. Its read path
tolerates a missing project file by returning `null` on `ENOENT`
(`lib/project-registry.ts:158-163`); its failure path restores the exact prior bytes through
`writeFileAtomically`, or removes the file when it did not previously exist
(`lib/project-registry.ts:164`).

Concurrency is reachable and covered: `tests/project-registry-atomicity.test.ts` exercises
concurrent creation and rollback over a pre-existing file. The process-local limit of the chain
is already documented in `docs/PROJECT_REGISTRY.md`.

### app settings — canonical

`lib/app-settings.ts` reads `settings.json`, treating both `ENOENT` and a parse failure as an
empty value rather than throwing (`lib/app-settings.ts:42-53`). `updateAppSettings` merges and
republishes through a `wx` temporary file and one rename, inside a `globalThis` promise chain
keyed per file (`lib/app-settings.ts:15`). A publish failure leaves the temporary file behind
and the target intact.

Concurrent partial saves are covered by `tests/app-settings.test.ts`. The chain is process-local
and undocumented; see the cross-process section.

### graph identity index — canonical

`lib/graph-identity-store.ts` reads the index with `JSON.parse` and treats a missing file as
absent, rethrowing any other error (`lib/graph-identity-store.ts:55-56,80`); a missing records
directory reads as an empty list (`lib/graph-identity-store.ts:106`). `atomicJson` re-implements
the shared helper locally — `mkdir`, `wx` temporary file, rename
(`lib/graph-identity-store.ts:89-95`) — and mutations run through a local `serialized()` promise
chain (`lib/graph-identity-store.ts:38`).

**Not proven.** No dedicated test exercises its concurrency or failure path; the chain is
process-local and undocumented.

### worklog revision history — canonical, append-only

`lib/just-do-it-worklog.ts` `appendCardWorkRecord`.

**Read path.** `readCardWorklog` enumerates numbered revision directories and reads
`event.json` from each. `lstat` guards reject a non-directory, a symlink, a non-file and an
oversized document (`lib/just-do-it-worklog.ts:125-146`).

**Write path.** The function reads the current revision, rejects a mismatch against
`expectedRevision`, then creates `.pending-<uuid>` and writes the whole next revision into it —
frozen user documents, `event.json`, `reference.md`, `HANDOFF.md` and `INDEX.md`, every one
with `flag: 'wx'` — and publishes with a single directory rename
(`lib/just-do-it-worklog.ts:236-267`).

**The rename is the compare-and-swap.** The revision comparison before it is an optimistic
check; the durable guarantee is that renaming onto an existing revision directory fails
`EEXIST` or `ENOTEMPTY`, and that failure is translated to `Worklog revision conflict.`
(`lib/just-do-it-worklog.ts:268-275`). Two concurrent appends cannot both win, and the loser
is told so rather than silently overwriting.

**Failure path.** The `finally` removes the pending directory with `recursive` and `force` on
both success and failure (`lib/just-do-it-worklog.ts:276-278`), so a normal failure leaves
nothing behind. Only a hard process kill between the last write and the rename can leave an
orphaned `.pending-` directory, which readers ignore because it is not a numbered revision.

**Concurrency reachability.** Reachable — this is the one store in the inventory whose
concurrent path is both reachable and already proven safe.

**Existing tests.** `tests/just-do-it-harness.test.ts:483-675` covers concurrent and stale
overwrite rejection, interrupted uncommitted writes ignored while committed corruption fails
closed, revision gaps, foreign Card records, foreign identities, unsafe paths, symlinked
Cards, and bounded handoff/index behavior.

**Not proven.** Behavior when a revision directory is renamed or removed by an external
process between listing and reading.

An earlier revision of this document classified this store as unresolved evidence with an
unprotected read-modify-write, and stated that no deterministic concurrency test existed for
it. Both claims were false. The store reads its own state _because_ it is performing
compare-and-swap, and the tests were present and named accordingly.

### worklog HANDOFF, INDEX and rendered references — derived

`HANDOFF.md`, `INDEX.md` and `reference.md` are rendered from the accumulated `entries` at
append time (`lib/just-do-it-worklog.ts:246-266`). They are verified materializations of the
canonical event history, published inside the same revision directory and therefore under the
same rename boundary. They are reproducible from `event.json` and are not independent state.

### Task Graph node creation — canonical

`createStartNode` validates its input, creates `.<id>-<uuid>.tmp` inside the nodes directory,
writes resources and `node.json` into it, and publishes with one directory rename
(`lib/task-graph.ts:179-244`). Failure injection at the idea write, at an attachment write, at the
record write and at the rename itself each leaves no published node, no listed node and no
temporary directory.

Three corrections came out of that exercise:

- **Failing cleanup is retained on both paths.** Creation attaches its `rm` failure, and a failed
  update attaches its temporary-record and staged-resource failures — one error, or a bounded
  `AggregateError` — as the primary error's
  `cause`, and `recordUnexpectedApiError` keeps both: its diagnostic formatting walks the `cause`
  chain to a bounded depth with cycle protection, through the same redaction the primary error
  passes. The response still carries only the generic message and a correlation id.
- **Nothing fallible runs after publication.** The function returns the already-loaded graph plus
  the node it just committed rather than re-listing from disk, so a read fault cannot make a
  committed node look uncommitted. With the re-list gone there is no fallible operation between
  the publication rename and the return, so the catch handles pre-publication failures only and no
  unreachable guard remains.
- **The Route reflects that.** `POST /api/projects/[projectId]/nodes` answers `201` with the
  committed node even when a subsequent read would fail, and a duplicate retry meets the existing
  `This Canvas already has a Start node.` rule.

**Concurrency was demonstrated and is now bounded in-process.**
`tests/task-graph-concurrency.test.ts` pauses two real `createStartNode` calls for one empty
Canvas at the publication rename. Before the fix both calls passed `assertCanvasCanCreateStartNode`
against the same empty listing and both published: two `role: 'start'` directories, two stable
identities bound in `identities.json`, both listed in `formalAliases`, no temporary directory left,
no conflict raised, and `POST /api/projects/[projectId]/nodes` answering `201` twice. A fresh
`listTaskGraphNodes` then returned two Start Nodes, which the one-Start rule forbids.

`createStartNode`, `updateStartNode` and `deleteTaskGraphNode` now enter a process-local promise
chain keyed by `resolve(project.planningPath)` plus the graph root
(`lib/task-graph.ts:74-100`), and call unqueued internals inside it. One caller commits; the
second re-reads the committed Canvas and meets the existing
`This Canvas already has a Start node.` `PublicApiError`, so the Route answers `409` with that
message and no absolute path. Listing stays outside the chain — every queued operation calls it,
so queueing it would be a same-key self-wait. The tests fail if the chain is removed, if the
planning path is dropped from the key, or if the graph root is dropped from the key.

**Crash boundary.** A process kill between the last write and the rename leaves a dot-prefixed
temporary directory. Listing ignores it because it is not a node directory, and nothing reclaims
it; the tests assert both halves. Repairing that needs a recovery pass over every store and stays
out of scope here.

### Task Graph node update — canonical

`lib/task-graph.ts` `updateStartNode` publishes through one boundary: the `node.json` rename.
Resources reach that boundary as staged, unreferenced files.

New attachments are written into the live resources directory with `flag: 'wx'`, and a changed
idea is written to a **new** unique resource path rather than over the file the current record
references. Nothing the live `node.json` points at is modified before the rename. The rename
publishes the new resource references; only after it commits is the superseded idea resource
removed, as cleanup whose failure leaves an orphan without invalidating any reference.

A pre-commit failure removes the temporary record and every staged path, each removal tolerating
its own error so the original failure stays primary.

Two properties this depends on, both regression-tested:

- **Name allocation reads the resource directory, not only the references.** An orphan left by a
  failed cleanup would otherwise be chosen again by a later update and fail its exclusive create.
  Retries after a failed staged cleanup and after a failed post-commit removal both publish at
  fresh paths and never adopt a prior orphan as canonical.
- **The temporary record is cleaned on an ordinary pre-commit failure.** It lives in the node
  directory rather than under `resources/`, so an inspection that scans only the resource
  directory cannot see it — the first version of these tests missed exactly that.

**This replaced an in-place overwrite.** Before the change, a changed idea was written directly
over the referenced file, so an injected failure at the temporary-record write, at the rename, or
during cleanup left the idea document holding the new title while `node.json` still described the
previous state. Restoring the in-place write turns nine tests red.

**Two overlapping updates produced states no sequential order could produce.** Both were
demonstrated against one seeded Start Node with an idea and one attachment:

- When both requests replace the idea, both derive the same unique resource name from the same
  read of the resources directory, and the second `wx` write fails `EEXIST` on
  `resources/idea-2.md`. That raw filesystem error reached the caller and, through the Route, a
  generic `500`.
- When both requests only restage attachments, both reach the record rename. The first to commit
  is overwritten by the second, and the first caller's post-commit cleanup then unlinks the
  attachment the committed record still references. The final `node.json` carried
  `resources/seed.md` while that file no longer existed, and the loser's `beta.md` stayed behind
  unreferenced. Neither invocation order produces that state: `Alpha` then `Beta` ends at `Beta`'s
  title, and `Beta` then `Alpha` rejects `Alpha` with `A retained attachment is invalid.`

Both are closed by the same Canvas chain. The first invocation commits one coherent state, the
second then reads that committed state and applies its full request, and the committed record's
resources all exist. Cleanup may still leave an unreferenced orphan; it can no longer leave a
broken reference. The update contract is unchanged — the second request replaces the state, and
no field-level merge was introduced.

**A missing record is now an actionable state error.** `updateStartNode` read `node.json`
directly, so an update against a node removed by a concurrent delete surfaced `ENOENT` as an
internal failure. It now maps `ENOENT` on that read to the existing
`The node could not be found.` `PublicApiError` used by delete. Any other read error stays
internal.

**Update versus delete shares the same boundary.** `deleteTaskGraphNode` lists the Canvas,
applies the referential rule, and `trash`es the node directory, so it reads and removes the state
`updateStartNode` reads and republishes. Paused before its `resources` `mkdir`, an update whose
node was trashed underneath it recreated the directory and republished the record, resurrecting a
deleted node. Both orders now follow the chain: an update invoked first commits and the delete
then removes the updated node, and a delete invoked first completes and the update receives
`The node could not be found.`

### Task Graph listing normalization — derived

`listTaskGraphNodes` validates each node on read and throws on a malformed record. For the
`whats-next` graph root only, a node missing `layer` or `artifactKind` is given defaults and
**written back on the read path** through a `wx` temporary file and a rename
(`lib/task-graph.ts:107-114`).

This makes listing a mutating operation. Two concurrent listings each write their own uniquely
named temporary file and rename it, producing the same content, so the outcome is idempotent
rather than racy. The practical consequences are that a read-only filesystem makes listing
fail, and that a node's on-disk bytes can change without any user-visible edit.

**Idempotence between two listings is not enough.** Two listings converge, but a listing racing
an `updateStartNode` does not: the normalization read its record before the update committed and
then renamed that pre-update snapshot over the committed one, losing an accepted edit even though
every explicit `create` / `update` / `delete` call had used the Canvas chain. This is the fourth
writer of the same record, and it was missed by the first version of this work.

**The publication now runs under the Canvas key, and re-reads.** Listing computes the defaults in
memory unqueued, and when any record actually needs them it publishes through `mutateCanvas`,
re-reading each record inside the key so it never republishes the snapshot it read before
entering. A queued mutation calls an unqueued listing that publishes inline, because the caller
already holds the key — composition rather than a re-entrant lock.
`tests/task-graph-concurrency.test.ts` gates an update at its record rename, starts a listing
against the still-legacy record, and asserts the two publications land in Canvas order; it fails
if the normalization publication is taken back out of the key.

### Break It Down Runs — canonical

`lib/task-decomposition-runs.ts` publishes run records, candidates and graph nodes through `wx`
temporary files and renames, and discards candidates through renames and `trash`.

Candidate acceptance, discard and Run start are serialized through a process-local promise chain
keyed on `project.planningPath`, mirroring the principle of `mutateWhatsNext` without copying its
scope. The chain covers Run start only until the Run is registered: `startTaskDecompositionRun`
returns immediately after `activeRuns.set`, and the background Agent runs under an unawaited
`finishTaskDecompositionRun`, so the queue is never held for an Agent's lifetime.
Before that serializer existed, two concurrent accepts of one Candidate both passed the
already-accepted check and renamed onto the same node path, so one caller received a raw
`ENOTEMPTY` instead of the idempotent success that sequential repeated acceptance returns; and a
concurrent accept and discard both succeeded, leaving a published Formal Node whose source Run
record had been discarded. Both are reproduced deterministically in
`tests/task-decomposition-acceptance-concurrency.test.ts`, which fails on exactly those two
scenarios when the serializer is bypassed.

A third symptom of the same defect surfaced once the queue's ordering was asserted strictly: the
caller that loses the race read a run directory the winner had already discarded and received a
raw `ENOENT`. Acceptance and discard now read the run through a wrapper that converts that one
case into the existing `The Candidate proposal is unavailable.`. The conversion requires both
`code === 'ENOENT'` and an error path equal to the requested Run record, so a failure from the
identity, Candidate or artifact reads that the same function performs stays an ordinary internal
error. `readTaskDecompositionRun` and every other caller are unchanged.

The graph identity allocator already prevented the worse outcome: `reserveNodeIdentity` runs
inside its own `serialized()` chain and returns the same `NODE-` id for one Candidate uid
(`lib/graph-identity-store.ts:246-249`), so no duplicate Formal Node was ever created and no
canonical value was overwritten. The defect was idempotency and conflict handling, not a lost
update.

Candidate revision start had to be included, and the reason is semantic rather than
path-based. `resolveRevisionTarget` reads the revised Candidate before the active-run guard, and
the new Run is only registered after Context and request persistence. Deterministic tests
demonstrated that during that window acceptance promoted the very Candidate a revision was
starting from, and that discard removed it, with both operations reporting success. A fresh
`runId` prevents a path collision, not this shared-Candidate race.

Run cancellation remains outside the serializer, on evidence. It returns without writing unless
the run status is `running` or `validating` (`lib/task-decomposition-runs.ts:404`), while
acceptance and discard require a completed run carrying a proposal. The two status sets are
disjoint, so ordering is coherent in either direction: a cancellation that arrives before a run
is registered finds no record, and one that arrives after acts on a running record that
acceptance cannot touch. Including it would be symmetry, not evidence.

The chain is process-local. Two AgentManager processes against one `AGENT_MANAGER_HOME` do not
see each other's queue.

### What's Next Runs — canonical

`lib/whats-next-runs.ts` routes every mutation through `mutateWhatsNext`, keyed on
`project.planningPath`, and publishes individual artifacts through `wx` temporary files and
renames. The serializer is process-local; see the cross-process section.

### Run context workspace — immutable Run-input evidence

`lib/task-decomposition-context-workspace.ts` `writeTaskDecompositionContextWorkspace`.

**Write path.** Each selected resource is written with `flag: 'wx'` under `<runPath>/context/`,
followed by `index.json` carrying a `sha256` per entry
(`lib/task-decomposition-context-workspace.ts:76-114`). There is no temporary directory, no
rename and no cleanup on failure.

**Classification.** A completed workspace is the immutable snapshot of the exact inputs handed
to the Agent. It is derived at the moment of writing — its content comes from the source node,
related nodes, context refs, uploads and feature-context attachments — but it is **not reliably
reconstructible afterwards**, because it records no version of those inputs and the canonical
sources can change once the Run starts. After the Run reads it, it is the evidence of what that
Run was given, and it is never rewritten.

**Failure consequence is an orphan, not a corrupted record.** In both callers the workspace is
written before anything registers the Run: `lib/task-decomposition-runs.ts:223` precedes
`request.json` at `:289`, and `lib/whats-next-runs.ts:362` sits at the same point in its
sequence. A throw therefore happens before `request.json`, `run.json`, the active-run
registration and `startLocalAgentRun`, leaving an unreferenced `context/` directory under a
`runId` that no record mentions. Nothing reclaims it.

**A retry is a different record.** `runId` is generated per call —
`RUN-${randomUUID()}` at `lib/task-decomposition-runs.ts:194` and
`lib/whats-next-runs.ts:275` — so a retry writes into a fresh directory. There is no failed
retry of the same logical record, and no contradictory canonical state.

An earlier revision of this document stated that a retry against the same run fails `EEXIST`
rather than repairing the directory. That was wrong: it assumed a retry reuses the `runId`
without checking either caller.

**Priority P3, not P2.** The gap is orphan cleanup and the absence of failure evidence, not a
demonstrated correctness failure.

**Existing tests.** `tests/task-decomposition-context-workspace.test.ts` has five tests covering
primary and related selection, neighborhood narrowing, duplicate promotion, collision-free
inherited outputs, and the manifest not embedding content. None exercises a partial write or
the orphan path.

### Break It Down context — canonical

`lib/task-decomposition-context.ts` `importTaskDecompositionAttachments` validates its input,
rejects duplicate and already-attached names as public `409` conflicts, then writes each
attachment with `flag: 'wx'` and, on failure, unlinks every path it created in that call. That
is genuine multi-file compensation, scoped to one call. `settings.json` is written with `wx`
and an explicit `EEXIST` tolerance, making it create-once rather than republishable.
`ensureFeatureContext` runs before the conflict check, so a request that ends in a conflict
still initializes the feature context.

Deterministic failure injection in `tests/context-import-publication.test.ts` confirmed the
compensation: a failure writing the second of two attachments removes the first, a fresh read
lists only the pre-existing attachment, its bytes are identical, and a retry succeeds. Two gaps
were demonstrated on the same path and corrected:

- **Cleanup failures were discarded.** The compensation used `unlink(...).catch(() => undefined)`,
  so a cleanup failure never reached Host diagnostics. Every unlink outcome is now collected and
  attached as the primary error's `cause` through `retainCleanupFailures` in `lib/api-errors.ts`
  — one error, or a bounded `AggregateError` — and the Route's diagnostic carries both messages
  through the same redaction. The response still carries only the fallback text and a
  correlation id. When cleanup fails, the orphan remains as a valid attachment: a retry of the
  same batch answers `409` naming it, and the user removes it before adding a replacement, which
  is what the existing UI message already says.
- **A listing ran after publication.** The function re-read the whole context after its writes,
  so an injected `stat` failure on a pre-existing attachment turned a committed batch into a
  `500`. The context is now read once, before the conflict check, and the response is that
  result plus the attachments just written, with sizes computed from the written content; a
  fresh read returns the identical value. Nothing fallible runs after the last write.

Invalid JSON in a `.json` attachment is still thrown as an internal `Error` rather than a
`PublicApiError`, so the client sees the generic fallback. That predates this work and is
unchanged.

### Context Library documents — canonical

`lib/product-context.ts` treats each document as its own unit for creation, using
`flag: 'wx'` through `writeIfMissing` and `writeUniqueMarkdown`, so a name collision fails
rather than silently overwriting. The one section-level `rename` is `renameContextSection`.
There is no read-modify-write cycle to protect.

`importContextDocuments` is one batch, on the evidence of its contract: the Route answers
`201` with `created` and `sections` or `409` with every conflict, and
`components/product-context-workspace.tsx` offers one overwrite confirmation for the whole
selection and selects `created[0]` on success. Nothing in that surface can express a partial
result, so partial publication is a defect rather than a product model. Failure injection
demonstrated three:

- **Create batch.** With `overwrite = false`, a failure writing the second of two documents left
  the first on disk, and a retry then met a `409` naming the file the failed request had
  created. Creation now records every path it created and unlinks them on failure, with unlink
  failures retained as the primary error's `cause`. After a normally caught failure the section
  is byte-identical to its prior state, and a retry succeeds.
- **Overwrite batch.** With `overwrite = true`, replacements were written directly over
  canonical files with `flag: 'w'`; a failure on the second document left the first holding
  replacement bytes while the second still held its original, and there was no publication
  boundary at all to fail at. Replacement is now staged: the original bytes of every document
  to be replaced are read first, each replacement is written to a `<name>.<uuid>.tmp` sibling
  with `wx`, and only then is each temporary file renamed onto its destination. A failure while
  staging removes the temporaries and touches no document. A failure while publishing restores
  every already-published document from the captured bytes through a further staged rename, and
  removes a document that had no original. Restore failures are retained as `cause`. The `.tmp`
  siblings are invisible to `readProductContext`, `readContextBrowser` and name allocation, all
  of which admit only `.md` and `.markdown`.
- **Refresh after publication.** The function re-read the whole context after writing, so an
  injected read failure on an unrelated document turned a committed batch into a `500` inviting
  a retry. The read now happens once, before any write, and the response merges the imported
  documents into that result using the reader's own title, summary and ordering rules. A read
  failure therefore fails the request before anything is committed, and a committed batch is
  always answered with `201`.

The multipart branch of `POST /api/projects/[projectId]/context/documents` was unreachable:
the handler ran `guardJsonRequest` before inspecting the content type, so every `FormData`
import — the only form the UI sends — was answered `415` before `importContextDocuments` ran.
The handler now applies `guardRequest` first and `guardJsonRequest` inside its JSON branch
only. Validation and conflicts remain public `400` and `409` responses with no diagnostic;
filesystem failures remain a generic `500` with a correlation id and no file name or path.

**Retry behavior for both imports.** After a failure whose cleanup succeeded, a retry succeeds.
After a failure whose cleanup failed, the orphan is a real document: a Context retry answers
`409` and the UI offers overwrite; a Break It Down retry answers `409` and the user removes the
attachment first. A failed overwrite restore leaves the replacement in place for that one
document and is reported only in Host diagnostics.

**Crash and concurrency boundaries.** A process kill between a staged write and its rename
leaves a `<name>.<uuid>.tmp` sibling that readers ignore and nothing reclaims; a kill between
two publication renames leaves the batch half-replaced with no record of the originals.
Neither import serializes, in-process or across processes: two overlapping imports into one
section or one attachments directory both pass the name preflight and `wx` creation then
decides the loser, while two overlapping overwrites of one document publish last-writer-wins.
No test exercises those paths; they remain untested, as before.

### What's Next instructions — canonical

`lib/whats-next-context.ts` `saveWhatsNextInstructions` writes `instructions-<uuid>.tmp` with
`wx`, renames it onto `instructions.md`, and unlinks the temporary file when the publish fails
(`lib/whats-next-context.ts:89-95`). `lstat` guards reject symlinked directories and files and
enforce a size bound (`lib/whats-next-context.ts:49-66`).

### Just Do It planning instructions — canonical

`lib/just-do-it-planning-service.ts` `savePlanningInstructions` publishes a single file,
`implementation/instructions.md`, through an `instructions-<uuid>.tmp` file created with `wx`
and one rename (`lib/just-do-it-planning-service.ts:980-984`). Directory access is guarded by
`lstat` against symlinks (`lib/just-do-it-planning-service.ts:118-122`).

This write unit covers that file only. Card and Plan state is persisted through the worklog
revision store under `implementation/cards/<cardId>/<revision>/`
(`lib/just-do-it-planning-service.ts:128`) and is audited in the worklog sections above. The
temporary-file rename described here does not cover it.

### Card environment manifest — canonical

`lib/card-host-operations.ts` `atomicJson` writes a `wx` temporary file and renames
(`lib/card-host-operations.ts:496-503`). A missing manifest reads as `null` on `ENOENT`
(`lib/card-host-operations.ts:487-492`). That rename is the manifest's entire publication
boundary.

Candidate publication is a separate write unit and is not evidence for this row; it is
Git-backed and appears in the external repository section.

### Card workspace record — canonical

`lib/just-do-it-worktree.ts` `save` writes `<file>.<uuid>.tmp` with `wx` and renames
(`lib/just-do-it-worktree.ts:62-64`). Reads are guarded by `lstat` against non-files and
symlinks (`lib/just-do-it-worktree.ts:133-136`).

### host job status record — canonical, mutable

`lib/host-job-broker.ts` `run()` persists `job.json` once with `status: 'running'`, then
replaces the same file with the terminal completed, failed or canceled event
(`lib/host-job-broker.ts:89-124`). The file is therefore a mutable current-status record, not an
append-only stream: the running event does not survive the terminal one.

`persist` writes `<target>.<uuid>.tmp` **without** `flag: 'wx'` and then renames
(`lib/host-job-broker.ts:149-154`). It is the only production temporary-write path lacking
exclusive creation, so a colliding temporary name would truncate rather than fail. The name is
randomised, so no second writer currently reaches it.

An earlier revision of this document classified this store as append-only evidence, which
misread a two-state overwrite as an event stream.

### host job output log — derived output

`output.log` is written once at completion (`lib/host-job-broker.ts:113`) from output already
captured in memory. It is not migration material.

### system validation result — cache

`lib/system-validation-runner.ts` keys a result under a `cacheKey` beneath `cacheRoot` and
returns the stored value when present (`lib/system-validation-runner.ts:63-67`). Loss costs a
re-run and cannot change correctness, so it is a cache and not a migration candidate. It is
published through a `wx` temporary file and a rename
(`lib/system-validation-runner.ts:190-194`), and it holds the only cross-process guard in the
codebase; see below.

## External repository state

Seven modules invoke `git`: `lib/just-do-it-git.ts`, `lib/just-do-it-artifacts.ts`,
`lib/github-delivery.ts`, `lib/project-registry.ts`, `lib/system-validation-runner.ts`,
`lib/card-host-operations.ts` and `lib/just-do-it-worktree.ts`.

The first three perform **no direct filesystem mutation** and therefore own no JSON write unit
in this inventory. An earlier revision listed them as stores, which is why its prose count of
external-repository stores disagreed with its own table.

`publishCardCandidate` in `lib/card-host-operations.ts` belongs to this class rather than to the
manifest write unit. It reads repository state through `git rev-parse HEAD`,
`git branch --show-current` and `git status` (`lib/card-host-operations.ts:262-270`), writes the
candidate body with `wx`, and removes its temporary directory recursively on failure
(`lib/card-host-operations.ts:382-404`). Its correctness depends on the repository, not on the
JSON manifest.

A Git commit is a transaction for repository content. It does not cover companion JSON records
written before or after it, and those records are owned by the stores above. None of this class
belongs in a JSON-store migration.

## Ephemeral process state

`__agentManagerRuns` in `lib/task-decomposition-runs.ts` holds live Run handles. The
`globalThis` promise chains in `lib/project-registry.ts`, `lib/app-settings.ts`,
`lib/graph-identity-store.ts` and `lib/whats-next-runs.ts` order in-process work. Neither
persists state, and neither is a filesystem store. A name-matching search would have
misclassified the Run map as a serializer, which is why classification here is manual.

## Process-local versus cross-process boundaries

`docs/PROCESS_BOUNDARIES.md` is the shared statement: it names every serializer, its runtime
property and its real key, states the eight properties the chains do and do not have, records the
one-way lock order, and documents the `system-validation-runner` `mkdir` lock with its stale-lock
limits. This section keeps only the summary.

Six modules serialize through a `globalThis` promise chain: `atomic-json-store` (used by
`project-registry`), `app-settings`, `graph-identity-store`, `whats-next-runs`,
`task-decomposition-runs` and `task-graph`. **None of those six is a cross-process lock.** Two
AgentManager processes against one `AGENT_MANAGER_HOME` — two ports, or `dev` and `start`
together — do not see each other's chain.

`lib/system-validation-runner.ts:68-79` is the exception. A non-recursive `mkdir` either
creates the lock directory or fails `EEXIST`, atomically, at the filesystem level, and the
`EEXIST` branch reports the resource as busy. A second process does see this lock. It is
released in a `finally` (`lib/system-validation-runner.ts:120-122`).

Its limits are equally concrete: it is non-blocking rather than queuing, so a contending caller
is rejected instead of delayed, and it records no owner or timestamp, so a hard process kill
leaves a stale lock directory that nothing reclaims.

The primitive that would extend cross-process exclusion to the other stores already exists in
this codebase, but adopting it is a separate design: a store needs contending callers to wait
rather than be refused, and needs a lock left by a killed process to become reclaimable.
`docs/PROCESS_BOUNDARIES.md` states what such a design would have to settle.

## Multi-file publication and rollback findings

| operation                                | boundary                   | rollback                                                                     |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `appendCardWorkRecord`                   | one directory rename       | pending directory removed in `finally`                                       |
| `createStartNode`                        | one directory rename       | temporary directory removed on failure                                       |
| `updateStartNode`                        | **only `node.json`**       | compensation for attachments; none for the idea                              |
| `writeTaskDecompositionContextWorkspace` | **none**                   | none; failure orphans an unregistered directory                              |
| `importTaskDecompositionAttachments`     | per file                   | unlinks every path created in the call; cleanup failures retained as `cause` |
| `importContextDocuments` create          | per file                   | unlinks every path created in the call; cleanup failures retained as `cause` |
| `importContextDocuments` overwrite       | staged rename per document | restores captured originals, removes documents that had none                 |
| `createProject`                          | shared helper              | restores the prior bytes                                                     |

A single-file atomic write does not make a multi-file operation transactional. Only the first
two rows publish a multi-file record through one boundary.

## Existing test evidence

Mechanically tested:

- project registry concurrency and rollback — `tests/project-registry-atomicity.test.ts`
- app settings concurrent partial saves — `tests/app-settings.test.ts`
- Card worklog compare-and-swap, interrupted writes, committed corruption, revision gaps,
  foreign identities, symlinked Cards, bounded handoff and index —
  `tests/just-do-it-harness.test.ts:483-675`
- planning path containment — `tests/planning-paths.test.ts`
- Task Graph create and update failure boundaries under injected filesystem faults: no publication
  from a pre-publication failure, cleanup that cannot hide the primary error, no rollback after the
  publication rename, staged resources that never precede the record, orphan behavior on both
  cleanup paths, and clean retry —
  `tests/task-graph-failure-boundary.test.ts`
- Task Graph creation, update and deletion under same-process concurrency: two creates in one
  Canvas, listing normalization racing an update on a legacy `whats-next` record,
  independent graph roots and independent projects reaching publication together, two
  updates to one node in both the idea-replacing and attachment-restaging shapes, update versus
  delete in both invocation orders, queue release after a rejected mutation, and the public
  `409` conflict through the Route with nothing internal in the body —
  `tests/task-graph-concurrency.test.ts`
- Break It Down Candidate acceptance under concurrency: same-Candidate idempotency, sibling
  independence, accept-versus-discard coherence in both invocation orders, dependency ordering in
  both invocation orders with clean retry, Candidate revision start racing acceptance and discard,
  per-project isolation and queue release after a rejected mutation —
  `tests/task-decomposition-acceptance-concurrency.test.ts`
- Context Library and Break It Down import batches under injected filesystem faults: create
  compensation, overwrite staging with exact original-byte preservation at both the staging
  write and the publication rename, attachment compensation and retry, cleanup failures
  retained in redacted Host diagnostics with nothing internal in the response, no fallible read
  after publication, pre-existing files byte-identical, and public conflicts distinct from
  internal failures — `tests/context-import-publication.test.ts`

The repository also has product-rule, provider, cancel and trash failure tests for several of
these modules — `tests/whats-next-harness.test.ts` rejects contradictory advice, unknown origin
nodes and out-of-range proposals, and `tests/task-decomposition-context-workspace.test.ts` covers
content selection and manifest structure. Those prove input validation and product behavior.

**The evidence this audit needs, and does not find, is narrower:** no deterministic test exercises
concurrent filesystem publication, and no test injects a filesystem failure to observe rollback
or cleanup, for What's Next Runs, the Run
context workspace, or Just Do It planning instructions. Their publication behavior under
contention and partial failure is argued from code shape, not demonstrated. Context Library
and Break It Down imports now have the failure half of that evidence; their behavior under
contention remains argued from code shape.

## Confirmed risks and remaining unknowns

No P0 and no P1. Nothing in this inventory demonstrates corruption, a path escape, an unsafe
external effect, or a lost update that has been shown to occur.

**No P2 remains open.** The Task Graph failure and rollback boundaries were closed by
demonstration first; Task Graph _concurrency_ is now closed the same way:

- `updateStartNode` mutated live canonical state before publishing the record that described it.
  Failure injection reproduced an idea document holding the new title while `node.json` still held
  the previous one. Resources are now staged and published through the record rename, and the
  tests fail if the in-place write returns. **That closes the failure boundary, not concurrency.**
  Concurrency was then demonstrated separately and was worse than last-writer-wins: two
  overlapping creates both published into one Canvas, two overlapping updates either failed with a
  raw `EEXIST` or left the committed record pointing at an attachment the loser had deleted, and
  an update paused underneath a concurrent delete resurrected the deleted node. A process-local
  chain keyed by planning path plus graph root now covers `createStartNode`, `updateStartNode` and
  `deleteTaskGraphNode`, and the legacy `whats-next` normalization that listing publishes on the
  read path; the deterministic tests fail if it is removed, if either half of the key is dropped,
  or if the normalization publication is taken back out of the key. **Closed.**
- Break It Down Run acceptance performed a read-modify-write with no serializer. Both demonstrated
  races are closed by a process-local chain over acceptance, discard and Run start, and the
  deterministic tests fail if it is removed.

**P3 — evidence or documentation gap without demonstrated incorrect state:** the Run context
workspace leaving unreferenced orphan directories with no cleanup and no failure test, Task Graph
creation and listing paths lacking tests, and the `wx`-less host job status write. The
serializers are no longer undocumented: `docs/PROCESS_BOUNDARIES.md` names each one, its key and
its limits.

**Genuine unknowns after inspection:**

- Whether two Break It Down accepts interleave through the API under normal single-user use.
- Whether a Candidate acceptance publishing a formal Node can race a `deleteTaskGraphNode` of its
  parent. Acceptance publishes node directories itself under `taskDecompositionMutations` rather
  than through the Task Graph functions, so it is outside the Canvas chain. Adding it would keep
  the lock order acyclic, but no test demonstrates the race and none was added here.
- What reclaims a `system-validation-runner` lock directory left by a killed process.
- Worklog behavior when a revision directory is removed by an external process between listing
  and reading.

No store is marked unknown for not having been read.

## Bounded Item 6 queue

1. ~~**Deterministic concurrency test for Break It Down Run acceptance.**~~ Done. The tests
   demonstrated an idempotency failure and an accept-versus-discard contradiction, which
   justified the process-local chain now covering both operations.
2. ~~**Task Graph create and update failure-boundary tests.**~~ Done. Creation needed two
   error-handling corrections and keeps its directory-rename boundary; update needed immutable
   resource staging so that nothing the record references changes before the record does.
3. ~~**Context Library and Break It Down attachment publication investigation.**~~ Done.
   Failure injection demonstrated partial creation and partial overwrite for Context imports, a
   swallowed cleanup failure and a post-publication listing for attachments, a post-publication
   read for Context imports, and a multipart Context Route answered `415` before the import
   ran. Creation now compensates, overwrite is staged and restored from captured bytes, cleanup
   failures reach Host diagnostics, neither import reads after publication, and the Route
   accepts the form the UI sends. Concurrent imports remain untested and are not queued here.
4. ~~**Document the process-local boundary**~~ Done. `docs/PROCESS_BOUNDARIES.md` names every
   serializer, its runtime property and its real key, states what the chains do and do not
   guarantee, records the one-way lock order, and documents the `system-validation-runner`
   `mkdir` lock together with the ownership, stale-recovery and error-behavior questions any
   general adoption would have to settle.
5. ~~**Deterministic same-process concurrency tests for Task Graph creation and update.**~~ Done.
   The tests demonstrated a violated one-Start invariant, a raw `EEXIST` and a broken resource
   reference between two updates, and a delete-then-update resurrection. A process-local chain
   keyed by planning path plus graph root covers creation, update, deletion and the legacy
   `whats-next` normalization that listing publishes.

The queue is empty. Nothing here proposes a cross-process lock, a startup sweep or a transaction
framework; each remains a separate decision.

## Explicit non-candidates

- **Card worklog.** It already has a directory-rename publication boundary, compare-and-swap
  on the revision name, and tests covering concurrency, interruption and corruption. It must
  not be migrated unless those are shown insufficient.
- **`createStartNode`.** Complete temporary directory, single rename, cleanup on failure.
- **system validation result.** A cache; loss cannot change correctness.
- **Git-backed worktree, artifact and delivery operations.** External repository state.
- **Smoke scripts and one-shot migrations.** Not stores.
- **Run context workspace.** Immutable Run-input evidence; the open item is orphan cleanup, not
  a store migration.

## Appendix: writer-module reconciliation

Every module returned by the discovery commands, and where it went. Nothing is dropped.

| module                                        | disposition                                          |
| --------------------------------------------- | ---------------------------------------------------- |
| `lib/app-settings.ts`                         | canonical — app settings                             |
| `lib/atomic-json-store.ts`                    | shared helper, owns no state                         |
| `lib/card-host-operations.ts`                 | canonical manifest; Git-backed candidate publication |
| `lib/graph-identity-store.ts`                 | canonical — graph identity index                     |
| `lib/host-job-broker.ts`                      | canonical mutable job status; derived output log     |
| `lib/just-do-it-planning-service.ts`          | canonical — planning instructions                    |
| `lib/just-do-it-worklog.ts`                   | canonical revision history; derived HANDOFF/INDEX    |
| `lib/just-do-it-worktree.ts`                  | canonical — workspace record; Git                    |
| `lib/product-context.ts`                      | canonical — Context Library documents                |
| `lib/project-registry.ts`                     | canonical — project registry; Git                    |
| `lib/system-validation-runner.ts`             | cache — validation result; Git; `mkdir` lock         |
| `lib/task-decomposition-context-workspace.ts` | immutable Run-input evidence; P3 orphan-cleanup gap  |
| `lib/task-decomposition-context.ts`           | canonical — feature context and attachments          |
| `lib/task-decomposition-runs.ts`              | canonical — Runs and candidates                      |
| `lib/task-graph.ts`                           | canonical — nodes; derived listing normalization     |
| `lib/whats-next-context.ts`                   | canonical — instructions                             |
| `lib/whats-next-runs.ts`                      | canonical — Runs and candidates                      |
| `scripts/migrate-uuid-aliases.mjs`            | one-shot migration utility, not a store              |
| `scripts/preview-just-do-it-harness.ts`       | fixture generator, not a store                       |
| `scripts/smoke-app-server-code.ts`            | smoke fixture, not a store                           |
| `scripts/smoke-card-worktree.ts`              | smoke fixture, not a store                           |
| `scripts/smoke-codex-simulator.ts`            | smoke fixture, not a store                           |
| `scripts/smoke-coordination.ts`               | smoke fixture, not a store                           |
| `scripts/smoke-just-do-it-execution.ts`       | `mkdtemp` only; no durable record, not a writer      |

Modules invoking `git` but performing no filesystem mutation — `lib/just-do-it-git.ts`,
`lib/just-do-it-artifacts.ts`, `lib/github-delivery.ts` — own no write unit and appear only in
the external repository section.
