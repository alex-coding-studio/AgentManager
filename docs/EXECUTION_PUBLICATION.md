# Execution publication

`npm run publish:execution-candidate` reads one CandidatePublishRequest JSON object from standard input and returns one CandidatePublication JSON object. The Agent-facing `publish_candidate` tool invokes this script; callers provide a title, body and optional `ready` flag. The Host supplies the assigned workspace and identity.

The script owns checking the Card branch and allowed pending files, committing pending changes, resolving the assigned repository, creating the initial private repository and empty baseline when needed, pushing, and creating or updating the PR. Existing commits are reused when no files changed. The commit title is the supplied delivery title.

Initial publication uses `alex-coding-studio/<project directory name>`. Existing remotes must match the assigned repository. A resumed initial publication checks the existing remote baseline against the Card's original empty root commit before pushing. An existing Ready PR returns to Draft before unvalidated changes are pushed. A new PR is always created as Draft before optional promotion.

The Worker `publish_candidate` tool always maintains a Draft PR, including when an older session passes `ready: true`. After code, compilation, relevant unit tests and all commits are complete, Worker hands off the exact HEAD, Draft PR and evidence. Coordinator owns final delivery: `finalize_delivery` verifies the clean local HEAD and already-pushed remote HEAD against that handoff, then promotes the existing Action PR Ready. It never stages, commits or pushes code. Host records Delivered only after Coordinator completion and verified final publication. Valid unchanged evidence is reused; repository hooks and the supported deferred pre-push policy remain enabled.

On failure, the script returns a nonzero exit and the original failure message. Commits and external resources already created remain available for a subsequent invocation. The script never runs bootstrap, accepts an Action, merges a PR, or starts another task.

## Responsibility and evidence boundaries

Manifest.md is a mutable index and must be read on every assignment, including resumed Worker sessions. Exact-filename skipping applies only to immutable Origin files already read in the same session. Newly listed amendments must be read and applied. A previous passing checklist does not complete a new user-requested change; the Worker summary must address the current delta, including a specific evidence-backed explanation when no change is necessary.

Role JSON in `lib/roles` defines workflow position and default responsibilities. Responsibility JSON in `lib/responsibilities` defines eligible roles and composable rules. General applies once as a common baseline, independently of role defaults and task additions. New definitions do not use inheritance. Existing General pointers and legacy inherited definitions remain readable as compatibility inputs. Coordinator assigns only Worker-compatible task responsibilities; it holds coordination, GitHub delivery and result reporting itself. Reviewer holds review duties. Explicit rule overrides preserve unrelated baseline rules and reject conflicts.

Every completed Worker handoff returns to Coordinator. GitHub finalization failures return to that same Coordinator session for bounded recovery; they do not require a repeated user instruction. Code changes go back to Worker and stay in the same Action Draft. Pure publication verification can be repeated by Coordinator without rerunning Worker code or tests. Only a real product choice, destructive tradeoff or missing external access calls for the user.

VerificationPlan includes the previous output alongside selected evidence references. New Worker sessions read the required files, but should not rediscover supplied facts through broad Memory or historical directory searches. Repair retains the confirmed task and successful evidence, names a concrete changed approach, and targets the unresolved blocker.

## Local setup readiness

After updating shared setup infrastructure, run `node --experimental-strip-types scripts/check-setup-readiness.ts INFRA_ROOT INSTALLED_SETUP_SKILL_DIR EXPECTED_GIT_REVISION`. It compares the actual consumed bootstrap, pre-push hook, installed Skill and its tooling reference with the explicit source revision. A plugin installation alone is not readiness. This read-only deployment check belongs to the updating agent, not every project Worker.
