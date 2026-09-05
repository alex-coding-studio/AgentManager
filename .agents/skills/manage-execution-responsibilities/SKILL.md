---
name: manage-execution-responsibilities
description: Create or refine Praxis execution responsibilities for the Development Execution module. Use when a recurring class of Actions needs runtime rules beyond the general execution contract; exclude one-off task instructions and UI design.
---

# Manage Execution Responsibilities

Maintain reusable Role and Responsibility boundaries in Development Execution. Task-specific commands and requirements remain in the Action packet; domain procedures remain in their Skills.

## Model

- `lib/roles/<role>.json` defines a stable workflow Role and its default responsibilities.
- `lib/responsibilities/<id>.json` owns one responsibility: eligible `roles`, assignment hint, rules and explicit overrides. These JSON files are the source of truth; packet pointers reference them without copying definitions.
- General is a shared baseline applied once to every Role, not a Role or an inheritance parent. Do not add `inherits` to new definitions. Legacy General pointers remain readable for existing packets.
- An Agent has a Role and composed responsibilities. Worker can combine Mechanical and iOS Development. Coordinator adds missing Worker duties when a concrete gap is reported; it does not change the frozen task or let Worker choose its own Role.
- Overrides name specific General rule IDs and supply replacements. Unrelated General rules remain. Conflicting overrides fail rather than depending on order.

## Delivery

Worker owns code, compilation, relevant unit tests, all commits and its Draft PR. Its publication tool cannot promote Ready. Worker hands off the final HEAD, PR and evidence to Coordinator.

Coordinator owns coordination, GitHub delivery and result reporting. It receives every Worker handoff, resolves technical delivery issues, invokes Host finalization to verify the clean pushed HEAD and promote Ready, then returns the outcome. Host persists state. Worker success alone cannot mark an Action Delivered. Product choices and user acceptance retain their separate owners.

## Change path

1. Inspect the current Role JSON, applicable responsibility JSON and `docs/EXECUTION_PUBLICATION.md` before editing.
2. Add a definition only for a recurring boundary. Declare compatible Roles. Keep a new rule out of General when it belongs to one responsibility.
3. Update `lib/modules/implementation/execution-responsibilities.ts` only for composition changes; update coordination and tool routing when permissions change.
4. Preserve per-round Manifest reading and immutable amendment references. Read live Role/Responsibility definitions each assignment. Coordinator reads Skill entrypoints; Worker follows their required references.
5. Verify role eligibility, General applied once, explicit override behavior, and the affected tool/handoff boundary with existing tests. Do not add tests that merely mirror prose.
