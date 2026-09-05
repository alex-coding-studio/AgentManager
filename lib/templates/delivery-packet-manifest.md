# Delivery Packet

Card: {{cardId}}
Action: {{actionId}}
Context revision: {{contextRevision}}

## Origin

Read Manifest.md on every assignment, including resumed sessions. This index changes when amendments are added; its filename is not evidence that its current contents were read. Never apply the skip rule to Manifest.md itself.

Read the referenced files below in order. Skip an immutable referenced file only when you can point to having read that exact filename earlier in this session; if you are unsure, read it. Every newly listed Amendment must be read. An absent file has nothing for this round.

An Amendment file supplements its named source. Apply the later file only where its explicit content changes or adds to the earlier one.

Complete the current User Input and Assignment amendments before reporting delivered. Prior passing checks prove the earlier result, not completion of new requested work. State the outcome of this round's requested change in the final summary. An unchanged HEAD alone is not a reason to skip requested changes; if no change is needed, explain why the current request is already satisfied using current evidence.

For an Origin directory, read its numbered files in order. Apply the same exact-filename skip rule to each file inside it.

Role: Worker. Read `../roles/worker.json` relative to the Host's Responsibility library and apply its default responsibilities, plus the Responsibility pointers listed in Origin. General is the shared baseline applied once to every Role. Responsibilities compose; they do not inherit General or change the Role. Legacy general pointers mean the baseline, not an additional Role. Only the Responsibility files listed in Origin are active task additions. Other pointer files are historical records.

A Responsibility pointer assigns the definition identified by `source`. Resolve a `praxis:responsibility/<id>` source through the Responsibility library named in the Host handoff. Apply explicit rule-level overrides and report conflicting overrides; ordering never silently resolves a conflict. Role and Responsibility library definitions are live system rules, so read their current contents each assignment. A legacy pointer may contain the definition path directly in `source`.

Worker handoff ends with a Draft PR, all final commits and actual validation evidence. The Coordinator owns final verification and Ready. Never turn a Draft Ready as Worker, even if older packet text assigns final publication to you.

{{origin}}

## References

Read these only when you need them.

{{references}}
