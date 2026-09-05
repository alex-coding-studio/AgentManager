# Execution Roles and Delivery

## Task summary

Replace Responsibility inheritance with Role composition, and move final GitHub delivery from Worker to Coordinator. Worker hands off a Draft PR, all implementation commits and validation evidence. Coordinator verifies that handoff, handles technical GitHub recovery and makes the PR Ready. Host records the resulting state.

This revision closes the current implementation scope. Further harness expansion is paused for reflection and observation of real runs.

## Ownership

| Role        | Default responsibilities                        | Task additions                                                 | Completion boundary                                                                    |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Worker      | Draft publication                               | Mechanical, iOS Development, or other Worker-compatible duties | Code, compile, meaningful unit tests, all commits and Draft PR handed off              |
| Coordinator | Coordination, GitHub delivery, result reporting | Coordinator-compatible duties                                  | Exact candidate verified, existing PR Ready, result returned for Host persistence      |
| Reviewer    | Review                                          | Reviewer-compatible duties                                     | Evidence-backed review findings; no implicit implementation, publication or acceptance |

General is a shared baseline applied once to every Role. It is not a Role or an inheritance parent. Role JSON lives in `lib/roles`; Responsibility JSON lives in `lib/responsibilities`. A responsibility declares eligible roles and may explicitly override named General rules. Conflicting overrides fail rather than depending on ordering. Legacy General pointers and the previous inheritance representation remain readable for existing packets; new definitions use composition.

Reviewer configuration is available to the composition model. This change does not create a new automatic review stage.

## Delivery sequence

1. Coordinator understands the current task and assigns Worker-compatible responsibilities.
2. Worker implements and compiles the change, creates or updates the Action Draft PR through `publish_candidate`, runs required tests and commits corrections to the same Draft.
3. Worker returns its final HEAD, Draft PR and actual validation evidence. Worker `delivered` means its handoff is complete.
4. Host resumes Coordinator after every Worker handoff, including all-passed reports. The old direct Worker-to-Delivered path is removed.
5. Coordinator calls `finalize_delivery`, or returns a ready decision that invokes the same Host finalization. The finalizer requires a passed Worker handoff, an exact commit, a clean worktree, that commit already pushed to the Action branch, and an existing open PR. It cannot create missing Worker commits or push them.
6. Host confirms the PR HEAD and turns Draft into Ready. Only then may Coordinator completion publish Action Delivered. User acceptance remains a separate action.

Worker `publish_candidate` always produces Draft, even if an older resumed session supplies `ready=true`. Both publication stages use the existing serialized script and identity handling.

## Recovery and evidence

GitHub finalization failures return to the same Coordinator session. Pure publication verification can be retried without another Worker or another user instruction. Code or missing Draft work goes back to Worker within the existing recovery budget. An unresolved finalization cannot be labeled Delivered; passed code checks and existing artifacts remain available.

Manifest is reread on every assignment to discover new immutable amendments. Role and Responsibility library definitions are live system rules. Old passing checks cannot complete a new requested change. Coordinator checks that the current assignment was addressed, while code review and repeated test execution are not part of routine finalization.

The existing no-automatic-merge and separate user-acceptance boundaries remain. Product choices, destructive tradeoffs and missing external access retain their human owner.

## Verification

Automated coverage includes Role eligibility, General composition once, Worker Draft-only tool behavior, Coordinator finalization without commit/push, rejection of unpushed handoffs, and coordinated transient-error recovery without another Worker. A persistent finalization failure preserves passed checks but returns blocked. Existing packet, provider-driver, execution-service and observability tests cover integration and state publication.

These checks verify deterministic boundaries and orchestration. They do not prove that every future Agent will interpret every natural-language amendment correctly. No user project was rerun to validate this change.

## Reflection checkpoint

Roles and responsibilities should clarify accountability and enable completion. They should not turn normal engineering work into repeated requests for user authorization.

The user raised the possibility that repeated harness tightening is restricting Agent judgment too much. Before adding more rules, review actual execution records: which failures were caused by unavailable tools or inconsistent Host contracts, which required Agent judgment, and which were unnecessarily escalated to the user. Treat shorter prompts, fewer constraints and broader technical recovery as valid directions to evaluate; do not assume that more rules improve reliability.

The next design review should judge this boundary by completed user tasks, the number of unnecessary handoffs and recoveries, and the clarity of the final result—not by the quantity of instructions or checks.
