# API Error Responses

An API Route that catches an error has to answer one question before it replies: is
this message something the product deliberately says to a user, or is it whatever the
filesystem, a child process or a provider happened to produce?

Before this boundary, every Route answered the second case by forwarding
`Error.message`. A missing file returned the absolute path it looked for, including
the user's home directory and project names. The Part 1 Host and Origin boundary
narrows who can read a response, but it is not authentication, and an allowed tailnet
device reads everything.

## The two kinds

`lib/api-errors.ts` makes the distinction explicit rather than inferred.

**`PublicApiError`** carries a safe message, an HTTP status and an optional stable
code. It is thrown at the point where the product decides to say something —
validation guards on user-submitted values, and conflicts like an already-registered
directory or an already-running Agent. Its message is published exactly.

**Everything else** is unknown. `apiErrorResponse` answers with the Route's own
generic message and HTTP 500, never the caught message.

```ts
} catch (error) {
  return apiErrorResponse(
    error,
    'Could not read the source document.',
    'GET /api/projects/[projectId]/resources',
  );
}
```

Each Route passes its own fallback. A caller who asked for a document learns that the
document could not be read, not that "something failed".

## Correlation

An unknown error is recorded once on the Host with a 12-character correlation
identifier, and the same identifier is returned to the client:

```
{ "error": "Could not read the source document.", "correlationId": "9f2c41ab77de" }
```

```
[api-error 9f2c41ab77de] GET /api/projects/[projectId]/resources: Error: ENOENT ...
```

The identifier is random and carries no information about the error. It exists so a
user can quote it and the developer can find the matching line, without the response
itself containing anything sensitive.

Host recording is a single `console.error`. This is deliberately not a logging
subsystem, has no retention policy and no viewer.

## Redaction

Before a diagnostic reaches the Host, `redactSecrets` removes the common shapes:
GitHub tokens (`ghp_`, `gho_`, …), OpenAI-style `sk-` keys, Slack `xox*` tokens, JWTs,
`Bearer` values, `--token`/`--password`/`--secret` command arguments, and
`key: value` forms for authorization, token, password, secret, api-key and
private-key.

This matters because Praxis shells out to `git`, `gh` and Agent CLIs. A failing
command's message can contain the arguments it was given.

Redaction is best-effort on known shapes, not a guarantee. It is the reason the
response carries a correlation identifier instead of the diagnostic.

## What is preserved

The Part 1 Request Boundary responses pass through untouched — 403 for a cross-origin
write, 415 for a wrong content type, 421 for a disallowed Host. `apiErrorResponse`
checks for them first, so the error helper cannot weaken that boundary, and the
guard-first ordering Part 1 asserts is unchanged.

Explicit validation Responses that a Route already returns directly — a missing
project name, an unsupported Agent — are untouched; they never went through a catch
block.

Status codes that previously came from matching the error text now come from the
error itself. `/already has an active Agent Run/` deciding between 409 and 400 is
gone; the throw site says `409`. Conflict classes
(`ContextDocumentConflictError`, `TaskDecompositionAttachmentConflictError`,
`CanvasStartConflictError`, `NodeReferencedError`) extend `PublicApiError`, so their
messages and extra fields still reach the client while unknown errors cannot.

`ENOENT` on a Run lookup still answers 404, now with a fixed message instead of the
`realpath` text.

## Choosing what is public

A message is public only when the product deliberately says it to a user. That is a
judgement made per throw site, not a property derived from the message.

**Public** — deliberate request validation, actionable conflicts, and product states a
user can act on:

- `An Instruction is required.`, `Upload no more than 20 Markdown files at once.`
- `This project directory is already registered.` (409)
- `Stop the Planning Agent before deleting this Card.`, `Generate a Plan first.`

**Unknown** — internal invariants, Agent or provider contract violations, persistence
damage, and operational failures. These reach the client only as the Route's fallback
plus a correlation identifier:

- `Expected a Planning response.`, `A revision must return exactly the requested Candidate identifier.` — the Agent broke its contract
- `Candidate stable identity is missing.`, `Invalid recorded output file.` — stored state is damaged
- `This run is owned by another server process.`, `Card storage ownership changed.` — internal ownership
- `Could not choose a unique Run Resource name.` — an operation exhausted its attempts

A literal with no interpolation is not automatically safe. `Invalid Planning Card
state.` substitutes nothing, yet it tells a caller that Planning Cards have states and
that one is inconsistent. Absence of runtime data prevents _credential and path_ leaks;
it does not make an internal failure something to publish.

Nor is "the user already saw this before the change" a reason to keep publishing it.
The old code forwarded everything; that is the defect, not the baseline.

Wording is not evidence in either direction. A friendly-sounding message from a failed
subprocess stays unknown.

Status codes follow the classification. Routes used to derive 409 by matching error
text (`/already has an active Agent Run/`); the throw site now carries `409` and no
Route inspects wording.

## Verification

```bash
npm run test:api-errors
```

Covers: a public error keeping its status, code and message; an unknown error
exposing no path, username, stack or raw message; token-like values reaching neither
the response nor the Host diagnostic; response and diagnostic sharing one correlation
identifier; Request Boundary statuses surviving; a real Route that previously leaked
`ENOENT`/`realpath` now answering with its own generic 500; existing safe validation
staying exact; and a rejected request creating no project and starting no Agent Run.

Three tests fix the classification itself: an internal failure returns only the Route
fallback and an identifier; the named internal failures are asserted **not** to be
`PublicApiError` anywhere in `lib`; and representative request validations are asserted
to still be public. A future edit that moves a message across the boundary fails one of
them.

One test is structural, and deliberately conservative: an API catch block may not read
`error.message` at all, except inside a branch already narrowed to a known error class.
It does no data-flow analysis, so no alias depth, template interpolation or field name
can slip past it — two-hop and three-hop alias cases are in its synthetic coverage.

The cost of that strictness is that a catch block cannot inspect a message to make a
decision. Where that is genuinely needed — the folder picker detecting a cancelled
dialog — the check lives in a named predicate (`isCancellationError`) instead. That is
an improvement on its own: the intent has a name, and the catch block stays declarative.
