# Delivery Packet

Card: {{cardId}}
Action: {{actionId}}
Context revision: {{contextRevision}}

## Origin

Read these in order. Skip a file only when you can point to having read that exact filename earlier in this session; if you are unsure, read it. An absent file has nothing for this round.

An Amendment file supplements its named source. Apply the later file only where its explicit content changes or adds to the earlier one.

For an Origin directory, read its numbered files in order. Apply the same exact-filename skip rule to each file inside it.

Only the Responsibility files listed in Origin are active. Other files in Responsibilities are historical records. General is either the sole explicit assignment or inherited from the listed specialized responsibilities; never apply it as a duplicate explicit assignment.

A Responsibility pointer assigns the definition identified by `source`. Resolve a `praxis:responsibility/<id>` source through the Responsibility library named in the Host handoff, then read the definition and follow its declared inheritance before continuing the Action. A legacy pointer may contain the definition path directly in `source`.

{{origin}}

## References

Read these only when you need them.

{{references}}
