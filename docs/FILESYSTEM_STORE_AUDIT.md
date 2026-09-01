# Filesystem Store Inventory

## Evidence boundary

|                            |                                                                    |
| -------------------------- | ------------------------------------------------------------------ |
| base commit                | `3c7af04`                                                          |
| analyzer input fingerprint | `902fab0c3bc67b2cf243dcae416310a7a16f73ea075f29139b2324637cc67b60` |
| command                    | `npm run audit:filesystem-stores`                                  |
| Node runtime               | v26.5.1, also verified on v22.13.0                                 |

`3c7af04` is the base this work started from, not the head that produced these numbers. A
tracked file cannot state its own final commit without going stale on the next amendment,
so the exact delivery head lives in the pull request description and merge record.

The input fingerprint is a SHA-256 over every analyzed source file's path and content hash,
in sorted order. It covers the analyzer itself, which is inside the analyzed roots, and
excludes this document, which is not. If the printed fingerprint differs from the value
above, this report is stale and the command output is authoritative.

## Scope

Analyzed roots: `app`, `bin`, `lib`, `scripts`. Excluded: `.next`, `coverage`, `dist`,
`node_modules`, `out`, `tests`.

The command exits non-zero if any production file under those roots imports `node:fs` but
was not analyzed. That check found and forced the inclusion of `bin/agent-manager.mjs` and
`scripts/migrate-uuid-aliases.mjs`, which an extension filter had initially skipped.

| metric                                           | value |
| ------------------------------------------------ | ----- |
| analyzed files                                   | 113   |
| filesystem operations                            | 314   |
| modules performing writes                        | 23    |
| unresolved filesystem usages                     | 0     |
| production files with filesystem imports omitted | 0     |

Operations by kind: 63 write, 51 mkdir, 42 read, 33 realpath, 33 stat, 25 rename,
21 readdir, 17 remove, 6 trash, 2 link, 2 open, 1 append.

## Method and its limits

The scanner is a **discovery mechanism, not a classifier**. It resolves Node filesystem
imports including aliased named imports and namespace imports, records each call with file,
line, enclosing function, `flag: 'wx'` presence and whether it sits in a `finally` block,
and flags dynamic member access for manual review.

It cannot decide whether a write is canonical, whether concurrent callers are reachable, or
whether a multi-file sequence is a transaction. Every classification below is a manual
reading of the actual read function, write function and failure path. Where a property was
not read directly, it is marked inferred or unknown rather than stated as verified.

## Evidence strength

| level                 | meaning                                                              |
| --------------------- | -------------------------------------------------------------------- |
| mechanically tested   | a deterministic test in this repository fails if the property breaks |
| structurally enforced | the code shape makes the property hold regardless of caller          |
| source-verified       | the read/write/failure path was read directly for this audit         |
| inferred              | consistent with the code but not directly exercised                  |
| unknown               | not established                                                      |

## Summary

| store                     | class                | owner                                | atomic write          | serialization          | multi-file          | evidence                                   | priority        |
| ------------------------- | -------------------- | ------------------------------------ | --------------------- | ---------------------- | ------------------- | ------------------------------------------ | --------------- |
| project registry          | canonical            | `lib/project-registry.ts`            | shared helper         | shared chain, per file | rollback present    | mechanically tested                        | no migration    |
| app settings              | canonical            | `lib/app-settings.ts:69`             | own temp+rename, `wx` | own chain, per file    | single file         | mechanically tested                        | no migration    |
| graph identity index      | canonical            | `lib/graph-identity-store.ts:27`     | own temp+rename, `wx` | own chain              | single file         | source-verified                            | P3              |
| Task Graph nodes          | canonical            | `lib/task-graph.ts:122,251`          | own temp+rename, `wx` | **none**               | 4–5 writes per call | source-verified                            | **P2**          |
| Break It Down Runs        | canonical            | `lib/task-decomposition-runs.ts:409` | own temp+rename, `wx` | **none**               | 2 writes per accept | source-verified                            | **P2**          |
| What's Next Runs          | canonical            | `lib/whats-next-runs.ts:1453`        | own temp+rename, `wx` | per `planningPath`     | up to 5 writes      | source-verified                            | P3              |
| Product Context docs      | canonical            | `lib/product-context.ts:443`         | own temp+rename, `wx` | **none**               | 2 writes on import  | source-verified                            | P2              |
| Break It Down context     | canonical            | `lib/task-decomposition-context.ts`  | own temp+rename, `wx` | **none**               | 2 writes on import  | source-verified                            | P2              |
| What's Next instructions  | canonical            | `lib/whats-next-context.ts`          | own temp+rename, `wx` | **none**               | 2 writes            | source-verified                            | P3              |
| Just Do It planning       | canonical            | `lib/just-do-it-planning-service.ts` | own temp+rename, `wx` | **none**               | single file         | inferred                                   | P2              |
| Card worklog              | evidence, **verify** | `lib/just-do-it-worklog.ts:205`      | temp+rename, 5×`wx`   | **none**               | 6 writes per append | source-verified, classification unresolved | **investigate** |
| Host job records          | evidence             | `lib/host-job-broker.ts`             | temp+rename, no `wx`  | none                   | per job             | source-verified                            | P3              |
| System validation cache   | derived              | `lib/system-validation-runner.ts`    | temp+rename, `wx`     | none                   | single file         | inferred                                   | no migration    |
| Card environment manifest | canonical            | `lib/card-host-operations.ts`        | temp+rename, 2×`wx`   | none                   | 2 writes            | source-verified                            | P3              |
| Card worktree admin       | external repo        | `lib/just-do-it-worktree.ts`         | Git + temp+rename     | none                   | Git transaction     | source-verified                            | keep separate   |
| Card Git checkpoints      | external repo        | `lib/just-do-it-git.ts`              | Git                   | none                   | Git transaction     | source-verified                            | keep separate   |
| Card artifact snapshots   | external repo        | `lib/just-do-it-artifacts.ts`        | Git                   | none                   | Git transaction     | source-verified                            | keep separate   |
| GitHub delivery           | external repo        | `lib/github-delivery.ts`             | Git and `gh`          | none                   | remote transaction  | source-verified                            | keep separate   |
| UUID alias migration      | derived, one-shot    | `scripts/migrate-uuid-aliases.mjs`   | temp+rename, no `wx`  | none                   | 4 writes            | inferred                                   | P3              |
| smoke scripts             | ephemeral fixtures   | `scripts/smoke-*.ts`                 | none                  | none                   | n/a                 | structurally enforced                      | no migration    |

## The finding that matters most

**Two symmetric modules have asymmetric protection.**

`lib/whats-next-runs.ts:1453` serializes every mutation through `mutateWhatsNext`, keyed on
`project.planningPath`:

```ts
const previous = mutations.get(project.planningPath) ?? Promise.resolve();
const next = previous.catch(() => undefined).then(work);
mutations.set(project.planningPath, next);
```

`lib/task-decomposition-runs.ts` — the Break It Down equivalent, with 12 writes and 4
renames — has **no such mechanism**. Its only module-level map is
`__agentManagerRuns?: Map<string, ActiveRun>` at line 1057, which holds live Run handles.
That is ephemeral process state, not write serialization; the scanner would have
misclassified it as a serializer on a name match, which is why classification is manual.

`acceptTaskDecompositionCandidate` at line 409 performs two canonical writes. Its API route
accepts concurrent `PATCH` requests. Whether two accepts can interleave in practice was not
demonstrated, so this is P2 — a credible reachable risk with incomplete mechanical
protection — not P1. Establishing or refuting it needs a deterministic concurrency test,
which Item 6 should write before changing any code.

## Task Graph multi-file writes

`createStartNode` (line 122) performs four writes and `updateStartNode` (line 251) performs
five, with no serialization. `updateStartNode` carries a rollback flag at line 348, set at
390 and used by the catch at 404, and compensates by unlinking newly written attachments at 397.

That is a compensating action, **not a transaction**: a crash between the node write and the
compensation leaves the record inconsistent, and the compensation itself is not tested for
the crash case. `createStartNode` was not read as closely; whether it has equivalent
compensation is **unknown** and is listed as an open question rather than assumed.

## Card worklog needs classification before migration

`lib/just-do-it-worklog.ts:205` `appendCardWorkRecord` performs six writes with five
exclusive creates, and the module reads at line 134 with `readFile`. An append-only evidence
stream would not need to read its own file to append.

If it is genuinely read-modify-write, it is canonical state with an unprotected RMW, not
evidence, and its priority rises. **This audit did not establish which it is.** It is listed
as `investigate` rather than being placed in either class on a guess. Item 6 must not
migrate it before that question is answered.

## Shared helper adoption

Only `lib/project-registry.ts` uses `lib/atomic-json-store.ts`. Fifteen modules implement
their own temporary-write-and-rename. That duplication is not itself a defect — each was
read and each does publish through `rename` — but the mechanisms differ in ways that matter:

- `lib/host-job-broker.ts` writes its temporary file **without** `flag: 'wx'`;
- `scripts/migrate-uuid-aliases.mjs` likewise;
- the rest use `wx`.

`wx` prevents a temporary-name collision from silently truncating another writer's file. Two
implementations lack it. Neither is currently reachable by a second concurrent writer as far
as this audit established, so both are P3.

## Git-backed paths are a separate class

Seven modules invoke `git`: `lib/just-do-it-git.ts` (5), `lib/just-do-it-artifacts.ts` (5),
`lib/github-delivery.ts` (3), `lib/project-registry.ts` (3),
`lib/system-validation-runner.ts` (2), `lib/card-host-operations.ts` (1) and
`lib/just-do-it-worktree.ts` (1).

A Git commit is a transaction for repository content. It does **not** cover companion JSON
records written before or after it, and those records are owned by the stores listed above.
None of these belongs in a JSON-store migration.

This count is itself a correction. An earlier version of this analyzer only recognised a
direct `execFile('git', …)` call and reported one such module. Production code mostly uses
`const exec = promisify(execFile)` and then `exec('git', …)`, so six of the seven were
invisible. A fixture using the `promisify` shape caught it. The detector now matches any
call whose first argument is the string `git`, which over-reports rather than under-reports
— the correct bias for a discovery mechanism.

## Cross-process boundary

Every serialization mechanism found is a `globalThis` Promise chain. **None is a
cross-process lock.** Two AgentManager processes against one `AGENT_MANAGER_HOME` — two
ports, or `dev` and `start` together — do not see each other's chain. `docs/PROJECT_REGISTRY.md`
already states this for the registry; the other three serializers
(`app-settings`, `graph-identity-store`, `whats-next-runs`) do not document it.

## Symlink and containment

Path containment is centralized in `lib/planning-paths.ts` and used by the Task Graph
resource reader, Context references and Just Do It planning sources. Stores that build paths
from fixed internal names rather than user input do not route through it. No store was found
resolving user-supplied relative paths outside that helper.

## Existing tests

Mechanically tested: project registry concurrency and rollback
(`tests/project-registry-atomicity.test.ts`), app settings concurrent partial saves
(`tests/app-settings.test.ts`), planning path containment
(`tests/planning-paths.test.ts`).

**No deterministic concurrency or failure test exists for:** Task Graph node writes, Break It
Down Runs, What's Next Runs, Product Context imports, Just Do It planning records, or the
Card worklog. Their correctness is currently argued from code shape, not demonstrated.

## Prioritized Item 6 candidates

1. **Break It Down Runs** — add a deterministic concurrency test first. If it demonstrates a
   lost update, add serialization mirroring `mutateWhatsNext`. Highest value because a
   symmetric module already proves the pattern.
2. **Task Graph node writes** — establish whether `createStartNode` has compensation, then
   decide between serialization and a real multi-file commit boundary.
3. **Card worklog** — answer the append-versus-RMW question before any migration.
4. **Product Context and Break It Down context imports** — two-write publication without
   rollback; smaller blast radius.
5. **Document the process-local boundary** for `app-settings`, `graph-identity-store` and
   `whats-next-runs`, matching what `docs/PROJECT_REGISTRY.md` already does.

Explicitly **not** migration candidates: Git-backed worktree and exclusion operations, the
system-validation cache, smoke-script fixtures, and host job records unless the worklog
investigation changes their class.

## Unresolved questions

- Does `createStartNode` compensate on failure the way `updateStartNode` does?
- Is `appendCardWorkRecord` append-only or read-modify-write?
- Are two concurrent Break It Down accepts reachable through the API in normal use?
- Do the `wx`-less temporary writes in `host-job-broker` and the migration script have any
  reachable second writer?

None of these is answered by this audit. They are the questions Item 6 must answer before
touching the corresponding code.
