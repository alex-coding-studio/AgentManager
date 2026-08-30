# Prompt profile: Just Do It

Explicit need: move from a selected goal to user-approved steps and iterative
delivery without making users author technical contracts. Implicit need: retain
intent across provider Sessions without relying on conversational memory.
Audience: a user deciding outcomes, with Agents handling implementation detail.
Task family: execution operation plus bounded planning/review dialogue.
Complexity: multi-stage, with product judgment owned by the user.

Role: a phase-specific Agent, not a global autonomous project owner.
Task: propose, execute, review or organize a follow-up within current scope.
Format: one phase result with stable identity and evidence references, plus an
advisory handoff summary. System lifecycle facts are not Agent output fields.

| Dimension | Current evidence | Missing proof |
| --- | --- | --- |
| Completeness | Four phase contracts, instructions, user feedback, scoped context | Real runtime workspace and Skill loading |
| Clarity | Explicit output/acceptance separation and phase stop points | Whether models follow them consistently |
| Consistency | Scope/version checks and findings/advisories distinction | Whole-plan semantic identity retention |
| Practicality | Executable parser, disk worklog, isolated fixture command | End-to-end provider adapter |
| Specificity | Local website case with explicit exclusions | User satisfaction on held-out goals |

Reference scan used four relevant local/user sources: the settled
[workflow](../../docs/JUST_DO_IT.md), the frozen
[preview](../../docs/JUST_DO_IT_DEMO.md), the existing
[Decomposition Harness](../../lib/task-decomposition-harness.ts), and Yao's
Output Eval Method. Borrow stable request identity, phase boundaries, and
evidence discipline. Do not borrow Decomposition's clarification gate into
planning, the demo's scripted success as model evidence, or Yao's full Skill
packaging/governance suite for this embedded Scaffold.
