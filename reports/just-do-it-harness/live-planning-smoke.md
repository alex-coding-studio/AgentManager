# Live Planning smoke — 2026-08-30

## Result

Real Codex planning generated a six-step draft from an existing formal website
skeleton Node. A fresh Session then applied a single-step patch after revision 2
removed the need to repeat the whole Plan. The Overview and five sibling
contracts remained byte-for-byte equal. The Plan is still a draft with zero
execution Actions; the user has not finalized it.

Requested profile: Codex CLI, `gpt-5.4-mini`, low effort. Each attempt used a
different provider Session, a Card handoff and explicit source/resource references.
This is one integration smoke, not a blind comparison or a broad Plan-quality
evaluation. Claude execution and independent human acceptance are unverified.

## Observed attempts

| Attempt | Harness | Result | Input tokens | Cached input | Output tokens |
| --- | --- | --- | ---: | ---: | ---: |
| Initial generation | 1 | Valid six-step draft | 35,895 | 20,992 | 1,283 |
| Full-Plan scoped response | 1 | Rejected: incidental Overview change; old draft retained | 37,956 | 22,016 | 1,346 |
| Target-only scoped patch | 2 | Accepted; only target output changed | 18,356 | 4,352 | 512 |

Totals: 92,207 input tokens (47,360 cached) and 3,141 output tokens. Cached input
is part of reported input, not an additional charge count. These are provider
usage fields, not API-price or subscription-quota estimates. Timing, cache and
request differences prevent treating these rows as a controlled savings claim.

Local evidence is retained under the imported Card's worklog in the registered
project's `.agent-manager/implementation/cards/` directory: revisions 2/3 capture
initial request/result, 4/5 capture rejected scoped request/response, and 6/7
capture the revision-2 request/result. No private project artifacts are copied
into this tracked report.

## Verified behavior

- Browser imports an existing accepted formal Node and starts from an empty Plan.
- A real request replaces the form with loading, then shows Overview and six steps.
- Refresh preserves the Card and Plan.
- While step 1 updates, step 2 remains selectable/readable; completion does not
  steal the user's selection back to step 1.
- Invalid scoped output does not replace the previous Plan or become accepted work.
- Revision 2 preserves sibling IDs, order, text and Overview in host code, while
  retaining the original feedback and actual usage.

## Limits

Finalize/reopen, cancellation, timeout, concurrent mutations and restart recovery
are covered by controlled transport tests; the real user's Plan was not finalized
for testing. Whole-plan feedback is contract-tested, not an additional live call.
Provider tool-read traces are not retained by this transport, so delivery of
handoff references is verified, but selective reading behavior is not independently
proven. No Action execution, writable development sandbox or GitHub integration
was enabled. Product usefulness still needs the user's review.
