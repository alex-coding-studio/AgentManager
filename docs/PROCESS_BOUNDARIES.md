# Process-local and cross-process boundaries

## What this document is for

Six modules in this codebase serialize concurrent callers through an in-process queue. A seventh
mechanism, in `lib/system-validation-runner.ts`, is not a queue at all: it is a filesystem lock
that refuses a contending caller, and it is the only thing here another process can see. The
difference matters — every one of the six queues orders work inside a single Node process only,
and reading any of them as mutual exclusion over the data directory is wrong.

`docs/PROJECT_REGISTRY.md` already states this for the registry. This document is the shared
statement for every serializer, so the per-store sections of
`docs/FILESYSTEM_STORE_AUDIT.md` do not repeat it.

## The process-local promise chains

Each of these is a `Map<string, Promise<unknown>>` held on `globalThis`. A caller appends its
work to the promise stored under its key, replaces the entry, and deletes the entry when its
own link is still the tail. `globalThis` holds the map because Next.js reloads modules during
development; module-level state would otherwise reset and let two chains run against one key.

| module                           | runtime property             | key                                                       |
| -------------------------------- | ---------------------------- | --------------------------------------------------------- |
| `lib/atomic-json-store.ts`       | `atomicJsonStoreWrites`      | the absolute store file path                              |
| `lib/app-settings.ts`            | `appSettingsWrites`          | `<AGENT_MANAGER_HOME>/settings.json`                      |
| `lib/graph-identity-store.ts`    | `graphIdentityState.pending` | `<planningPath>/<task-graph\|whats-next>/identities.json` |
| `lib/task-decomposition-runs.ts` | `taskDecompositionMutations` | `project.planningPath`                                    |
| `lib/whats-next-runs.ts`         | `whatsNextMutations`         | `project.planningPath`                                    |
| `lib/task-graph.ts`              | `taskGraphMutations`         | `resolve(project.planningPath)` + `NUL` + graph root      |

`lib/project-registry.ts` owns no chain of its own; it is the only consumer of
`lib/atomic-json-store.ts` and inherits that module's per-file chain.

The properties these chains have, and the ones they do not:

1. **They are process-local.** The map lives in one Node process's `globalThis`. Nothing about
   it is written to disk or announced to any other process.
2. **They serialize callers only inside that process.** Two callers in one process that use the
   same key run one after the other; that is the whole of the guarantee.
3. **Two AgentManager processes do not share them.** Two servers on different ports against one
   `AGENT_MANAGER_HOME`, or two processes against one planning root, each hold their own map and
   are invisible to each other.
4. **Running `dev` and `start` together is not protected.** That is the same case as (3), and it
   is the one a developer reaches by accident. The chains do nothing for it.
5. **The keys differ, and independence follows the key.** A settings write and an identity write
   never share a key. Two projects never share `taskDecompositionMutations` or
   `whatsNextMutations`. The Task Graph key carries the graph root as well, so a `task-graph`
   mutation and a `whats-next` mutation in one project run concurrently by design;
   `tests/task-graph-concurrency.test.ts` fails if either half of that key is dropped.
6. **A rejected mutation releases its key.** Every chain appends through `previous.catch(() =>
undefined).then(work)`, so a rejection does not poison the tail, and the `finally` deletes the
   entry when the rejected link is still the tail. The next caller for that key runs.
7. **Independent keys stay independent.** There is no shared root promise; a slow or failing
   mutation under one key never delays another.
8. **None of them is a filesystem lock.** They hold no file, no directory and no descriptor. A
   crash loses the queue with the process and leaves nothing to reclaim.

### Lock order

Only one nesting exists, and it runs one way:

```text
taskDecompositionMutations / whatsNextMutations  (planningPath)
  -> taskGraphMutations                          (planningPath + graph root)
    -> graphIdentityState.pending                (identities.json)
```

Break It Down and What's Next hold their planning-path chain across calls to
`listTaskGraphNodes`, and that call takes `taskGraphMutations` whenever it has legacy
`whats-next` defaults to publish — that is the middle edge, and it is real. `lib/task-graph.ts`
imports nothing from either higher-level module, so the reverse edge does not exist and the order
is acyclic. The Task Graph chain in turn calls the identity store, which never calls back.

Re-entrancy is avoided by composition, not by a re-entrant lock. Each of `createStartNode`,
`updateStartNode` and `deleteTaskGraphNode` enters the key once and then runs unqueued
internals, including an unqueued listing that publishes its normalization inline because the
caller already holds the key. No caller ever waits on a key it already holds.

## The one cross-process primitive

`lib/system-validation-runner.ts:68-79` takes a non-recursive `mkdir` on a lock directory named
by the SHA-256 of the validation resource, under `<cacheRoot>/system-runs/locks/`.

- **`mkdir` is atomic cross-process exclusion for one lock path.** The filesystem either creates
  the directory or fails `EEXIST`; a second process does see the first process's lock.
- **Contention returns busy instead of waiting.** The `EEXIST` branch throws
  `System validation resource is busy: <resource>`. There is no queue and no retry.
- **The lock has no owner, PID, timestamp or lease.** The directory is empty and carries no
  identity.
- **A hard-killed process can leave a stale lock.** Release happens in a `finally`
  (`lib/system-validation-runner.ts:120-122`), which a `SIGKILL` or a power loss does not run.
- **Nothing reclaims a stale lock.** No sweep, no startup pass, no expiry. The resource stays
  busy until the directory is removed by hand.
- **It is specific to system-validation resources.** It guards one long external command per
  resource, where refusing a second caller is the correct answer.

**It is not automatically a general store lock.** A store that serializes read-modify-write
needs callers to wait, not to be refused, and needs a stale lock to become reclaimable without
manual intervention. Adopting this primitive elsewhere requires a separate design for ownership
(who holds it), stale recovery (how a lock outliving its process is released safely) and error
behavior (what a contending caller is told). None of that exists today, and none of it is
implied by the fact that `mkdir` is atomic.

## What is therefore still unprotected

Every store in `docs/FILESYSTEM_STORE_AUDIT.md` is unprotected against a second AgentManager
process. The chains above narrow the exposure to the multi-process case; they do not remove it.
