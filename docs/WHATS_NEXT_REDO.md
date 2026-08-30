# Redo an Unaccepted Proposal

This is an interaction and runtime feature, not a change to the What's Next
Harness's product-design strategy, semantic-resolution policy, or output schema.

## User flow

1. Open the parent Node's plus action and choose **Redo proposal**.
2. Explain what the current proposal misunderstood and what is wanted instead.
   The composer shows the previous instruction and readable current output
   documents as automatically included context, separately from the new
   Correction. The full previous-response preview uses the same snapshot builder
   as the Agent request, including the original proposal instruction, complete
   last response (Reflection, next-step advice and outputs), and latest revisions
   of other current Candidates. Identical outputs already present in that response
   are not repeated in the request snapshot.
3. Generate a replacement. Original Candidate Cards and their edges remain intact
   while the request runs, and on failure or cancellation.
4. Open **Review replacement** to read the complete new response.
5. Choose **Keep original** or **Replace proposal**. Only the latter publishes the
   new Candidate set and moves superseded proposal Runs to system Trash. The new
   Candidates are not automatically accepted as Formal Nodes.

The scope is the current unaccepted direct-child proposal under the selected
parent, including the latest versions of its Candidates and their revision
history. Node count may change. The parent itself is not refined or replaced.
No redo is allowed if any direct child is already a Formal Node. This is checked
both before generation and when confirming replacement, not only in the UI.

Candidates shared with other origins, protected Run contents, external dependency
references, and externally used proposal Resources prevent wholesale replacement.
They must be resolved explicitly; this action never silently rewires other branches.
Single-Candidate Refine and ordinary additive exploration retain their meanings.

## Context and identities

Whole-proposal redo starts a fresh provider Session from the selected parent,
current feedback, the latest proposal text and Reflection, and relevant Resources.
It does not replay the entire conversation history. This lets a rejected redo be
discarded without contaminating the original provider Session. Ordinary Refine and
Continue retain their existing reuse behavior.

The previous response is a bounded, required Workspace file, explicitly described
as evidence of what the user is correcting rather than instructions to preserve.
Relevant files are copied into the new Run before generation so replacing the
old proposal cannot remove Resources still needed by the new one. New directions
receive new application-owned UUIDs; no old Candidate identity is reassigned.

## State and safety

A replacement remains pending until the user decides. Pending Candidate outputs
cannot be accepted, refined, used as graph context, or mistaken for live children.
The original scope is protected from concurrent application mutations. A digest
of the original Candidate snapshot is checked again at confirmation; stale results
cannot overwrite intervening changes.

Confirmation publishes one authoritative replacement record before cleanup. Reads
exclude superseded Runs even if moving files to system Trash fails; that cleanup
failure is reported, not hidden. Failed and canceled generation never publishes
replacement Candidates. Keeping the original moves only the abandoned new Run to
system Trash. The application does not provide its own recycle bin.

## Verification

Integration tests use an isolated fake CLI and test-only Trash adapter, never a
paid model or the user's planning data. They cover 2-to-3 replacement, retained
originals until confirmation, Candidate acceptance guards, Formal-child guards,
copied Resource survival, rejecting the replacement, provider failure,
cancellation, stale snapshots, and external dependencies.

`?preview=redo-flow` provides a development-only review fixture. Its keep/replace
actions change only in-memory fixture state and do not call the project API.
