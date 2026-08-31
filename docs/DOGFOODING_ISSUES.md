# Dogfooding issues

Record product-output and UI findings here while the HereItIsV2 trial focuses on Agent output.
GitHub Issues is currently disabled for this repository. Recording a finding
does not authorize implementation or changing the live trial's Harness.

## Hide the origin add control during downstream generation

- Reported: 2026-08-30, initial What's Next generation in HereItIsV2.
- Status: recorded; fix deferred until after the output-evaluation round.
- Observed: the origin Card still displays its plus button while the connected
  right-hand placeholder shows an active Codex run.
- Expected: hide that origin's add/expand control while its generation is running
  or validating. Keep the running placeholder's cancel action available.
- Restore the origin control after success, failure, or cancellation when no
  associated generation remains active. Unrelated Nodes remain usable.
- Preserve Card geometry and connection endpoints while hiding the control.
- When implementing, check other consumers of the shared graph Card for the
  same interaction; do not treat that as authorization to change them now.
- User evidence: `Snapzy_2026-08-30_16-04-46_697.png`.

## Keep the App-building goal while deepening an accepted direction

- Reported: 2026-08-30, after accepting the initial three What's Next directions
  and expanding the recording direction in HereItIsV2.
- Status: observed; Harness changes deferred. User-driven correction trial pending.
- Original goal: build an iOS App that represents real-world organization and
  allows the user to retrieve an item's location. The initial directions covered
  finding objects, recording their placement, and keeping records accurate after changes.
- Selected Node: `NODE-8447d0cc`, "顺着装盒和上架，把整理结果记下来".
- Evidence Run: `RUN-b0f39143-fbb8-4928-a469-92f85c23b67c`, Harness revision 3.
  Preserve these excerpts in the issue because Re-propose may move the old
  proposal artifacts to Trash; this entry does not change the live trial.

### Observed input and response

The user described creating rooms/scenes and a bookcase in the App, recording a
box and its contents, placing it in the first shelf position, and finding a USB
cable through its complete location. The input explicitly ended with:

> 那现在的问题是 我该如何把这一个方向一步步落地到我的 APP 上

That complete instruction was present in the captured request packet. This is
not evidence of a missing user instruction or a failed input transmission.

The Agent returned "装好一盒后，顺手记全盒内物品" and
"盒子上架时，确认一条能指向实物的位置". The response emphasized trying a
real box, checking recording burden/omissions, and checking that a location
description identifies the physical box. It postponed comparison with App
operations to a subsequent round. The response still mentioned App behavior,
but added little product design beyond the scenario the user had already supplied.

### Expected direction of progress

Once the chosen capability is concrete and the user explicitly asks to realize
it in an App, further exploration should move toward a small, tangible product
slice, not indefinitely subdivide the real-world activity or its validation trials.
This is an intent-based transition, not a hard rule to start implementation after
exactly two or three rounds.

For this case, a useful proposal could scope a minimal recording module in which
the user can perform the described actions and inspect the result in the App:
create a space/room and bookcase, place a box or item, and see where it resides.
These are user-supplied examples, not a prescribed entity schema. The proposal
should explain the capability, interaction boundaries and visible outcome that
would make the MVP worth trying. What's Next need not write code or choose a
database immediately, and the issue does not prescribe the existing HereItIs
data model as the answer.

### Planned recovery trial — not yet evaluated

The user will use Re-propose for the whole unaccepted proposal and explicitly
request exploring an App MVP. Their intended feedback is:

> 我现在想把这个落地到 APP 上 看看能不能走一个 MVP 能不能帮我去开始往这方面探索

Observe whether the response shifts toward an actionable App capability and
visible interaction, rather than repeating physical-organizing experiments.
The user remains the judge of whether the proposal is satisfactory. Do not
execute Re-propose on their behalf, add hidden hints, alter the Harness, or claim
recovery before seeing the actual next input and output.
