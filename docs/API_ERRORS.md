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

This matters because AgentManager shells out to `git`, `gh` and Agent CLIs. A failing
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

The rule is positional, not editorial: an entry guard that rejects a value the user
submitted is public; anything raised while doing the work is not. Wording is not
evidence — a friendly-sounding message from a failed subprocess is still unknown.

The safe default for an ordinary `Error` is the generic response. Adding a message to
the public set is a deliberate act at the throw site.

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

One test is structural: it walks every `route.ts` under `app/api` and fails when a
catch block publishes an unknown error message, whether directly in the response or
through a variable bound to it. Reading `error.message` to make a decision — as the
folder picker does to detect cancellation — is not an exposure and does not fail it.
The assertion is itself covered by synthetic leaking and non-leaking handlers.
