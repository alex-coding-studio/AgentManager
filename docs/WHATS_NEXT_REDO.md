# Re-propose from a Parent Node

Re-propose is an execution action, not a request to compare alternatives. Clicking
**Re-propose** means the user abandons the current unaccepted proposal. There is
no extra confirmation dialog and no post-generation replacement review.

## User flow

1. Open the parent Node's plus action and choose the whole-proposal mode.
2. Review the automatically included previous instruction, complete Last Response,
   and latest Candidate outputs. Enter the current Correction separately.
3. Click **Re-propose**. The application snapshots required context, moves the
   abandoned proposal Runs to system Trash, and starts generation.
4. The old cards disappear and one loading card appears. Generated Candidates
   replace that loading card directly, using the normal card-by-card reading,
   Refine, and Accept interactions.

Generation failure or cancellation does not restore the abandoned cards. They
remain recoverable through system Trash, not an application recycle bin. The
parent survives; the user can retry generation from it.

## Protected boundaries

Do not allow whole-proposal abandonment if any direct child is a Formal Node.
Also reject shared origins, external dependencies, or proposal files still used
outside the affected group. These checks run on the server before moving files.
Application mutations are serialized during preparation and abandonment.

New Candidates use new UUIDs. Re-propose never refines the parent or rewires
unrelated Nodes. The What's Next Harness's product-design strategy and output
schema are unchanged; single-Candidate Refine and additive exploration keep
their existing meanings.

## Context and storage

Whole-proposal Re-propose starts a fresh provider Session with the selected
parent, the current correction, and a bounded previous-proposal snapshot.
The complete Last Response includes Reflection, next-step advice, and output
documents. Other current Candidate revisions are added only when not already
present. The composer preview and runtime use the same snapshot builder.

Required prior Resources, including explicitly selected files inside abandoned
Runs, are copied into the new Run before the old directories move to system
Trash. This permits subsequent rounds and downstream reading without depending
on discarded files.

The new Run records transitive superseded Run IDs before cleanup. Reads exclude
abandoned Runs even if Trash cleanup fails, so old cards cannot resurrect.
If cleanup fails, no Agent starts and the Run reports the failure; files not
moved remain on disk. The application does not silently restore the old proposal.

## Verification

Isolated fake-CLI tests cover immediate abandonment before generation, normal
Candidate publication without a second action, Formal-child and external-reference
guards, preserved input snapshots and copied Resources, failure, cancellation,
Trash failure, and successive Re-propose rounds.

The development-only `?preview=redo-flow` fixture illustrates the transition from
old cards to a running request and directly to new Candidate cards.
