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

| write unit                       | class                           | owner                                         | publication boundary                      | serialization                          | priority     |
| -------------------------------- | ------------------------------- | --------------------------------------------- | ----------------------------------------- | -------------------------------------- | ------------ |
| project registry                 | canonical                       | `lib/project-registry.ts`                     | shared helper, `wx` temp + rename         | promise chain, per file                | no migration |
| app settings                     | canonical                       | `lib/app-settings.ts`                         | `wx` temp + rename                        | promise chain, per file                | no migration |
| worklog revision history         | canonical, append-only evidence | `lib/just-do-it-worklog.ts`                   | complete pending directory + rename       | rename is the compare-and-swap         | no migration |
| worklog HANDOFF / INDEX / refs   | derived materialization         | `lib/just-do-it-worklog.ts`                   | inside the same revision directory        | inherited from the revision            | no migration |
| Task Graph node creation         | canonical                       | `lib/task-graph.ts` `createStartNode`         | unique temp directory + rename            | none                                   | P3           |
| Task Graph node update           | canonical                       | `lib/task-graph.ts` `updateStartNode`         | **`node.json` only; other effects live**  | none                                   | **P2**       |
| Task Graph listing normalization | derived materialization         | `lib/task-graph.ts` `listTaskGraphNodes`      | `wx` temp + rename, on the read path      | none, idempotent                       | P3           |
| Break It Down Runs               | canonical                       | `lib/task-decomposition-runs.ts`              | `wx` temp + rename per artifact           | process-local chain, per planning path | no migration |
| What's Next Runs                 | canonical                       | `lib/whats-next-runs.ts`                      | `wx` temp + rename per artifact           | promise chain, per planning path       | P3           |
| Run context workspace            | immutable Run-input evidence    | `lib/task-decomposition-context-workspace.ts` | **none**                                  | none                                   | P3           |
| Break It Down context            | canonical                       | `lib/task-decomposition-context.ts`           | `wx` per attachment; settings create-once | none                                   | P3           |
| Context Library documents        | canonical                       | `lib/product-context.ts`                      | `wx` per document; section rename         | none                                   | P3           |
| What's Next instructions         | canonical                       | `lib/whats-next-context.ts`                   | `wx` temp + rename                        | none                                   | P3           |
| Just Do It planning instructions | canonical                       | `lib/just-do-it-planning-service.ts`          | `wx` temp + rename                        | none                                   | P3           |
| Card environment manifest        | canonical                       | `lib/card-host-operations.ts` `atomicJson`    | `wx` temp + rename                        | none                                   | P3           |
| Card workspace record            | canonical                       | `lib/just-do-it-worktree.ts`                  | `wx` temp + rename                        | none                                   | P3           |
| host job status record           | canonical, mutable              | `lib/host-job-broker.ts`                      | temp + rename, **no `wx`**, overwritten   | none                                   | P3           |
| host job output log              | derived output                  | `lib/host-job-broker.ts`                      | written once at completion                | none                                   | no migration |
| system validation result         | cache                           | `lib/system-validation-runner.ts`             | `wx` temp + rename                        | **`mkdir` lock, cross-process**        | no migration |

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

`lib/task-graph.ts` `createStartNode`.

**Write path.** After validation, it creates `.<id>-<uuid>.tmp` inside the nodes directory,
writes resources and `node.json` into it, and publishes with one directory rename
(`lib/task-graph.ts:179-243`).

**Failure path.** The `catch` removes the temporary directory recursively and with `force`,
so a pre-publication failure leaves no partial node.

**Crash boundary.** A kill between the last write and the rename leaves a dot-prefixed
temporary directory. Listing reads `node.json` under each entry it enumerates, so a leftover
directory is inert only because it is never enumerated as a node; nothing reclaims it.

**Post-rename behavior.** Publication is a single directory rename, so a reader either sees no
node or the complete node. The rename target is a fresh id, so it cannot replace an existing
node.

**Concurrency reachability.** Two creations use distinct ids and distinct temporary names, so
they do not contend.

**Not proven.** No test exercises the failure path or the crash boundary.

### Task Graph node update — canonical, P2

`lib/task-graph.ts` `updateStartNode` is **not one transaction**. It performs five distinct
effects, and only one of them has a publication boundary:

1. **New attachments** are written with `flag: 'wx'` directly into the live
   `resources` directory (`lib/task-graph.ts:354-360`), not into a temporary location.
2. **The idea document is rewritten in place** — `writeFile` onto the existing resource path
   with no `wx`, no temporary file and no rename (`lib/task-graph.ts:362-367`).
3. **`node.json` is published** through a temporary file and one rename, after which
   `committed` is set (`lib/task-graph.ts:384-391`).
4. **Pre-commit cleanup**: if the operation throws while `committed` is false, the newly
   written attachments are unlinked, each with its error swallowed
   (`lib/task-graph.ts:405-410`).
5. **Post-commit deletion**: attachments no longer retained are unlinked after the commit,
   each with its error swallowed (`lib/task-graph.ts:393-398`).

Effects 1 and 2 mutate live canonical state **before** effect 3 publishes the record that
describes it. A crash between them leaves the idea document rewritten while `node.json` still
describes the previous state — contradictory canonical state that no compensation addresses,
because effect 4 only removes attachments and only when the throw is observed.

Effect 4 is compensation, not rollback: it cannot restore the overwritten idea document, and
it ignores its own failures. Effect 5 runs after the commit, so a crash there leaves orphaned
attachment files, which is untidy but not contradictory.

**Priority P2, not P1.** The contradictory state is visible in the code path but has not been
demonstrated by a test, and the reachability of an interleaved second writer has not been
established. Item 6 should write the failure-boundary test that decides between P1 and no
change before any code moves.

### Task Graph listing normalization — derived

`listTaskGraphNodes` validates each node on read and throws on a malformed record. For the
`whats-next` graph root only, a node missing `layer` or `artifactKind` is given defaults and
**written back on the read path** through a `wx` temporary file and a rename
(`lib/task-graph.ts:105-114`).

This makes listing a mutating operation. Two concurrent listings each write their own uniquely
named temporary file and rename it, producing the same content, so the outcome is idempotent
rather than racy. The practical consequences are that a read-only filesystem makes listing
fail, and that a node's on-disk bytes can change without any user-visible edit.

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
case into the existing `The Candidate proposal is unavailable.`, leaving
`readTaskDecompositionRun` and every other caller unchanged.

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

`lib/task-decomposition-context.ts` writes each attachment with `flag: 'wx'` and, on failure,
unlinks every path it created in that call (`lib/task-decomposition-context.ts:151-157`). That
is genuine multi-file compensation, scoped to one call. `settings.json` is written with `wx`
and an explicit `EEXIST` tolerance (`lib/task-decomposition-context.ts:210-215`), making it
create-once rather than republishable.

### Context Library documents — canonical

`lib/product-context.ts` treats each document as its own unit, created with `flag: 'wx'`
through `writeIfMissing` and `writeUniqueMarkdown`, so a name collision fails rather than
silently overwriting. The one `rename` is `renameContextSection`, which renames a section
directory. There is no read-modify-write cycle to protect. `importContextDocuments` writes
several documents in one call with no cross-document rollback.

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

Five modules serialize through a `globalThis` promise chain: `project-registry`,
`app-settings`, `graph-identity-store`, `whats-next-runs` and `task-decomposition-runs`.
**None of those five is a cross-process lock.** Two AgentManager processes against one
`AGENT_MANAGER_HOME` — two ports, or `dev` and `start` together — do not see each other's chain.
`docs/PROJECT_REGISTRY.md` states this for the registry; the other four do not document it.

`lib/system-validation-runner.ts:68-79` is the exception. A non-recursive `mkdir` either
creates the lock directory or fails `EEXIST`, atomically, at the filesystem level, and the
`EEXIST` branch reports the resource as busy. A second process does see this lock. It is
released in a `finally` (`lib/system-validation-runner.ts:120-122`).

Its limits are equally concrete: it is non-blocking rather than queuing, so a contending caller
is rejected instead of delayed, and it records no owner or timestamp, so a hard process kill
leaves a stale lock directory that nothing reclaims.

The primitive that would extend cross-process exclusion to the other stores already exists in
this codebase.

## Multi-file publication and rollback findings

| operation                                | boundary             | rollback                                        |
| ---------------------------------------- | -------------------- | ----------------------------------------------- |
| `appendCardWorkRecord`                   | one directory rename | pending directory removed in `finally`          |
| `createStartNode`                        | one directory rename | temporary directory removed on failure          |
| `updateStartNode`                        | **only `node.json`** | compensation for attachments; none for the idea |
| `writeTaskDecompositionContextWorkspace` | **none**             | none; failure orphans an unregistered directory |
| `importTaskDecompositionAttachments`     | per file             | unlinks every path created in the call          |
| `importContextDocuments`                 | per file             | none across documents                           |
| `createProject`                          | shared helper        | restores the prior bytes                        |

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
- Break It Down Candidate acceptance under concurrency: same-Candidate idempotency, sibling
  independence, accept-versus-discard coherence in both invocation orders, dependency ordering in
  both invocation orders with clean retry, Candidate revision start racing acceptance and discard,
  per-project isolation and queue release after a rejected mutation —
  `tests/task-decomposition-acceptance-concurrency.test.ts`

The repository also has product-rule, provider, cancel and trash failure tests for several of
these modules — `tests/whats-next-harness.test.ts` rejects contradictory advice, unknown origin
nodes and out-of-range proposals, and `tests/task-decomposition-context-workspace.test.ts` covers
content selection and manifest structure. Those prove input validation and product behavior.

**The evidence this audit needs, and does not find, is narrower:** no deterministic test exercises
concurrent filesystem publication, and no test injects a filesystem failure to observe rollback
or cleanup, for Task Graph node creation or update, What's Next Runs, the Run
context workspace, Context Library imports, or Just Do It planning instructions. Their publication
behavior under contention and partial failure is argued from code shape, not demonstrated.

## Confirmed risks and remaining unknowns

No P0 and no P1. Nothing in this inventory demonstrates corruption, a path escape, an unsafe
external effect, or a lost update that has been shown to occur.

**P2 — credible reachable risk with incomplete mechanical protection:**

- `updateStartNode` mutates live canonical state before publishing the record that describes it,
  with compensation that cannot restore an overwritten idea document.
- Break It Down Run acceptance previously performed a read-modify-write with no serializer.
  Both demonstrated races are now closed by a process-local chain over acceptance and discard,
  and the deterministic tests fail if it is removed.

**P3 — evidence or documentation gap without demonstrated incorrect state:** the Run context
workspace leaving unreferenced orphan directories with no cleanup and no failure test, Task Graph
creation and listing paths lacking tests, the `wx`-less host job status write, and the three
undocumented process-local serializers.

**Genuine unknowns after inspection:**

- Whether two Break It Down accepts interleave through the API under normal single-user use.
- What reclaims a `system-validation-runner` lock directory left by a killed process.
- Worklog behavior when a revision directory is removed by an external process between listing
  and reading.

No store is marked unknown for not having been read.

## Bounded Item 6 queue

1. ~~**Deterministic concurrency test for Break It Down Run acceptance.**~~ Done. The tests
   demonstrated an idempotency failure and an accept-versus-discard contradiction, which
   justified the process-local chain now covering both operations.
2. **Task Graph create and update failure-boundary tests.** Establish what a crash leaves
   behind before choosing between serialization, a real publication boundary, or no change.
3. **Context Library and Break It Down attachment publication investigation.** Both write
   several files per call with per-file rather than per-call boundaries.
4. **Document the process-local boundary** for `app-settings`, `graph-identity-store` and
   `whats-next-runs`, matching `docs/PROJECT_REGISTRY.md`, and record the
   `system-validation-runner` `mkdir` lock as the available cross-process option.

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
