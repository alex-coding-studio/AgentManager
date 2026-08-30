# Just Do It Harness: Scaffold evaluation

Subsequent evidence: the [live planning smoke](live-planning-smoke.md) records
one real initial Plan and scoped-edit validation. The original Scaffold evidence
below remains distinct from that narrow integration test.

## Verdict and evidence boundary

The offline contract/storage foundation is testable. Live model effectiveness is
**missing evidence**. This is a Scaffold-level application of Yao Meta Skill's
Output Eval, prompt-quality and resource-boundary methods to an embedded Harness,
not a new installable Skill or a Production/Library promotion.

Target: AgentManager's `lib/just-do-it-harness.ts`, `lib/just-do-it-worklog.ts`,
their fixed tests and this report directory. Yao's installed engine is read-only;
no self-update, packaging, installation, shared Skill change or provider call
is part of this evaluation.

The installed Yao output-eval CLI exposes a self-targeted command rather than
an external embedded-Harness target. No self authorization was supplied and no
target guard was bypassed. The evaluation uses its documented method, repository
semantic tests and the isolated fixture runner, not a claimed Yao CLI score.

## Findings and fixes

1. **Input-as-output provenance hole, fixed.** The first implementation allowed
   execution artifact references from the union of context inputs, earlier
   outputs and host-observed artifacts. A response could therefore cite the
   source goal document as its new delivery. Artifact references now require
   host observation for the current round; context membership alone is not
   sufficient. The regression test also covers reusing an earlier output without
   renewed observation. It does not prove the artifact content meets the goal.
2. **Review classification ambiguity, fixed.** The schema separated blocking
   findings and nonblocking advisories, but the prompt did not explain the split.
   The phase prompt now does; tests permit ready plus advisories and reject ready
   plus blocking findings. Actual model classification remains unmeasured.
3. **Evidence overclaim risk, retained limitation.** Unit tests and a hand-written
   fixture cannot establish intent retention, useful planning, live Skill use,
   recovery by a new provider Session, or cost improvement. Documentation and the
   offline runner identify this boundary explicitly.

## Executed checks

`npm run test:implementation-harness` covers 27 semantic/contract/storage cases:

| Risk family | Observable check | Evidence type |
| --- | --- | --- |
| Wrong work adoption | Reject wrong Card/request, stale revision, mutated packet, wrong output version | Code execution |
| Scope drift | Reject sibling edits, reordered steps, unfinalized execution and skipped Actions | Code execution |
| False delivery | Reject unobserved new artifacts, input-as-output and stale output-as-new | Code execution |
| Acceptance substitution | Result schemas cannot carry acceptance commands; advisory review is distinct | Code execution |
| Unsafe Plan reopening | Reject active runs, changed/unknown effects and unconfirmed/cross-Card rollback | Code execution |
| Context loss | Preserve original input, stale-summary rejection, fresh reader, indexed references | Temporary filesystem fixtures |
| Storage races | Conflicting appends, interrupted pending writes, corruption, identity and path checks | Temporary filesystem fixtures |
| Excessive main context | Main handoff links recent entries; full detail stays in references/index | Generated Markdown assertions |

`npm run preview:implementation-harness` produces an explicitly scripted local
website case: local goal/card interactions, real AI excluded, dark mode deferred.
It prepares the actual prompt and validates a fixture response. Execution kind:
**recorded_fixture**, not model-executed evidence. Outputs exist only in the
temporary directory printed by the command.

## Comparison and review status

- Baseline vs with-Harness model pass rate: **missing evidence**.
- Model-quality delta, token usage and provider latency: **missing evidence**.
- Independent blind reviewer judgment: **missing evidence**; this is the
  implementer's structural evaluation, not independent approval.
- Negative counterexamples in tests are deliberately constructed attacks, not
  purported outputs from a baseline model. No fabricated A/B win rate is reported.
- Plan usefulness and user satisfaction remain user judgments; schema acceptance
  is not a quality threshold and does not authorize execution.

## Next evaluation, not yet executed

Use a small planning-only live smoke plus a separate holdout: (1) explicit scope
exclusion after feedback; (2) a single-step change that preserves siblings;
(3) a fresh Session reading HANDOFF.md and only necessary references. Review
whether the resulting Plan reflects the user's intent, not whether it parrots
specific headings. Add an independent blind comparison only when there are real
baseline and Harness outputs. Preflight cost and keep provider calls bounded.

Owner: AgentManager maintainers. Review cadence: each Harness behavior/revision
change and before enabling a real provider. Output contract: phase schema plus
user-owned sign-off. Rollback boundary: code/fixtures only in this delivery;
no real Card rollback was executed. Runtime **trust report**: **missing evidence**
until the adapter and its filesystem/GitHub permissions exist.
