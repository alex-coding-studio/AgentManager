# Shared Canvas Node Card Frame

Status: agreed component contract. Implement it after Safe API Error Responses is merged;
this document does not claim that the shared component exists.

## Purpose

What’s Next, Break It Down and What’s That? use graph Cards with the same interaction
grammar but different product meaning. They should share one stable Frame without forcing
Task Node fields onto Domain Entities or turning the Frame into an arbitrary layout system.

The Frame owns appearance, interaction placement and accessibility. Each module owns the
meaning rendered inside it.

## Shared Frame responsibility

The shared Frame owns:

- border, radius, background and shadow;
- horizontal width and density variants;
- Header spacing and alignment;
- the top-left round selection control;
- the kind label;
- title and optional bounded summary placement;
- the top-right details control;
- focused, selected and dimmed states;
- keyboard focus and accessible names;
- optional semantic footer and status slots;
- consistent pointer-event boundaries inside React Flow.

The Frame does not own:

- Formal, Candidate, Run or Entity identity;
- lineage, dependency or Domain relationship meaning;
- Input and Output counts;
- revision, readiness or acceptance state;
- property-panel sections;
- Agent context selection rules;
- Canvas layout or graph traversal;
- module-specific colors or labels.

## Stable interaction grammar

The three primary controls remain distinct:

| Surface                   | Responsibility                                       |
| ------------------------- | ---------------------------------------------------- |
| Round checkmark           | Add or remove the Card from the Agent input boundary |
| Card body                 | Focus the Card and highlight related graph content   |
| Top-right details control | Open the module-specific property panel              |

Opening details does not change the checked selection. Checking a Card does not open
details. Temporary focus does not clear the checked selection.

Modules may omit the round checkmark when their current interaction does not support
multi-selection, but they do not replace it with another control in the same position.

## Density variants

The component supports exactly two earned variants:

```ts
type CanvasNodeCardDensity = 'standard' | 'compact';
```

`standard` serves What’s Next and Break It Down. It supports a longer summary, semantic
footer, Input/Output counts, dependency controls and Candidate or Run presentation.

`compact` serves What’s That? Entity Cards. It supports Entity kind, title, optional one-line
meaning, round selection and details. Fields, relationships, Constraints, provenance and
revision remain in the property panel.

The initial implementation reuses one width and changes only vertical density:

| Density  | Initial width | Initial minimum height | Intended content                           |
| -------- | ------------- | ---------------------- | ------------------------------------------ |
| standard | 288 px        | about 160 px           | Product/Task Card with summary and footer  |
| compact  | 288 px        | about 96–112 px        | Entity title and optional one-line meaning |

These measurements are internal starting values, not user configuration or permanent
design tokens. The first real What’s That? Canvas must test them with Item, Container,
Activity and their labeled relationships. If compact Cards are visibly too wide, change the
compact variant after that inspection rather than adding per-Card dimensions.

## Why width is initially shared

Keeping one initial width preserves:

- Header control placement across modules;
- enough room for longer Entity names;
- consistent property-panel affordance;
- predictable focus and selection geometry;
- stable horizontal graph spacing;
- an optional summary without resizing every Card.

What’s That? does not inherit standard height. A tall empty Entity Card would reduce graph
density and imply missing content.

## Content slots

A plausible interface is:

```tsx
<CanvasNodeCardFrame
  density="compact"
  selected={selected}
  focused={focused}
  selectionControl={<RoundCheckmark />}
  kindLabel="Entity"
  title="Item"
  summary="A physical thing the user records and later finds."
  detailsControl={<OpenEntityProperties />}
  footer={null}
/>
```

The interface should expose semantic slots, not arbitrary geometry props. Do not add
`width`, `height`, `headerGap`, `footerHeight`, per-corner radius or freeform internal
padding configuration merely to make every existing Card fit unchanged.

## Module ownership

### What’s Next

What’s Next supplies:

- Source, Direction, MVP or Feature kind;
- Product title and bounded summary;
- Input/Output and revision footer;
- Candidate, refining and Run content;
- dependency count and details;
- current multi-selection behavior.

### Break It Down

Break It Down supplies:

- task/module kind;
- decomposition title and boundary summary;
- Input/Output and revision footer;
- dependency count and details;
- Candidate, refining and Run content;
- its current selection behavior.

### What’s That?

What’s That? supplies:

- Entity kind;
- Entity title;
- optional one-line product meaning;
- round checkmark for Agent Context;
- Entity property-panel control.

It does not fake Task Graph fields such as zero Inputs, zero Outputs, Formal state or a
dependency count. Domain relationships remain labeled edges and property-panel content.

## Focus and relationship reading

The Frame accepts focused, selected and dimmed presentation from its Canvas. It does not
calculate graph neighbors.

What’s That? focuses an Entity by keeping that Card and directly related labeled edges
prominent while unrelated content dims. Multi-selection remains an Agent Context boundary;
focus remains a temporary reading aid.

The Frame does not use relation-type colors. Relationship meaning belongs to concise edge
text such as `is a`, `contains` or `records`.

## Layout boundary

The Frame reports or measures its rendered size for the Canvas layout adapter. It does not
own coordinates.

What’s Next and Break It Down retain their current deterministic Task Graph layout. What’s
That? uses deterministic system layout with non-draggable Entity Nodes. No Frame variant
introduces user-saved coordinates.

## Accessibility

- Selection, focus and details have independent accessible names.
- The Card body is keyboard-focusable only when it performs a focus action.
- Nested controls stop propagation so they do not also focus the Card.
- Selection state uses `aria-pressed` or the equivalent checkbox state.
- Details identifies the Entity or Node title in its accessible label.
- Focus and selection never rely only on color.
- Compact density preserves minimum pointer target sizes even when content is short.

## Implementation sequence

After Safe API Error Responses merges:

1. identify the stable shell inside the current `GraphNodeCard`;
2. extract the Frame without changing What’s Next or Break It Down behavior;
3. keep `GraphNodeCard` as a module adapter around the shared Frame;
4. cover standard rendering, selection, focus, details and footer slots;
5. visually compare the refactored existing Canvases with their pre-refactor state;
6. use the compact variant when the first What’s That? Entity Card is implemented;
7. test real Entity density before changing compact width.

Do not combine this extraction with Domain Model persistence, Harness execution or a broad
Workspace component split. The Frame refactor should be independently reviewable and
behavior-preserving for existing modules.

## Acceptance

- What’s Next and Break It Down retain current layout and behavior after extraction.
- Selection, focus and details remain independent.
- Existing Task Graph semantics stay outside the Frame.
- A compact Entity Card requires no fake Task Graph data.
- The component exposes only standard and compact density.
- Compact Cards remain readable with optional summaries and without empty standard-height
  space.
- The real Canvas shows no overlap, clipped controls or inaccessible nested actions.
- Repository CI Required Status Checks pass on the exact PR head.
