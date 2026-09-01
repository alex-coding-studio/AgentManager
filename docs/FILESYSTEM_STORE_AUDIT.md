# Filesystem Store Inventory

## Evidence boundary

|                            |                                                                    |
| -------------------------- | ------------------------------------------------------------------ |
| base commit                | `3c7af04`                                                          |
| analyzer input fingerprint | `ff6ad327f48723c86387f6e1faf22c8f6ff3f1fec0a2ae26d715dc4ff332bfbf` |
| command                    | `npm run audit:filesystem-stores`                                  |
| Node runtime               | v26.5.1                                                            |

`3c7af04` is the base this work started from, not the head that produced these numbers. A
tracked file cannot state its own final commit without going stale on the next amendment,
so the exact delivery head lives in the pull request description and merge record.

The input fingerprint is a SHA-256 over every analyzed source file's path and content hash,
in sorted order. It covers the analyzer itself, which is inside the analyzed roots, and
excludes this document, which is not. If the printed fingerprint differs from the value
above, this report is stale and the command output is authoritative.

A matching fingerprint is necessary but **not sufficient** for this document to be current.
The fingerprint proves the analyzed source set is unchanged; it says nothing about whether a
number transcribed into this file was transcribed correctly. Every generated number below is
therefore bound individually by `tests/filesystem-store-audit.test.ts`, which iterates the
analyzer's own metric list and fails if any value is missing from this table. An earlier
revision of this document carried stale per-kind counts behind a matching fingerprint,
because only the totals were bound.

## Scope

Analyzed roots: `app`, `bin`, `lib`, `scripts`. Excluded: `.next`, `coverage`, `dist`,
`node_modules`, `out`, `tests`.

The command exits non-zero if any production file under `app`, `bin`, `components`, `hooks`,
`lib` or `scripts` performs filesystem work but was not analyzed. That check found and forced
the inclusion of `bin/agent-manager.mjs` and `scripts/migrate-uuid-aliases.mjs`, which an
extension filter had initially skipped.

Omission detection reads each unanalyzed file's imports from its parsed syntax tree, not from
source text. It covers `import`, `export … from`, `import =`, `require()`, dynamic `import()`
and `import type`, under either quote style, and reports a file it cannot parse rather than
passing it. A regex over source text preceded this and matched only single-quoted
`node:fs` forms.

| metric                       | value |
| ---------------------------- | ----- |
| analyzed files               | 113   |
| filesystem operations        | 314   |
| modules performing writes    | 23    |
| unresolved filesystem usages | 0     |
| omitted filesystem files     | 0     |

| operation kind      | value |
| ------------------- | ----- |
| append operations   | 1     |
| link operations     | 2     |
| mkdir operations    | 54    |
| open operations     | 2     |
| read operations     | 45    |
| readdir operations  | 23    |
| realpath operations | 33    |
| remove operations   | 17    |
| rename operations   | 28    |
| stat operations     | 35    |
| trash operations    | 6     |
| write operations    | 68    |

The per-kind counts sum to the operation total, and the test asserts that sum rather than
trusting the transcription.

## Method and its limits

The scanner is a **discovery mechanism, not a classifier**. It resolves Node filesystem
imports including aliased named imports and namespace imports, records each call with file,
line, enclosing function, `flag: 'wx'` presence and whether it sits in a `finally` block,
and flags dynamic member access for manual review.

Its per-function output counts **static mutation call sites in source, separated by kind**.
It is not a count of files written at runtime, and this document never presents it as one.
A call site inside a loop executes an unknown number of times; a `rename` publishes a name
rather than writing a file; a `remove` in a `catch` is cleanup. An earlier version of this
analyzer summed create, write, append, remove and trash into one `writes` number and dropped
`rename` entirely, which made every atomic publish look like a multi-file write: the shared
helper's own `writeFileAtomically` — one exclusive create, one rename, one cleanup — was
reported as writing two files.

It cannot decide whether a write is canonical, whether concurrent callers are reachable, or
whether a multi-file sequence is a transaction. Every classification below is a manual
reading of the actual read function, write function and failure path.

## Evidence strength

| level                 | meaning                                                              |
| --------------------- | -------------------------------------------------------------------- |
| mechanically tested   | a deterministic test in this repository fails if the property breaks |
| structurally enforced | the code shape makes the property hold regardless of caller          |
| source-verified       | the read/write/failure path was read directly for this audit         |
| inferred              | consistent with the code but not directly exercised                  |

No row below is marked `unknown`. A store that could not be read is not a finding, it is
unfinished work.

## Reconciliation

The scanner discovered 23 modules performing at least one mutating operation. Every one is
placed in exactly one class here, and
`tests/filesystem-store-audit.test.ts` asserts set equality between the discovered list and
this classification, so a new writer cannot be added without either a row here or a failing
test.

| class                | count | modules                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| canonical write unit | 16    | `app-settings`, `card-host-operations`, `graph-identity-store`, `host-job-broker`, `just-do-it-planning-service`, `just-do-it-worklog`, `just-do-it-worktree`, `product-context`, `project-registry`, `system-validation-runner`, `task-decomposition-context`, `task-decomposition-context-workspace`, `task-decomposition-runs`, `task-graph`, `whats-next-context`, `whats-next-runs` |
| shared helper        | 1     | `atomic-json-store`                                                                                                                                                                                                                                                                                                                                                                      |
| non-store script     | 6     | `migrate-uuid-aliases`, `preview-just-do-it-harness`, `smoke-app-server-code`, `smoke-card-worktree`, `smoke-codex-simulator`, `smoke-coordination`                                                                                                                                                                                                                                      |

Git-invoking modules are **not** a filesystem-store class. Three modules that invoke `git`
— `lib/just-do-it-git.ts`, `lib/just-do-it-artifacts.ts` and `lib/github-delivery.ts` —
perform no direct filesystem mutation at all and therefore do not appear above. An earlier
version of this document listed them as stores in the summary table, which is why its
external-repository count did not reconcile with its own rows.

## Summary

Publication shape is read from the code, not inferred from counts.

| write unit                | owner                                         | publication                         | serialization                   | failure path                | evidence            |
| ------------------------- | --------------------------------------------- | ----------------------------------- | ------------------------------- | --------------------------- | ------------------- |
| project registry          | `lib/project-registry.ts`                     | shared helper, `wx` temp + rename   | shared chain, per file          | restores prior bytes        | mechanically tested |
| app settings              | `lib/app-settings.ts`                         | own `wx` temp + rename              | own chain, per file             | temp left, target intact    | mechanically tested |
| Card worklog              | `lib/just-do-it-worklog.ts`                   | complete pending directory + rename | compare-and-swap on revision    | pending directory ignored   | mechanically tested |
| Task Graph nodes          | `lib/task-graph.ts`                           | unique temp directory + rename      | none                            | temp directory removed      | source-verified     |
| graph identity index      | `lib/graph-identity-store.ts`                 | own `wx` temp + rename              | own chain                       | temp left, target intact    | source-verified     |
| What's Next Runs          | `lib/whats-next-runs.ts`                      | `wx` temp + rename per artifact     | per `planningPath`              | per-artifact                | source-verified     |
| Break It Down Runs        | `lib/task-decomposition-runs.ts`              | `wx` temp + rename per artifact     | **none**                        | per-artifact                | source-verified     |
| Break It Down context     | `lib/task-decomposition-context.ts`           | `wx` per attachment, `wx` settings  | none                            | unlinks every created path  | source-verified     |
| run context workspace     | `lib/task-decomposition-context-workspace.ts` | **`wx` directly into the live run** | none                            | **none**                    | source-verified     |
| Context Library documents | `lib/product-context.ts`                      | `wx` per document, directory rename | none                            | `wx` refuses to overwrite   | source-verified     |
| What's Next instructions  | `lib/whats-next-context.ts`                   | `wx` temp + rename                  | none                            | unlinks temp                | source-verified     |
| Just Do It planning       | `lib/just-do-it-planning-service.ts`          | `wx` temp + rename                  | none                            | temp left, target intact    | source-verified     |
| Card environment manifest | `lib/card-host-operations.ts`                 | `wx` temp + rename; candidate `wx`  | none                            | removes temporary directory | source-verified     |
| Card worktree record      | `lib/just-do-it-worktree.ts`                  | `wx` temp + rename                  | none                            | temp left, target intact    | source-verified     |
| system validation result  | `lib/system-validation-runner.ts`             | `wx` temp + rename                  | **`mkdir` lock, cross-process** | lock released in `finally`  | source-verified     |
| host job events           | `lib/host-job-broker.ts`                      | temp + rename, **no `wx`**          | none                            | temp left, target intact    | source-verified     |

## Detail per write unit

### project registry — `lib/project-registry.ts`

The only consumer of `lib/atomic-json-store.ts`. `createProject` performs the duplicate
check, the filesystem effects and the registry update inside one link of the per-file promise
chain. On write failure the rollback restores the exact prior bytes of the project file, or
removes it when it did not previously exist. Covered by
`tests/project-registry-atomicity.test.ts`, including concurrent creation and rollback of a
pre-existing file.

### app settings — `lib/app-settings.ts`

`updateAppSettings` reads, merges and republishes through a `wx` temporary file and one
`rename`, inside a `globalThis` promise chain keyed per file. Concurrent partial saves are
covered by `tests/app-settings.test.ts`.

### Card worklog — `lib/just-do-it-worklog.ts`

**This is the best-protected store in the repository, and an earlier version of this document
said the opposite.**

`appendCardWorkRecord` reads the current revision, rejects the write when
`current.revision !== expectedRevision` with `Worklog revision conflict.`, then builds the
next revision under `.pending-<uuid>` — every file created with `flag: 'wx'` — and publishes
the whole directory with a single `rename` to the next numeric revision name
(`lib/just-do-it-worklog.ts:267`). A reader never observes a partial revision: an interrupted
append leaves an unreferenced `.pending-` directory and the previous revision remains current.

It is neither append-only nor an unprotected read-modify-write. It reads its own state
because it is doing compare-and-swap, which is the reason to read, not evidence of a defect.

`tests/just-do-it-harness.test.ts:483-675` already proves concurrent and stale overwrite
rejection, that interrupted uncommitted writes are ignored while committed corruption fails
closed, rejection of revision gaps and foreign Card records, and rejection of foreign
identities, unsafe paths and symlinked Cards. An earlier version of this document stated that
no deterministic concurrency test existed for this store. That statement was false, and it was
written without searching for the tests.

### Task Graph nodes — `lib/task-graph.ts`

`createStartNode` validates its input, creates a unique temporary directory
`.<id>-<uuid>.tmp` inside the nodes directory, writes resources and `node.json` into it, and
publishes with one `rename` of that directory onto the node path. Its `catch` removes the
temporary directory recursively. A crash therefore leaves an unreferenced temporary directory
and no partial node — the same boundary the worklog has, without the compare-and-swap.

`updateStartNode` is the weaker path. It carries a rollback flag and compensates by unlinking
newly written attachments, which is a compensating action rather than a transaction: a crash
between the node write and the compensation leaves the record inconsistent. Neither function
serializes, so two concurrent updates to one node can interleave.

### graph identity index — `lib/graph-identity-store.ts`

`atomicJson` is a local re-implementation of the shared helper: `mkdir`, `wx` temporary file,
`rename`. Mutations run through a local `serialized()` promise chain.

### What's Next Runs — `lib/whats-next-runs.ts`

Every mutation goes through `mutateWhatsNext`, keyed on `project.planningPath`. Individual
artifacts publish through `wx` temporary files and `rename`. `discardCandidateFromRun` uses
two renames and two `trash` calls rather than writing.

### Break It Down Runs — `lib/task-decomposition-runs.ts`

Structurally the twin of What's Next Runs — `wx` temporary files, renames, the same candidate
lifecycle — with **no write serializer**. Its only module-level map is
`__agentManagerRuns?: Map<string, ActiveRun>`, which holds live Run handles: ephemeral process
state, not write serialization. A name-matching scanner would have misclassified it, which is
why this classification is manual.

### Break It Down context — `lib/task-decomposition-context.ts`

`importTaskDecompositionAttachments` writes each attachment with `flag: 'wx'` and, on failure,
unlinks every path it created in that call. `settings.json` is written with `wx` and an
explicit `EEXIST` tolerance, making it create-once rather than republishable.

### run context workspace — `lib/task-decomposition-context-workspace.ts`

**The one canonical write unit with no atomic publication boundary.**

`writeTaskDecompositionContextWorkspace` writes each selected resource, then `index.json`,
directly into `<runPath>/context/` with `flag: 'wx'`. There is no temporary directory, no
`rename`, and no cleanup on failure. A failure part-way through leaves a partial `context/`
directory with no manifest, and because every file is created exclusively, a retry against the
same run fails `EEXIST` on the first file already present rather than repairing the directory.

Reachability is limited: `runPath` derives from a freshly generated `runId`, so under normal
operation the directory is new and no second writer exists. The gap is recovery, not
concurrency. Both callers — `lib/task-decomposition-runs.ts:214` and
`lib/whats-next-runs.ts:362` — write into the live run directory rather than into something
they later publish by rename.

An earlier version of this document had no row for this module at all.

### Context Library documents — `lib/product-context.ts`

Each document is its own unit, created with `flag: 'wx'` through `writeIfMissing` and
`writeUniqueMarkdown`, so a name collision fails instead of silently overwriting. The single
`rename` is `renameContextSection`, which renames a section directory. There is no
read-modify-write cycle to protect.

### What's Next instructions — `lib/whats-next-context.ts`

`saveWhatsNextInstructions` writes a `wx` temporary file, renames it onto `instructions.md`,
and unlinks the temporary file if the publish fails.

### Just Do It planning — `lib/just-do-it-planning-service.ts`

`savePlanningInstructions` publishes through an `instructions-<uuid>.tmp` file created with
`wx` and one `rename`.

### Card environment manifest — `lib/card-host-operations.ts`

`atomicJson` matches the shared helper's shape. `publishCardCandidate` writes the candidate
body with `wx` and removes its temporary directory recursively on failure. The module also
invokes `git` once; that invocation belongs to the repository, not to this JSON store.

### Card worktree record — `lib/just-do-it-worktree.ts`

`save` writes `<file>.<uuid>.tmp` with `wx` and renames it onto the record. The module's one
`git` invocation manages the worktree itself, which is outside this store's boundary.

### system validation result — `lib/system-validation-runner.ts`

The result is published through a `wx` temporary file and one `rename`. More importantly, the
runner guards the whole validation with a **cross-process mutual exclusion primitive**:

```ts
await mkdir(path.dirname(lockDirectory), { recursive: true });
try {
  await mkdir(lockDirectory);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST')
    throw new Error(`System validation resource is busy: ${request.profile.resource}`);
```

A non-recursive `mkdir` either creates the directory or fails `EEXIST`, atomically, at the
filesystem level. Unlike every promise chain in this codebase, a second process sees this
lock. It is released in a `finally`.

Its limits are equally concrete: it is non-blocking rather than queuing, so a contending
caller is rejected rather than delayed, and it carries no owner or timestamp, so a hard
process kill leaves a stale lock directory that nothing reclaims.

### host job events — `lib/host-job-broker.ts`

`persist` writes its temporary file **without** `flag: 'wx'` and then renames. It is the only
temporary-write path in production that can have its temporary file truncated by a colliding
writer. The temporary name is randomised, so the collision is not currently reachable, but the
missing flag is a deviation from every other implementation.

## Shared helper adoption

Only `lib/project-registry.ts` uses `lib/atomic-json-store.ts`. Fifteen further modules
implement their own temporary-write-and-rename. That duplication is not itself a defect —
each was read and each does publish through `rename` — but two omit `flag: 'wx'`:
`lib/host-job-broker.ts` and `scripts/migrate-uuid-aliases.mjs`.

`wx` prevents a temporary-name collision from silently truncating another writer's file.
Neither omission is currently reachable by a second concurrent writer.

## Git-backed paths are a separate class

Seven modules invoke `git`: `lib/just-do-it-git.ts` (5), `lib/just-do-it-artifacts.ts` (5),
`lib/github-delivery.ts` (3), `lib/project-registry.ts` (3),
`lib/system-validation-runner.ts` (2), `lib/card-host-operations.ts` (1) and
`lib/just-do-it-worktree.ts` (1).

Three of those seven perform no direct filesystem mutation and appear in no class in the
reconciliation above. A Git commit is a transaction for repository content. It does **not**
cover companion JSON records written before or after it, and those records are owned by the
stores listed above. None of these belongs in a JSON-store migration.

This count is itself a correction. An earlier version of this analyzer only recognised a
direct `execFile('git', …)` call and reported one such module. Production code mostly uses
`const exec = promisify(execFile)` and then `exec('git', …)`, so six of the seven were
invisible. A fixture using the `promisify` shape caught it. The detector now matches any call
whose first argument is the string `git`, which over-reports rather than under-reports — the
correct bias for a discovery mechanism.

## Cross-process boundary

Four modules serialize through a `globalThis` promise chain: `project-registry`,
`app-settings`, `graph-identity-store` and `whats-next-runs`. **None of those four is a
cross-process lock.** Two AgentManager processes against one `AGENT_MANAGER_HOME` — two
ports, or `dev` and `start` together — do not see each other's chain.
`docs/PROJECT_REGISTRY.md` states this for the registry; the other three do not document it.

`lib/system-validation-runner.ts` is the exception and the counter-example: its `mkdir` lock
does hold across processes. The primitive that would extend cross-process exclusion to the
other stores already exists in this codebase.

## Symlink and containment

Path containment is centralized in `lib/planning-paths.ts` and used by the Task Graph resource
reader, Context references and Just Do It planning sources. Stores that build paths from fixed
internal names rather than user input do not route through it. No store was found resolving
user-supplied relative paths outside that helper.

## Existing tests

Mechanically tested: project registry concurrency and rollback
(`tests/project-registry-atomicity.test.ts`), app settings concurrent partial saves
(`tests/app-settings.test.ts`), Card worklog compare-and-swap, interrupted writes, committed
corruption, revision gaps, foreign identities and symlinked Cards
(`tests/just-do-it-harness.test.ts:483-675`), planning path containment
(`tests/planning-paths.test.ts`).

**No deterministic concurrency or failure test exists for:** Task Graph node writes, Break It
Down Runs, What's Next Runs, Context Library imports, the run context workspace, or Just Do It
planning records. Their correctness is currently argued from code shape, not demonstrated.

## Prioritized Item 6 candidates

1. **Break It Down Runs** — add a deterministic concurrency test first. If it demonstrates a
   lost update, add serialization mirroring `mutateWhatsNext`. Highest value because a
   symmetric module already proves the pattern.
2. **Run context workspace** — the only canonical write unit with no publication boundary.
   Writing into a temporary directory and publishing `context/` with one rename matches what
   `createStartNode` already does a few modules away.
3. **Task Graph `updateStartNode`** — replace compensation with a publication boundary.
   `createStartNode` in the same file is the model; no new mechanism is required.
4. **Document the process-local boundary** for `app-settings`, `graph-identity-store` and
   `whats-next-runs`, matching what `docs/PROJECT_REGISTRY.md` already does, and record the
   `mkdir` lock in `system-validation-runner` as the available cross-process option.
5. **Add `flag: 'wx'`** to the two temporary writes that lack it.

Explicitly **not** migration candidates: the Card worklog, which already has both a
publication boundary and compare-and-swap; `createStartNode`; Git-backed worktree and
exclusion operations; and smoke-script fixtures.

## Unresolved questions

- Are two concurrent Break It Down accepts reachable through the API in normal use?
- Should the `mkdir` lock in `system-validation-runner` become the general cross-process
  primitive, and if so what reclaims a lock left by a killed process?

Neither is answered by this audit. They are the questions Item 6 must answer before touching
the corresponding code.
