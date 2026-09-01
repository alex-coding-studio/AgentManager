# Product Design Completion Profile Evaluation

Date: 2026-08-31  
Project: HereItIsV2  
Model: `gpt-5.6-luna`  
Effort: `max`  
Harness revisions evaluated: 5; follow-up fix: 6

## Evaluation question

Can Product Design Completion use a natural user request, the Product Source and accepted
Product Design Features to produce most of one missing module's expected product behavior,
then respond to a narrow follow-up without rewriting the module?

The evaluation scores one Feature module. It does not require one Candidate to complete the
whole product design.

## Frozen product context

- Product Source: `NODE-126937db`
- Unified location tree: `NODE-10ad5b6c`
- Movement and current location: `NODE-dd62745b`
- Unified item and container search: `NODE-d8ca06da`

The Host correctly injected the Source and all three accepted Features as primary Context.

## Case 1: deletion lifecycle

Run: `RUN-4ef2c70c-6475-453d-9e84-399e4a06afbb`  
Candidate: `CANDIDATE-e72ffaef` revision 1  
Title: `删除与回收：让记录安全离开位置树`

The natural request named the missing deletion concern and expected interactions, without
supplying a finished design. The result justified a separate Feature and covered all ten
module-level areas used for this pass:

1. ordinary deletion;
2. complete Container subtree behavior;
3. deleted state;
4. browsing visibility;
5. search visibility;
6. Activity;
7. recovery;
8. permanent deletion;
9. batch behavior;
10. failure and cross-Feature boundaries.

The output was structurally complete and did not expand into photos, OCR, sync or technical
implementation. Comparison against the mature HereItIs reference surfaced policy choices
that were not settled in the current HereItIsV2 Product Design, including automatic return
to a prior parent, permanent-deletion Activity retention and grouped batch Activity. Those
are user rulings or follow-up refinements, not missing module coverage.

## Case 2: holding area from conversational input

Run: `RUN-b1eb061e-fe5a-4ff2-b567-00b6da91c5ba`  
Candidate: `CANDIDATE-87950cfe` revision 1  
Title: `暂存未定位置的物品：先记下，再完成归属`

The user-style prompt said that an Item may be recorded before its final location is known,
or may leave deletion before a final destination is chosen. It asked the Agent to decide
how a holding area should fit the known product.

The result correctly judged that the concern deserves a separate Feature and independently
derived the expected module behavior:

- holding is a waiting state, not a physical Container or deletion;
- Container subtrees remain intact;
- records may enter through creation, movement or deletion recovery;
- no false physical path is created;
- records remain searchable with an explicit unplaced state;
- users must choose a legal existing destination to leave holding;
- Activity records entry and exit;
- failures cannot leave one record in both the active tree and holding;
- the Feature states its interactions with tree, movement, search and deletion.

The only open assumption was whether holding records are always included in unified search.

## Case 3: narrow follow-up

Run: `RUN-72fdb5cb-1678-40f1-aa4a-ab06ea54ff7f`  
Candidate: `CANDIDATE-87950cfe` revision 2

The follow-up fixed one decision: holding records must always appear in unified search with
an unplaced label and no hiding scope. The semantic output changed only that rule, removed
the open assumption, preserved every other section and recommended closing the direction.

The model returned an empty `## Assumptions` section rather than `- None`, so Harness
revision 5 rejected an otherwise correct result. The raw Session output was recovered by
adding the contractually required empty marker. Harness revision 6 now states this rule
explicitly and has a regression assertion.

## Cost and timing

| Run                    | Wall time |   Input | Cached input | Output | Reasoning output | Result             |
| ---------------------- | --------: | ------: | -----------: | -----: | ---------------: | ------------------ |
| deletion, new Feature  |    5m 45s | 119,624 |       77,056 | 18,766 |           13,225 | proposal           |
| holding, new Feature   |    4m 55s | 407,290 |      370,944 | 16,010 |           10,397 | proposal           |
| holding, narrow refine |    2m 22s | 519,738 |      484,608 |  7,430 |            2,136 | recovered proposal |

Quality was strong, but independent Completion requests reused one provider Session because
their Source, Intention and Motion matched. This accumulated unrelated Feature history and
caused severe cached-token growth. Independent Product Design Completion requests now start
fresh Sessions; only refinement of the same Candidate resumes its Session.

Two canceled refinement attempts are excluded from model-quality scoring. They contained
evaluator-supplied rules from another HereItIs contract, including a holding-area decision
that contradicted the then-stated HereItIsV2 scope. This was an evaluation error, not a
profile failure.

## Result

The profile passed the functional hypothesis:

- it used the Source and current Product Design rather than returning to MVP exploration;
- it distinguished independent Features from existing modules;
- it produced most expected behavior for each requested module from conversational input;
- it preserved scope and cross-Feature consistency;
- it responded correctly to one narrow product ruling without rewriting the Candidate.

The main limitation is cost, not module quality. Revision 6 addresses independent Session
reuse and empty-Assumptions recovery evidence. Provider-backed comparisons across models
remain missing evidence; this evaluation establishes one real Luna baseline rather than a
cross-model claim.
