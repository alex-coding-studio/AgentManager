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

| write unit                       | class                           | owner                                         | publication boundary                      | serialization                    | priority     |
| -------------------------------- | ------------------------------- | --------------------------------------------- | ----------------------------------------- | -------------------------------- | ------------ |
| project registry                 | canonical                       | `lib/project-registry.ts`                     | shared helper, `wx` temp + rename         | promise chain, per file          | no migration |
| app settings                     | canonical                       | `lib/app-settings.ts`                         | `wx` temp + rename                        | promise chain, per file          | no migration |
| worklog revision history         | canonical, append-only evidence | `lib/just-do-it-worklog.ts`                   | complete pending directory + rename       | rename is the compare-and-swap   | no migration |
| worklog HANDOFF / INDEX / refs   | derived materialization         | `lib/just-do-it-worklog.ts`                   | inside the same revision directory        | inherited from the revision      | no migration |
| Task Graph node creation         | canonical                       | `lib/task-graph.ts` `createStartNode`         | unique temp directory + rename            | none                             | P3           |
| Task Graph node update           | canonical                       | `lib/task-graph.ts` `updateStartNode`         | **`node.json` only; other effects live**  | none                             | **P2**       |
| Task Graph listing normalization | derived materialization         | `lib/task-graph.ts` `listTaskGraphNodes`      | `wx` temp + rename, on the read path      | none, idempotent                 | P3           |
| Break It Down Runs               | canonical                       | `lib/task-decomposition-runs.ts`              | `wx` temp + rename per artifact           | **none**                         | **P2**       |
| What's Next Runs                 | canonical                       | `lib/whats-next-runs.ts`                      | `wx` temp + rename per artifact           | promise chain, per planning path | P3           |
| Run context workspace            | derived, not reconstructible    | `lib/task-decomposition-context-workspace.ts` | **none**                                  | none                             | **P2**       |
| Break It Down context            | canonical                       | `lib/task-decomposition-context.ts`           | `wx` per attachment; settings create-once | none                             | P3           |
| Context Library documents        | canonical                       | `lib/product-context.ts`                      | `wx` per document; section rename         | none                             | P3           |
| What's Next instructions         | canonical                       | `lib/whats-next-context.ts`                   | `wx` temp + rename                        | none                             | P3           |
| Just Do It planning records      | canonical                       | `lib/just-do-it-planning-service.ts`          | `wx` temp + rename                        | none                             | P3           |
| Card environment manifest        | canonical                       | `lib/card-host-operations.ts`                 | `wx` temp + rename                        | none                             | P3           |
| Card workspace record            | canonical                       | `lib/just-do-it-worktree.ts`                  | `wx` temp + rename                        | none                             | P3           |
| host job events and logs         | append-only evidence            | `lib/host-job-broker.ts`                      | temp + rename, **no `wx`**                | none                             | P3           |
| system validation result         | cache                           | `lib/system-validation-runner.ts`             | `wx` temp + rename                        | **`mkdir` lock, cross-process**  | no migration |

Class totals: 12 canonical, 1 canonical-and-append-only, 1 append-only evidence,
3 derived materialization, 1 cache. External repository state and ephemeral process state own
no JSON write unit and are covered in their own sections below.

## Detailed sections

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

### Break It Down Runs — canonical, P2

`lib/task-decomposition-runs.ts` publishes run records, candidates and graph nodes through
`wx` temporary files and renames, and discards candidates through renames and `trash`.
Structurally it is the twin of What's Next Runs.

**It has no write serializer.** Its only module-level map is
`__agentManagerRuns?: Map<string, ActiveRun>`, which holds live Run handles — ephemeral
process state, not write serialization. `acceptTaskDecompositionCandidate` performs a
read-modify-write across more than one artifact, and its API route accepts concurrent `PATCH`
requests.

**Priority P2.** A lost update is credible and the asymmetry with an otherwise identical
module is concrete, but no test demonstrates that two accepts interleave. That test is the
first item in the Item 6 queue.

### What's Next Runs — canonical

`lib/whats-next-runs.ts` routes every mutation through `mutateWhatsNext`, keyed on
`project.planningPath`, and publishes individual artifacts through `wx` temporary files and
renames. The serializer is process-local; see the cross-process section.

### Run context workspace — derived, not reconstructible, P2

`lib/task-decomposition-context-workspace.ts` `writeTaskDecompositionContextWorkspace`.

**Write path.** Each selected resource is written with `flag: 'wx'` under
`<runPath>/context/`, followed by `index.json` carrying a `sha256` per entry
(`lib/task-decomposition-context-workspace.ts:76-114`). There is **no temporary directory, no
rename and no cleanup on failure** — the one canonical-adjacent write unit in this inventory
with no publication boundary.

**Partial publication is possible.** A failure part-way leaves a `context/` directory holding
some resources and no manifest. Because every file is created exclusively, a retry against the
same run fails `EEXIST` on the first file already present rather than repairing the directory.

**Classification.** At the moment of writing it is derived: its content comes from the source
node, related nodes, context refs, uploads and feature-context attachments. It is **not
reliably reconstructible afterwards**, because it records no version of those inputs and the
canonical sources may change after the Run starts. Once the Run has read it, it is the
evidence of what that Run was given. Treat it as derived-on-write and evidence-thereafter.

**Callers.** `lib/task-decomposition-runs.ts:214` and `lib/whats-next-runs.ts:362`, both
writing into the live run directory rather than into something published later by rename.

**Concurrency reachability.** `runPath` derives from a freshly generated `runId`, so no second
writer contends. The gap is recovery, not concurrency.

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

### Just Do It planning records — canonical

`lib/just-do-it-planning-service.ts` publishes instructions through an `instructions-<uuid>.tmp`
file created with `wx` and one rename (`lib/just-do-it-planning-service.ts:980-984`). Directory
access is guarded by `lstat` against symlinks (`lib/just-do-it-planning-service.ts:118-122`).

### Card environment manifest — canonical

`lib/card-host-operations.ts` `atomicJson` writes a `wx` temporary file and renames
(`lib/card-host-operations.ts:496-503`). `publishCardCandidate` writes the candidate body with
`wx` and removes its temporary directory recursively on failure
(`lib/card-host-operations.ts:382-404`). A missing manifest reads as `null` on `ENOENT`
(`lib/card-host-operations.ts:487-492`).

### Card workspace record — canonical

`lib/just-do-it-worktree.ts` `save` writes `<file>.<uuid>.tmp` with `wx` and renames
(`lib/just-do-it-worktree.ts:62-64`). Reads are guarded by `lstat` against non-files and
symlinks (`lib/just-do-it-worktree.ts:133-136`).

### host job events and logs — append-only evidence

`lib/host-job-broker.ts` `persist` writes its temporary file **without** `flag: 'wx'` and then
renames (`lib/host-job-broker.ts:152-153`). It is the only production temporary-write path
lacking exclusive creation, so a colliding temporary name would truncate rather than fail. The
name is randomised, so no second writer currently reaches it. Job logs are written directly
(`lib/host-job-broker.ts:113`).

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

Four modules serialize through a `globalThis` promise chain: `project-registry`,
`app-settings`, `graph-identity-store` and `whats-next-runs`. **None of those four is a
cross-process lock.** Two AgentManager processes against one `AGENT_MANAGER_HOME` — two ports,
or `dev` and `start` together — do not see each other's chain. `docs/PROJECT_REGISTRY.md`
states this for the registry; the other three do not document it.

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
| `writeTaskDecompositionContextWorkspace` | **none**             | **none**                                        |
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

**No deterministic concurrency or failure test exists for:** Task Graph node creation or
update, Break It Down Runs, What's Next Runs, the Run context workspace, Context Library
imports, or Just Do It planning records. Their correctness is argued from code shape, not
demonstrated.

## Confirmed risks and remaining unknowns

No P0 and no P1. Nothing in this inventory demonstrates corruption, a path escape, an unsafe
external effect, or a lost update that has been shown to occur.

**P2 — credible reachable risk with incomplete mechanical protection:**

- `updateStartNode` mutates live canonical state before publishing the record that describes
  it, with compensation that cannot restore an overwritten idea document.
- Break It Down Run acceptance performs a read-modify-write with no serializer, while the
  structurally identical What's Next module has one.
- The Run context workspace has no publication boundary and cannot be repaired by retry.

**P3 — evidence or documentation gap without demonstrated incorrect state:** Task Graph
creation and listing paths lacking tests, the two `wx`-less temporary writes, and the three
undocumented process-local serializers.

**Genuine unknowns after inspection:**

- Whether two Break It Down accepts interleave through the API under normal single-user use.
- What reclaims a `system-validation-runner` lock directory left by a killed process.
- Worklog behavior when a revision directory is removed by an external process between listing
  and reading.

No store is marked unknown for not having been read.

## Bounded Item 6 queue

1. **Deterministic concurrency test for Break It Down Run acceptance.** Highest value: a
   symmetric module already proves the pattern, so the test either demonstrates a lost update
   or retires the concern. Do not add serialization first.
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

## Appendix: writer-module reconciliation

Every module returned by the discovery commands, and where it went. Nothing is dropped.

| module                                        | disposition                                       |
| --------------------------------------------- | ------------------------------------------------- |
| `lib/app-settings.ts`                         | canonical — app settings                          |
| `lib/atomic-json-store.ts`                    | shared helper, owns no state                      |
| `lib/card-host-operations.ts`                 | canonical — Card environment manifest; Git        |
| `lib/graph-identity-store.ts`                 | canonical — graph identity index                  |
| `lib/host-job-broker.ts`                      | append-only evidence — host job events            |
| `lib/just-do-it-planning-service.ts`          | canonical — planning records                      |
| `lib/just-do-it-worklog.ts`                   | canonical revision history; derived HANDOFF/INDEX |
| `lib/just-do-it-worktree.ts`                  | canonical — workspace record; Git                 |
| `lib/product-context.ts`                      | canonical — Context Library documents             |
| `lib/project-registry.ts`                     | canonical — project registry; Git                 |
| `lib/system-validation-runner.ts`             | cache — validation result; Git; `mkdir` lock      |
| `lib/task-decomposition-context-workspace.ts` | derived-on-write, evidence thereafter             |
| `lib/task-decomposition-context.ts`           | canonical — feature context and attachments       |
| `lib/task-decomposition-runs.ts`              | canonical — Runs and candidates                   |
| `lib/task-graph.ts`                           | canonical — nodes; derived listing normalization  |
| `lib/whats-next-context.ts`                   | canonical — instructions                          |
| `lib/whats-next-runs.ts`                      | canonical — Runs and candidates                   |
| `scripts/migrate-uuid-aliases.mjs`            | one-shot migration utility, not a store           |
| `scripts/preview-just-do-it-harness.ts`       | fixture generator, not a store                    |
| `scripts/smoke-app-server-code.ts`            | smoke fixture, not a store                        |
| `scripts/smoke-card-worktree.ts`              | smoke fixture, not a store                        |
| `scripts/smoke-codex-simulator.ts`            | smoke fixture, not a store                        |
| `scripts/smoke-coordination.ts`               | smoke fixture, not a store                        |
| `scripts/smoke-just-do-it-execution.ts`       | `mkdtemp` only; no durable record, not a writer   |

Modules invoking `git` but performing no filesystem mutation — `lib/just-do-it-git.ts`,
`lib/just-do-it-artifacts.ts`, `lib/github-delivery.ts` — own no write unit and appear only in
the external repository section.
