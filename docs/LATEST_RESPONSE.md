# Shared Latest Response

Status: agreed shared presentation contract. What’s Next should adopt it when the shared
component is implemented; What’s That? uses it from its first UI slice. No code behavior is
claimed by this document.

## Purpose

Latest Response answers one question: what did the most recent completed Agent operation
return? It occupies the established top-left Canvas position. The Canvas shows current
state, the bottom Composer starts or controls the next operation, and Latest Response
explains the most recent outcome.

Ordinary successful responses remain quiet. A clarification, decision, warning or error
must be visible without opening the Card. Prominence follows required user attention rather
than whether an Agent produced a long response.

## Shared component boundary

What’s Next and What’s That? share one Card shell, collapsed header, status icon, attention
treatment, unread state and expand/collapse behavior. Each module supplies its own summary,
details and supported actions.

The component receives structured presentation state. It never infers severity by scanning
Agent prose for words such as `warning`, `failed` or `error`.

```ts
type LatestResponseTone = 'neutral' | 'attention' | 'warning' | 'error';

type LatestResponseAttention =
  'none' | 'unread' | 'action-required' | 'resolved';

type LatestResponsePresentation = {
  tone: LatestResponseTone;
  attention: LatestResponseAttention;
  title: string;
  summary: string;
  details: unknown;
  action?: {
    label: string;
    kind: 'focus-composer' | 'retry' | 'undo' | 'open-details';
  };
};
```

`details` is a UI slot rather than canonical persisted data. Modules derive it from their
validated Run result and saved artifacts.

## Outcome mapping

| Outcome                  | Tone      | Default state   | Default open |
| ------------------------ | --------- | --------------- | ------------ |
| Applied / proposal ready | neutral   | none            | no           |
| No change                | neutral   | none            | no           |
| Canceled                 | neutral   | none            | no           |
| Clarification            | attention | action-required | yes          |
| User decision required   | attention | action-required | yes          |
| Non-blocking warning     | warning   | unread          | no           |
| Validation failure       | error     | action-required | yes          |
| Agent failure            | error     | action-required | yes          |

An applied result may use a small green check icon inside the neutral Card. It does not use
a large green surface. A no-change or canceled result uses a neutral dash. A non-blocking
warning uses an amber dash rather than a red X.

## Collapsed state

The collapsed row communicates the outcome without requiring expansion:

```text
✓ Latest response · Model updated
! Latest response · Answer needed
– Latest response · Warning
× Latest response · Failed
```

Color is supplemental. Icon, label and summary must independently communicate the state.
Do not use flashing, pulsing or motion to demand attention.

## Attention behavior

Clarification, decision-required and error outcomes open when first delivered and retain
their highlighted treatment until the user performs the relevant action or explicitly
acknowledges them. Opening the Card alone does not resolve an action-required state.

Warnings are visible in the collapsed row but remain non-blocking and do not auto-open.
Neutral outcomes remain collapsed unless the user previously left the shared Card open.

The latest completed outcome replaces the Card content. Earlier outcomes remain in the
module's Run or revision history. Starting a new Run does not erase the prior completed
response while the Composer shows running progress.

## Actions

- An applied What’s That? model revision may expose `Undo this change`.
- Clarification or a decision-required response uses `focus-composer` to place the answer in
  the existing input flow.
- Warning uses `open-details` when more context exists.
- Error uses `open-details` by default.
- Retry appears only when repeating the operation can plausibly change the result. A fixed
  unsupported environment or unchanged deterministic validation failure must not offer an
  ineffective Retry.

No action silently accepts a Candidate, changes a Domain Model or advances another module.

## Module content

What’s Next uses the shared Card to show Reflection, proposal/no-change, clarification,
decision-required state, validation failure and relevant warnings.

What’s That? uses it to show the concise validated model change:

```text
Added
- Container is a Item
- Container contains Item

Derived
- Container contains Container

Updated outside the selected Context
- Activity accepts Container movement
```

The Domain response shows affected Entities, relationships, Constraints and any expansion
beyond the selected discussion boundary. It does not show private chain-of-thought or the
raw provider response.

## Accessibility

- never rely on color alone;
- expose status text to assistive technology;
- retain keyboard expansion and action access;
- keep focus on the triggering control unless an explicit action moves it to the Composer;
- use `aria-live` for newly delivered action-required outcomes without repeatedly announcing
  a persistent Card;
- respect reduced motion by avoiding attention animation entirely.

## First shared implementation

After the request-security, atomic-store and quality-gate foundations merge:

1. extract the current What’s Next Latest Response shell into a shared component;
2. preserve the existing neutral What’s Next success behavior;
3. add structured attention, warning and error states;
4. cover collapsed communication, default expansion and action-required persistence;
5. use the same component in the first What’s That? workspace;
6. inspect the real Canvas placement so the Card does not overlap graph controls or the
   bottom Composer.
