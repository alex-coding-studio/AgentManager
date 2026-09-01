# API Request Boundary

AgentManager serves its interface and its API over local HTTP. The same endpoints
that register projects, write planning state and start Agent Runs are reachable by
any page the user's browser loads and by any device that can reach the port. This
document defines the boundary that every `/api` request crosses, and states what
that boundary does not cover.

## Two enforcement points

The boundary is enforced twice on purpose.

`proxy.ts` is the Next.js 16 root Proxy convention, matched to `/api/:path*`. It is
the common early filter: it rejects a disallowed Host or a cross-origin unsafe
method before the Route Handler runs, before any body is parsed and before any
side effect happens.

Each unsafe Route Handler additionally calls `guardRequest` or `guardJsonRequest`
from `lib/request-boundary.ts` as its first statement. Next.js documents that Proxy
is not an authorization solution and that a matcher change or a route move can
silently remove Proxy coverage. A route that starts an Agent or writes to the
filesystem must not depend on a single matcher expression staying correct.

Both call the same `assertTrustedRequest`, so the two points cannot disagree.

## Allowed hosts

A request is rejected with `421` unless its `Host` header names an allowed host.

Allowed by default: `localhost`, `127.0.0.1`, `[::1]`.

Additional hosts come from two environment variables, both read at request time:

- `AGENT_MANAGER_ALLOWED_HOSTS` — the explicit setting for this boundary.
- `AGENT_MANAGER_ALLOWED_DEV_ORIGINS` — already documented for Tailscale Serve
  development, and still honored so existing setups keep working.

Both accept a comma-separated list. Ports are ignored during comparison; a
configured `device.tailnet.ts.net` matches `device.tailnet.ts.net:3000`.

Host parsing handles IPv4, IPv6 in brackets (`[::1]:3000`) and bare hostnames. A
malformed value — a bare IPv6 address without brackets, an unterminated bracket, a
non-numeric port — normalizes to nothing and is rejected rather than being guessed.

`X-Forwarded-Host` and similar forwarding headers are never consulted. They are set
by whatever spoke to the server last and cannot widen the allowed set.

## Cross-origin writes

For `GET`, `HEAD` and `OPTIONS` the Origin header is not consulted.

For every other method, a request carrying an `Origin` whose host or port differs
from the request's own Host is rejected with `403`. An `Origin` of the literal
string `null`, or one that does not parse as a URL, is treated as cross-origin.

This closes the case that motivated the boundary: `multipart/form-data` and
`text/plain` bodies are CORS simple requests, so a page on any other origin can
send them without a preflight and without the user noticing.

## JSON content type

Routes that parse a JSON body require `Content-Type: application/json` and answer
`415` otherwise. Without this, a cross-origin page could relabel a JSON body as
`text/plain` to avoid a preflight. The media type is compared after stripping
parameters, so `application/json; charset=utf-8` is accepted.

Routes that read `multipart/form-data` do not add this requirement; the Origin rule
already covers them.

## The supported native path

A request with no `Origin` header is not treated as cross-origin. This is the
documented path for non-browser callers — `curl`, editor HTTP clients, and scripts
that drive AgentManager locally:

```bash
curl -X POST http://127.0.0.1:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"kind":"standalone","name":"Example","description":"","rootPath":"/path/to/project"}'
```

Such a caller must still send an allowed `Host`, which any HTTP client does by
default when it connects to a loopback address.

Browsers always attach `Origin` to cross-origin requests, so keeping this path open
does not weaken the browser case. It does mean the boundary is not an authentication
mechanism — see below.

## What this boundary does not do

**It is not authentication.** It answers "did a foreign web page cause this
request?" and "was this server addressed by a name it accepts?". It does not answer
"who is asking?". Any process on the machine, and any device that can reach the port
with an allowed Host and no Origin header, is still accepted.

This matters most under Tailscale Serve. Publishing the port to a tailnet gives every
device on that tailnet — including any device someone else controls, and any device
that is later compromised — the ability to register projects, write planning state
and start Agent Runs on this machine. `tailscale serve` bounds the network, not the
trust.

Random-token or identity authentication, and the bootstrap flow it would need, is an
open product decision. It is deliberately not implemented here.

## Verification

```bash
npm run test:boundary
```

The suite covers Host normalization across IPv4, IPv6 and port forms, malformed Host
rejection, configured hostnames, the forwarding-header case, cross-origin and
same-origin writes, the no-Origin native path, and Proxy responses. It also calls the
real project and decomposition Route Handlers to prove a rejected request registers
no project, writes no file and starts no Agent Run.

One test is structural: it walks every `route.ts` under `app/api` and fails if an
unsafe handler omits the shared guard **or calls it after any await, request body
read or project lookup**. A guard that runs after the work it is supposed to prevent
is not a boundary, so ordering is asserted rather than mere presence. That assertion
is itself covered by negative cases, so a weakened check fails its own test.

Route Handlers import through the `@/` alias, which Node does not resolve on its own.
`tests/helpers/register-alias.mjs` installs a resolve hook, using the synchronous
`module.registerHooks` where available and falling back to `module.register` with
`tests/helpers/resolve-alias.mjs`. The fallback keeps the suite runnable on the
minimum runtime declared in `package.json` (Node 22.13.0), where `registerHooks` does
not exist. This is test-only infrastructure and is not loaded by the application.
