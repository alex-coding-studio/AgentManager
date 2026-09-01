# Project Registry Updates

The machine registry at `~/.agent-manager/config.json` (or `AGENT_MANAGER_HOME`) is
the list of every project this machine knows about. Registering a project also writes
`<project-root>/.agent-manager/project.json` and appends to that repository's
`.git/info/exclude`. Those three effects have to agree.

## The defect this replaces

`createProject` used to read the registry, perform its filesystem effects, and then
write the whole registry back. Two registrations that overlapped both read the same
starting list, and the second write replaced the first. Eight concurrent
registrations left one saved project.

The losing calls had already created `.agent-manager/`, appended to
`.git/info/exclude` and written `project.json`. Nothing reported an error, so the
user saw a project that had silently failed to register while its files were on
disk.

## The mechanism

`lib/atomic-json-store.ts` provides `createJsonStore(file, fallback)` with two
operations:

- `read()` parses the file, returning `fallback()` when it does not exist.
- `update(mutate)` runs `mutate` against a freshly read value and writes the result.

`update` calls are chained per file through a `Map` held on `globalThis`, so a second
call waits for the first to finish before it reads. The read, the decision and the
write happen inside one link of that chain, which is what makes the whole
read-modify-write sequence atomic rather than only the final write.

The write itself goes to `<file>.<uuid>.tmp` opened with `flag: 'wx'` and is then
renamed over the target. `wx` fails rather than truncating if that temporary name
somehow exists, and `rename` within a directory is atomic, so a reader never observes
a partially written registry.

`globalThis` holds the chain because Next.js reloads modules during development; a
module-level `Map` would be replaced on reload and stop serializing. `lib/app-settings.ts`
already used this shape, and this store generalizes it.

## Ordering and rollback in `createProject`

Argument validation and the directory check happen before entering the chain, so a
bad request never blocks other writers.

Inside the chain, in order:

1. reject a `rootPath` already present in the freshly read registry;
2. create `.agent-manager/`, append the Git exclusion, write `project.json`;
3. return the new registry value.

`project.json` is published atomically — written to a temporary file and renamed over
the target, with the temporary removed if either step fails. A failure while writing
it therefore cannot leave a truncated file, including before the mutation has returned
its rollback callback.

Before publishing, `createProject` reads any existing `project.json` and keeps its
exact bytes. If the registry write then fails, the store calls the mutation's
`rollback`, which either restores those bytes or, when the file did not exist,
removes the one this call created. Rollback never deletes metadata this registration
did not author.

That distinction matters specifically because of the bug being fixed: a directory
left behind by the old lost-update path has a `project.json` and no registry entry.
Retrying registration there and having it fail must not destroy the local evidence
needed to reconcile it.

If the rollback itself fails, the store raises `StoreConsistencyError` carrying both
the original write error and the restoration error. A caller can never mistake an
unrecovered inconsistency for a clean rollback.

The `.git/info/exclude` append is deliberately not rolled back. It is idempotent,
harmless on its own, and may reflect what the user wants regardless of registration.

## What this does not cover

`docs/PROCESS_BOUNDARIES.md` states this for every serializer in the codebase, including this
one, and records the single cross-process primitive that exists today.

**The boundary is process-local.** The chain lives in one Node process. Two
AgentManager servers pointed at the same `AGENT_MANAGER_HOME` — two ports, or a `dev`
and a `start` process at once — do not see each other's chain, and their
read-modify-write sequences can still interleave and lose an update. The atomic
rename keeps each individual write whole, so the file is never corrupt, but a
concurrent update from another process can still be overwritten.

This is the expected shape for a local-first single-user tool that runs one server.
Supporting multiple writers would need a real file lock, which is not implemented and
should not be assumed.

Only `project-registry` uses this store. The other filesystem-backed stores still
carry their own write logic; migrating them is separate work with its own risk.

## Verification

```bash
npm run test:registry
```

The suite registers eight projects concurrently and asserts all eight are saved with
distinct identities, that each has a matching `project.json`, that an unrelated saved
project is untouched by a later write, that the schema version and project field
shape are unchanged, that four concurrent registrations of one directory admit
exactly one, and that a rejected registration leaves no partial local state.

Four tests cover the failure boundary specifically: a failed registry write restores
a pre-existing `project.json` byte for byte, removes the file only when this
registration created it, surfaces a failed rollback as `StoreConsistencyError`
instead of swallowing it, and leaves no partial metadata when the `project.json`
write itself fails.
