# HereItIs Six-Action Trial — Final Statistics

Status: statistics verified after user acceptance of all six Actions. This is the
starting evidence for the retrospective, not a completed architecture assessment.

## Source and counting boundaries

Source: Card `fa549a45-246c-4a44-a0de-c094eef14eef`, final acceptance revision 59,
in the HereItIsV2 planning store. Reconcile all retained revision snapshots, not
only the current execution array: one pre-reset execution is absent from that
array but remains in revision history. Count each run UUID once.

- Six Actions, all explicitly accepted: **6/6**.
- Execution: **13 runs**, comprising 12 in the active sequence and one pre-reset
  attempt. Action 1 had seven attempts including that reset; Action 6 had two.
- Planning: **2 additional runs**. Total recorded model runs in this Card: **15**.
- Execution profiles: `gpt-5.6-luna / max`; planning: `gpt-5.6-sol / high`.
- Final checklists contain **37 criteria**: 34 reported passed in the final reports,
  plus 3 explicit user-decision passes. The 34 include a reported user verdict;
  they are not 34 automated tests. Original TRIAL-01/02/03 remain not-run.
- Final accepted scope is the simulator-validated MVP. The original real-phone,
  two-real-box trial and detailed experience comparison were waived by the user,
  not performed or fabricated.

This does not include the primary Codex conversation implementing AgentManager,
separate independent reviews, What's Next/Break It Down runs, or other sessions
outside this Card. It is not the total cost of the entire development effort and
not a monetary invoice. No dollar or subscription-quota conversion is inferred.

## Time

All display dates below use America/Los_Angeles.

- Card imported: **2026-08-30T16:44:56-07:00**.
- Plan finalized: **2026-08-30T19:07:43-07:00**.
- First execution including pre-reset: **2026-08-30T19:07:55-07:00**.
- Last user acceptance: **2026-08-31T10:56:32-07:00**.
- Import to final acceptance: **18h 11m 36s** elapsed.
- Execution start-to-end intervals summed: **2h 46m 38s**.
- Planning intervals summed: **2m 50s**.
- All recorded run intervals summed: **2h 49m 28s**.

Run intervals include model generation, tool work and command waits; they are not
pure model compute. Elapsed wall time also includes overnight gaps, discussions,
manual actions and work on AgentManager itself. Do not call all 18 hours model
runtime, human labor or avoidable waiting; those categories were not fully measured.

## Execution by Action

Token columns are exact counts. Cached input is included in total input. Uncached
input is total input minus cached input; output is reported separately.

| Action | Scope                                     | Runs |   Run time | Total input | Uncached input |  Output |
| ------ | ----------------------------------------- | ---: | ---------: | ----------: | -------------: | ------: |
| 1      | 建立 GitHub 仓库与能在手机启动的 HereItIs |    7 | 1h 06m 27s |  18,024,066 |        802,050 | 176,851 |
| 2      | 让两条路径共用可保留、可纠错的记录        |    1 |    26m 49s |  12,136,978 |        301,330 |  77,362 |
| 3      | 完成先装内容的“记一盒”向导                |    1 |    24m 08s |   7,827,369 |        206,761 |  66,142 |
| 4      | 完成先找位置的“按位置登记”                |    1 |    28m 38s |  15,307,284 |        482,580 |  71,240 |
| 5      | 验证完整流程并准备手机试用版本            |    1 |    14m 04s |   5,480,218 |        170,010 |  33,999 |
| 6      | 在手机上用两盒真实物品比较体验            |    2 |     6m 31s |     547,933 |        106,845 |  20,572 |

Action 1 includes the pre-reset 17m08s attempt. The retained six-round retry sequence
alone took 49m19s; reports that omit the reset are not the full trial total.

## Token totals

| Scope               |      Input | Cached input | Uncached input |  Output | Cache share |
| ------------------- | ---------: | -----------: | -------------: | ------: | ----------: |
| Execution (13 runs) | 59,323,848 |   57,254,272 |      2,069,576 | 446,166 |      96.51% |
| Planning (2 runs)   |    233,274 |      187,008 |         46,266 |   4,942 |      80.17% |
| Combined            | 59,557,122 |   57,441,280 |      2,115,842 | 451,108 |      96.45% |

Reported reasoning output is 233,093 tokens,
a subset of output, not an extra total to add. Input totals accumulate across
model calls; they do not mean that much unique source material was read. Cache
reuse reduces the uncached portion but does not prove efficient task execution.

## Delivery and acceptance

The four HereItIs PRs were queried after final acceptance; all are merged:

| PR                                                          | Delivered scope                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [#1](https://github.com/alex-coding-studio/HereItIs/pull/1) | Initial two-entry app shell and setup                                            |
| [#2](https://github.com/alex-coding-studio/HereItIs/pull/2) | Shared durable records and content-first registration (Actions 2 and 3 together) |
| [#3](https://github.com/alex-coding-studio/HereItIs/pull/3) | Location-first registration                                                      |
| [#4](https://github.com/alex-coding-studio/HereItIs/pull/4) | Simulator MVP trial instructions and validation handoff                          |

Candidate source head: `1b1a2ae5bf50ff3637810789f7c1f05667769bf1`.
PR #4 merge commit: `07852c1b3f4b37e771e4c10233cf96b21e19b703`.
Action 6 produced a user acceptance decision, not new feature code or another PR.
Six Actions therefore did not correspond to six PRs. The final validation report
cited 12/12 detailed tests; the wrapper reported 9. That count discrepancy is not reconciled in this statistics pass; the two numbers
must not be added as separate test suites or silently equated.

## What the status numbers do and do not say

Nine of the thirteen executions were initially recorded as failed by the host.
Their recorded errors concern delivery-reference verification. This includes both
incorrect references and unsupported/poorly modeled reference types. It is not a
69% functional-failure rate, nor proof that all nine were host false positives.
Some rounds also had genuine environment blockers or missing user observations.
Saved-report rechecks and later user acceptance changed the usable outcome without
rerunning every original execution. Read original report outcome, required checks,
verification findings and user decisions separately.

The ledger contains six user-accepted events and three final user overrides. Its
other user-input records also include imports, migrations and assistant-performed
operations. Do not treat the raw event count as the number of user interventions.
No defensible total of human minutes or primary-assistant tokens is available here.

## Retrospective agenda, in priority order for discussion

1. **Dispatch and task type.** Implementation, validation and user judgment all used
   the same Agent execution entry. Action 6 ran twice for a decision ultimately
   supplied by the user. Determine which work really needs a model run and what a
   dispatch must settle first; do not assume a new architecture is already agreed.
2. **Context and decision continuity.** Wrong/stale repository facts, repeated
   setup/Skill discovery, missing accepted-output references, and inconsistent
   interpretation of user input caused repeated reconciliation. Review current
   facts, bounded summaries, source references and explicit override propagation.
3. **Implementation and feedback-loop efficiency.** Action 4 used 28m38s and included
   patch replay, late compiler feedback and a missed compilation-fix commit followed
   by repeated gates. Separate necessary checks from avoidable rework before
   attributing the elapsed time to Luna, max reasoning or simulator speed.
4. **Acceptance and verification authority.** Required criteria were not materialized
   initially; optional diagnostics, resolved failures and host verifier limitations
   appeared as failure signals. Preserve one acceptance authority, evidence honesty
   and explicit user decisions without adding surprise gates.
5. **Delivery and UI visibility.** Draft timing, PR scope boundaries, progress/log
   visibility, missing initial input and mixed result/control sections required
   substantial manual support. Evaluate handoff usability, not merely final success.

Working conclusion: the user accepted the product result within the simulator
scope; the trial did not demonstrate a low-intervention, efficient autonomous
workflow. This is a basis for discussion, not a claim that every delay has the
same cause or that a model replacement alone will fix it.

## Per-execution appendix

Rows use Action/round labels; pre-reset is explicitly separate from the retained
Action 1 round numbering. Initial host status comes from the earliest terminal
snapshot, before any report recheck.

| Action/round | Local start               | Duration |      Input | Cached input | Uncached input | Output | Initial host status |
| ------------ | ------------------------- | -------: | ---------: | -----------: | -------------: | -----: | ------------------- |
| 1/pre-reset  | 2026-08-30T19:07:55-07:00 |  17m 08s |  6,989,121 |    6,779,392 |        209,729 | 43,640 | failed              |
| 1/1          | 2026-08-30T20:03:58-07:00 |  17m 14s |  5,841,565 |    5,624,832 |        216,733 | 45,353 | succeeded           |
| 1/2          | 2026-08-30T20:22:24-07:00 |   9m 15s |  1,287,349 |    1,202,688 |         84,661 | 21,744 | failed              |
| 1/3          | 2026-08-30T20:44:15-07:00 |   3m 53s |    702,133 |      641,024 |         61,109 | 10,583 | failed              |
| 1/4          | 2026-08-30T20:57:35-07:00 |   7m 13s |    648,924 |      592,640 |         56,284 | 21,511 | failed              |
| 1/5          | 2026-08-30T21:24:32-07:00 |   5m 48s |  1,269,857 |    1,180,160 |         89,697 | 16,753 | succeeded           |
| 1/6          | 2026-08-30T22:15:31-07:00 |   5m 57s |  1,285,117 |    1,201,280 |         83,837 | 17,267 | failed              |
| 2/1          | 2026-08-30T22:32:34-07:00 |  26m 49s | 12,136,978 |   11,835,648 |        301,330 | 77,362 | succeeded           |
| 3/1          | 2026-08-31T08:33:55-07:00 |  24m 08s |  7,827,369 |    7,620,608 |        206,761 | 66,142 | failed              |
| 4/1          | 2026-08-31T09:49:01-07:00 |  28m 38s | 15,307,284 |   14,824,704 |        482,580 | 71,240 | succeeded           |
| 5/1          | 2026-08-31T10:25:43-07:00 |  14m 04s |  5,480,218 |    5,310,208 |        170,010 | 33,999 | failed              |
| 6/1          | 2026-08-31T10:44:11-07:00 |   2m 44s |    200,111 |      151,296 |         48,815 |  8,663 | failed              |
| 6/2          | 2026-08-31T10:48:18-07:00 |   3m 47s |    347,822 |      289,792 |         58,030 | 11,909 | failed              |

Machine-readable aggregates: [JSON](2026-08-31-hereitis-trial-statistics.json).
Detailed chronology: [rolling evidence ledger](../JUST_DO_IT_DOGFOOD_REVIEW.md).
Shared log proposal: [run logs and context](../RUN_LOGS_AND_CONTEXT.md).
