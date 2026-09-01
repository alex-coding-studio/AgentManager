# Runtime Dependency Audit

## Analyzed head

|                                          |                                            |
| ---------------------------------------- | ------------------------------------------ |
| base and head commit                     | `45b5e2b20967629f21d519d026e636643984a39a` |
| command                                  | `npm run audit:runtime-dependencies`       |
| Node runtime                             | v26.5.1, also verified on v22.13.0         |
| TypeScript                               | 5.9.3, already a repository dependency     |
| network, Agent, browser or GitHub access | none                                       |

## Why this audit exists

`reports/code-quality-audit-2026-09-01.md` recorded twelve circular dependencies found
with Madge. That tool does not distinguish TypeScript type-only imports, which are erased
before any code runs. A number produced that way cannot decide whether a module boundary
is a real runtime problem.

This audit rebuilds the graph from the TypeScript compiler API, separates runtime edges
from erased ones, and reports strongly connected components with file-and-line evidence.

## Scope

Analyzed source roots: `app`, `bin`, `components`, `hooks`, `lib`, `scripts`.

| exclusion                          | why it cannot hide an owned runtime cycle                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tests`                            | test files are never imported by production modules; an edge from a test cannot close a production cycle       |
| `components/ui`                    | vendored shadcn output; owned modules import it but it imports no owned module, so it can only be a graph leaf |
| `.next`, `out`, `dist`, `coverage` | build and report output, regenerated from the analyzed sources                                                 |
| `node_modules`                     | external packages are recorded as specifiers, never as nodes                                                   |

External packages are counted as specifiers and never become graph nodes, so no cycle can
be routed through one.

`components/ui` deserves the explicit argument: it is excluded as a _node_, and an owned
module importing it produces no edge. That is safe only because those files import nothing
from `app`, `components`, `hooks`, `lib`, `scripts` or `bin`. If a vendored file ever
imported an owned module, this exclusion would need to change.

## Runtime surfaces

Entry points are classified so unrelated executables are not silently merged:

| surface             | entry points |
| ------------------- | ------------ |
| next-application    | 27           |
| node-cli            | 1            |
| maintenance-scripts | 12           |

`lib` is shared between surfaces. Modules are analyzed as one graph because a shared module
is genuinely the same file at runtime, but every reported component records which surfaces
can reach it. Two files do not gain an edge merely by living in the same repository — only
an actual import creates one.

## What counts as a runtime edge

| form                                                            | runtime edge                      |
| --------------------------------------------------------------- | --------------------------------- |
| `import { value } from './m'`                                   | yes, `static-import`              |
| `import { type A, value } from './m'`                           | yes, at least one runtime binding |
| `import './m'`                                                  | yes, `side-effect-import`         |
| `export { value } from './m'`                                   | yes, `runtime-re-export`          |
| `export * from './m'`                                           | yes, `star-re-export`             |
| `import('./m')` with a string literal                           | yes, `dynamic-import`             |
| `require('./m')` with a string literal                          | yes, `require`                    |
| `import type { A } from './m'`                                  | no, erased                        |
| `import { type A } from './m'` where every binding is type-only | no, erased                        |
| `export type { A } from './m'`                                  | no, erased                        |
| `export { type A } from './m'` where every binding is type-only | no, erased                        |

Type-only edges are counted and reported separately rather than discarded, so the
difference from the Madge result is auditable rather than asserted.

Dynamic imports and `require` calls with a non-literal argument cannot be resolved
statically. They are recorded as unresolved evidence with file and line, never dropped.

An internal import that resolves to nothing is recorded as `unresolved-internal` and makes
the audit exit non-zero, because an incomplete graph cannot support a claim about cycles.

## Results

| metric                                | value |
| ------------------------------------- | ----- |
| owned modules                         | 142   |
| runtime edges                         | 314   |
| type-only edges excluded              | 110   |
| unresolved internal imports           | 0     |
| external specifiers                   | 27    |
| runtime strongly connected components | 0     |

Runtime edges by form: 312 static imports, 1 dynamic import, 1 runtime re-export.

**There is no confirmed runtime dependency cycle in the owned production code.**

Unresolved internal imports: none.

## Comparison with the earlier twelve-cycle claim

The earlier finding is wrong in two independent ways, and both had to be checked before the
zero could be trusted.

**It counted cycle paths, not components.** Madge lists every distinct path it walks. The
nine modules named in the original report form _one_ strongly connected component, not
twelve independent cycles. Reporting twelve made the coupling look broader than it is.

**It counted erased edges as real ones.** Re-running this analyzer with type-only edges
deliberately added back reproduces exactly the structure the original reported:

| component | files                                                                                                                                                                                                                                                                                    | runtime edges inside | type-only edges inside |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------- |
| 1         | 10 (`agent-runtime-driver`, `card-host-operations`, `codex-app-server-driver`, `event-driven-agent-transport`, `just-do-it-coordination-runner`, `just-do-it-coordination`, `just-do-it-execution-types`, `just-do-it-planning-service`, `just-do-it-worktree`, `local-agent-transport`) | 8                    | 13                     |
| 2         | 2 (`whats-next-redo`, `whats-next-runs`)                                                                                                                                                                                                                                                 | 1                    | 1                      |

With type-only edges removed, neither component's runtime edges close a loop. Both
disappear.

The reproduction matters as much as the result: an analyzer that finds nothing might simply
be blind. This one finds the original structure when told to include erased edges, and
loses it when told not to.

### The specific claim that was wrong

The original report stated that `just-do-it-execution-types.ts` "imports the runtime
`coordination-runner`, welding the type layer to the execution layer". Its five outgoing
edges are all type-only:

```
lib/just-do-it-execution-types.ts:1  -> lib/just-do-it-coordination.ts          type-only
lib/just-do-it-execution-types.ts:5  -> lib/just-do-it-coordination-runner.ts   type-only
lib/just-do-it-execution-types.ts:10 -> lib/just-do-it-worktree.ts              type-only
lib/just-do-it-execution-types.ts:14 -> lib/local-agent-transport.ts            type-only
lib/just-do-it-execution-types.ts:16 -> lib/card-host-operations.ts             type-only
```

It already is a pure type module at runtime. The recommendation built on that claim —
"make it a pure type module and eight cycles disappear" — had no runtime defect to fix.

The remaining type-only edges inside component 1:

```
lib/agent-runtime-driver.ts:2            -> lib/local-agent-transport.ts
lib/codex-app-server-driver.ts:4         -> lib/agent-runtime-driver.ts
lib/just-do-it-coordination-runner.ts:25 -> lib/card-host-operations.ts
lib/just-do-it-coordination.ts:9         -> lib/local-agent-transport.ts
lib/just-do-it-coordination.ts:10        -> lib/card-host-operations.ts
lib/just-do-it-planning-service.ts:15    -> lib/just-do-it-execution-types.ts
lib/just-do-it-worktree.ts:14            -> lib/just-do-it-planning-service.ts
lib/local-agent-transport.ts:14          -> lib/card-host-operations.ts
```

And in component 2:

```
lib/whats-next-redo.ts:2 -> lib/whats-next-runs.ts
```

## Recommended follow-up

**Item 4 of the stabilization phase — "remove confirmed runtime cycles" — has no confirmed
runtime cycle to remove.** It should be closed with this evidence rather than executed.

Nothing in `just-do-it` or `whats-next` should be split, moved or reshaped on the basis of
the original cycle count. The type-only edges above are ordinary TypeScript structure:
modules describing each other's shapes. They cost nothing at runtime.

If module coupling is later judged a readability or navigation problem, that is a separate
argument requiring its own evidence — not a dependency-cycle argument.

## Suitability as a CI gate

The result is a defensible baseline: zero runtime components, zero unresolved imports,
deterministic output. A future task could assert `components.length === 0` as a gate.

That is deliberately not done here. A gate should follow an accepted baseline rather than
arrive with it, and this audit's classification decisions deserve review before they can
fail someone's pull request.

## Analyzer limitations

- Resolution is syntactic. It does not consult `tsconfig.json` beyond the `@/` alias, so an
  exotic path mapping would resolve differently from the compiler.
- A runtime edge means the module is loaded, not that any exported value is used at import
  time. A cycle of pure function declarations that never execute at load time would still
  be reported.
- Non-literal dynamic imports are reported but cannot be followed. There is currently one
  such construct in the analyzed set, in a test fixture, and none in production code.
- Re-export chains are edges, not transitive symbol resolution. `export *` is recorded as
  one edge to the re-exported module.
- Conditional or environment-specific imports are treated as unconditional edges.
