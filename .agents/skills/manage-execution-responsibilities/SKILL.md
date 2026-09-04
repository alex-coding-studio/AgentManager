---
name: manage-execution-responsibilities
description: Create or refine Praxis execution responsibilities for the Development Execution module. Use when a recurring class of Actions needs runtime rules beyond the general execution contract; exclude one-off task instructions and UI design.
---

# Manage Execution Responsibilities

Add a responsibility only when repeated execution work needs a stable behavioral boundary that cannot live in an Action packet or an existing domain Skill.

## Contract

- Keep `general` as the default base for every Worker. Each specialized responsibility inherits it and stores only its own additions.
- A specialized responsibility contains only its additions and explicit overrides to `general`; never copy the base rules into it.
- Give every general rule a stable ID. An override names only the inherited rule it replaces and leaves every other general rule active. For example, a future `script-maintainer` may override `script-source-inspection` without weakening packet or reporting boundaries.
- Responsibilities compose. When one Worker task has multiple natures, compile `general` once and apply every selected addition.
- Keep task-specific scope, commands, inputs, outputs and acceptance criteria in the Action packet.
- Keep domain procedures in their owning Skill. A responsibility controls execution behavior and evidence boundaries without reproducing a Skill body.
- The Coordinator first summarizes the task at a high level, then selects and assigns at least one responsibility after reading the Action packet and applicable Skill. The Worker cannot choose, remove or reinterpret them.
- Coordinator context stops at the applicable `SKILL.md` entrypoint. The Worker reads that entrypoint again, then follows only its required references. `general` denies black-box script inspection unless an assigned specialized responsibility explicitly overrides that named boundary.
- When a Worker reports that the assigned roles cannot complete part of the packet, the Coordinator may replace or append a responsibility while keeping the finalized packet and acceptance criteria unchanged. The changed role must address the reported gap; the Worker still cannot expand itself.
- Apply responsibilities during Development Execution. Do not expand planning, review, or UI behavior unless the requested change requires it.

## Current responsibilities

- `general`: execute the frozen packet, honor its checklist, report the result or exact unmet need, and stop without coordinating follow-on work.
- `mechanical`: treat a declared script or tool as the black-box execution and error boundary. Run it once and report its result without inspection, decomposition, supplementation or repeated verification.
- `ios-development`: prefer criterion-linked TDD for unit-observable behavior, avoid artificial Red and low-value tests, and limit unit-test evidence to unit behavior. UI and visual acceptance remain in Review.

## Change path

1. Edit `lib/modules/implementation/execution-responsibilities.ts` as the source of responsibility IDs, inheritance and runtime instructions.
2. Update the Coordinator contract and structured response in `lib/modules/implementation/coordination.ts`. Responsibility selection belongs here rather than in the Plan.
3. Compile the Coordinator's selected responsibilities into the Worker packet in `lib/modules/implementation/coordination-runner.ts`. The Coordinator assigns roles and suspends; the Worker follows every assigned responsibility, reports its result, and stops.
4. Update `docs/JUST_DO_IT_PLANNING.md` and `docs/JUST_DO_IT_EXECUTION.md` only when the public contract changes.
5. Verify observable invariants: every responsibility includes `general`, specialized additions compose without duplicating the base, an override replaces only its named general rule, missing values resolve to `general`, and the Worker receives exactly the Coordinator's selections. Avoid tests that only mirror prose.

Do not add a responsibility for a single failure, provider, model, repository, command, or temporary workaround. Let real use reveal the next responsibility before extending this set.
