# Break It Down Product Evolution

Status: shared Run infrastructure, Proposal workspace and module-scoped Intention Profiles
are delivered. Break It Down's existing decomposition semantics remain the default while
Motion and Recompose stay in the final slice.

## Current product boundary

Break It Down turns one selected Formal Node and bounded evidence into an inspectable
Candidate working set. It remains independent from What's Next and Just Do It. A user may
decompose an existing project, Product Design, implementation approach or direct request
without passing through another AgentManager module first.

## Workspace parity with What's Next

Break It Down and What's Next are two Harnesses over the same Agent Graph Workspace. They do
not own separate product shells.

Both modules share:

- Source, Candidate and Formal Node presentation;
- Canvas layout, Card Frame, selection, focus and relationship reading;
- Composer, Context picker and `AgentRunControls`;
- Running Card, elapsed time, current activity and latest update;
- top-left `LatestResponse` and proposal-level Agent Response;
- Summary, Log, raw evidence and fresh-Session recovery;
- Markdown output, feedback, refine, accept and discard flows;
- Intention and Motion controls; and
- proposal working-set visibility and batch management.

## Standard Agent Graph input

Every Agent Graph module receives one standard Input Packet rather than defining a text-only
request shape:

```text
instruction
selectedContext
contextRefs
attachments
profile
moduleOperation
```

`instruction` is the user's direct language. Selected graph objects, Context Library
documents and temporary attachments are equally valid input evidence. Attachment bodies are
written to the Run's Context Workspace; the packet carries bounded metadata and logical and
workspace paths instead of embedding file bodies in JSON. Markdown is the first supported
attachment adapter, not a permanent restriction on the packet.

The standard Composer presents the same order in What’s Next, Break It Down and What’s That:
primary instruction, collapsed optional sources, Agent/model/reasoning controls and the
primary action. A module supplies operation wording and Harness semantics without forking the
Composer structure.

Their differences belong behind those surfaces:

- Core Harness: What's Next grows outward; Break It Down partitions inward.
- Intention Profiles: each module defines different desired outcomes and stopping rules.
- Context assembler: each module selects different graph neighbors and evidence.
- Motion validator: each module validates different legal Candidate transformations.

When one module develops a generally useful shell capability, the default decision is to
extract or extend the shared workspace capability and adopt it in both modules. A module may
keep distinct wording or disable an operation its Harness cannot yet support, but it should
not fork the surrounding interaction model.

The current implementation already owns:

- stable Formal Node and Candidate identities;
- Candidate versus Formal Node lifecycle separation;
- Candidate `output.md` artifacts;
- lineage and execution dependency validation;
- inherited Resources, Context Workspace and per-Run attachments;
- Codex and Claude model selection;
- provider Session continuation when transport and model still match;
- strict one-to-one Candidate revision;
- append-only sibling discovery;
- Candidate acceptance, discard and system-Trash cleanup; and
- shared graph Card presentation through `CanvasNodeCardFrame`.

These are delivered capabilities and should not be rebuilt merely to align visual structure
with newer modules.

## Observed MVP limits

A real HereItIs decomposition produced one Formal Source and nine useful Candidate modules.
The run took about four and a half minutes and returned a large structured result. That
successful output exposed the limits of the original shell:

- the header reported one Node while nine Candidates occupied the Canvas;
- fitting the complete working set made every Card difficult to read;
- the Run retained `request.json`, `run.json` and Candidate outputs but no activity log,
  bounded Summary, user-facing Response or bounded raw output;
- the UI polled status without showing current observable activity or latest update;
- clarification, insufficient evidence, no change and failure became graph outcome Cards;
- the whole proposal had no Response explaining partition rationale, coverage or unresolved
  decisions;
- Candidate metadata appeared as raw JSON; and
- documented proposal-level Recompose behavior was not executable.

The next work should address those limits without changing the validated default
decomposition behavior.

## Shared information model

Break It Down adopts the shared Summary and Log context model:

```text
task-decomposition/runs/RUN-<uuid>/
├── request.json
├── run.json
├── activity.jsonl
├── summary.md
├── response.md
├── agent-output.txt
└── candidates/
    └── CANDIDATE-<id>/
        └── output.md
```

The records have distinct responsibilities:

- `request.json` owns the exact captured packet and provider prompt.
- `run.json` owns identity, lifecycle, selected profile, timestamps, usage, result and error.
- `activity.jsonl` owns bounded public progress events and never private reasoning.
- `summary.md` owns the concise current result, retained decomposition decisions, unresolved
  questions and next relevant context.
- `response.md` owns the human-readable proposal-level Agent Response.
- `agent-output.txt` retains bounded, redacted raw provider output for diagnosis.
- Candidate `output.md` owns each Candidate's independently readable meaning.

Writing a log does not inject it into later model context. A fresh Session receives the
current instruction, current Formal/Candidate state, relevant bounded Summary, user feedback
and a Context index. Detailed records are read only for a concrete evidence need. Provider
Session continuation remains an optimization rather than the correctness boundary.

## Agent Response versus Candidate Cards

One Run produces one Agent Response and zero or more Candidate Cards.

The Agent Response explains:

- why this partition was chosen;
- which boundaries it covers;
- which overlap or duplication it avoided;
- which ambiguity or evidence gap remains; and
- what the user can do next.

Candidate Cards contain only their own scope, boundary, relationships and content. The
Canvas may temporarily show one Running Card because it occupies the location where results
will appear. Clarification, insufficient evidence, no change, failure and cancellation
belong in the shared top-left `LatestResponse` surface and do not become graph objects.

## Shared proposal workspace

Formal Nodes and unaccepted Candidates are different counts and different user decisions.
The workspace should report both, for example:

```text
Formal Nodes 1 · Current Candidates 9
```

The current proposal should remain readable without fitting all historical work into one
viewport. Candidate details render named product sections from metadata instead of exposing
raw JSON by default. Proposal-level Response and actions stay separate from any one
Candidate's property panel. This is shared workspace behavior, not a Break It Down-specific
panel.

## Intention profiles

The internal concept and shared control remain `Intention`. The Break It Down UI labels it
`拆解目的`; What's Next may use wording appropriate to exploration.
Intention answers why the user wants this scope decomposed and changes the Harness stopping
rule and expected Candidate metadata. It never replaces the required concrete instruction.

The existing behavior becomes the default profile:

- `understanding` / `理清结构`: form coherent, sibling-distinguishable boundaries at a
  human-manageable resolution.

Profiles may be added individually after evaluation:

- `product-modules` / `产品模块`: identify product capabilities or modules without turning
  them into delivery tasks;
- `implementation-approach` / `实现方案`: partition technical responsibility, data flow and
  integration boundaries without prematurely defining commits or pull requests;
- `delivery` / `交付拆分`: form implementation-ready boundaries with explicit dependencies
  and evidence expectations; and
- `risk-analysis` / `风险分析`: identify independent risk surfaces and mitigations only after
  real cases justify the profile.

The Harness structure becomes:

```text
Core Decomposition Harness
+ Intention Profile
+ required user Instruction
+ current bounded Context
```

## Motion and Recompose

The internal concept and shared control remain `Motion`. The Break It Down UI labels it
`调整方式`; both modules keep the shared Unspecified, Diverge and Converge vocabulary while
their validators define different legal graph changes.
Vocabulary is:

- `unspecified` / `未指定`;
- `diverge` / `发散`;
- `converge` / `收敛`; and
- proposal-level `recompose` / `重组`.

Motion is not exposed during the shared-Run retrofit. Initial decomposition already creates
multiple parts, and the current runtime cannot honestly apply Converge or Recompose to a
working set.

Before Motion is enabled, the product needs:

- round-checkmark multi-selection for unaccepted Candidates;
- a proposal-level operation schema;
- N-to-M Candidate identity reconciliation;
- explicit retain, replace, split, merge, add and remove effects;
- dependency and protected-Node impact validation; and
- presentation of the resulting working-set change.

Strict one-to-one `修订` and append-only `补充` remain supported narrower operations.
Accepted Formal Nodes remain immutable during Recompose.

## Delivery slices

### Slice 1: Shared Agent Graph Run envelope and Response

- extract or extend shared Run activity, bounded Summary, Agent Response and redacted raw
  evidence used by both modules;
- expose the same elapsed time, current activity and latest update presentation;
- make fresh Sessions independent of provider transcript history;
- use the shared `AgentRunControls` and Composer structure;
- use the shared top-left `LatestResponse` presentation; and
- stop rendering non-proposal outcomes as graph Cards in either module.

Acceptance:

- a Running Card shows objective elapsed time and current observable activity;
- completed, clarification, insufficient-evidence, no-change, failed and canceled Runs have
  accurate Latest Response presentation;
- a canceled or failed Run changes no Formal Node or Candidate;
- a fresh reader can recover Run Summary, Response and evidence from disk; and
- existing proposal, append, revise, accept and discard behavior remains unchanged; and
- What’s Next behavior and visual structure do not regress during extraction.

### Slice 2: Shared proposal workspace

- separate Formal and Candidate counts;
- focus the active proposal without shrinking the complete graph into unreadability;
- present one proposal-level Response; and
- render Candidate metadata as product sections through shared components.

Delivered behavior:

- What’s Next and Break It Down use the same compact Proposal status control;
- the complete graph remains available through the Canvas Fit View control while proposal
  focus keeps the current working set at a readable zoom;
- Candidate metadata is rendered as named product sections rather than raw JSON; and
- Candidate discard reconciles persisted proposal evidence with the in-memory working set.

### Slice 3: Intention profiles

- compose Core Harness plus one selected profile;
- keep `理清结构` as the default and backward-compatible behavior;
- add profiles one at a time with fixtures and real decomposition evaluation; and
- keep the user instruction required.

Delivered behavior:

- the shared registry and selection control define one Profile interface without sharing
  Profile content across modules;
- What’s Next owns MVP Exploration, Feature Synthesis and Product Design Completion;
- Break It Down owns Understand the structure, Product modules, Implementation approach and
  Delivery breakdown;
- the selected Profile is persisted in the Run and request packet, participates in Session
  reuse and composes into the Core Harness; and
- Break It Down validates the metadata contract required by its selected Profile.

### Slice 4: Motion and Recompose

- introduce Candidate working-set selection;
- validate N-to-M Recompose atomically;
- preserve accepted Formal Nodes and protected dependencies; and
- present retained, replaced, split, merged, added and removed boundaries through the shared
  Motion and proposal controls.

## Explicit non-goals

The first update does not:

- force Break It Down to follow What's Next or precede Just Do It;
- redesign stable graph identity or Candidate promotion;
- inject complete raw Run history into every Session;
- impose a universal Candidate count;
- expose Motion before Recompose exists;
- replace Cards that already use the shared Frame; or
- create another Break It Down-specific workspace shell; or
- make delivery status part of Formal Node product meaning.
