# Delivery Packet

Card: {{cardId}}
Action: {{actionId}}
Context revision: {{contextRevision}}
Checklist version: {{checklistVersion}}

## Reading Order

{{readingOrder}}

Execute only this Action. Everything in this packet describes the current round; nothing here authorizes follow-on work, extra acceptance criteria, or a changed role.

## Packet Files

These files live in this packet directory and are read relative to this manifest.

{{materialized}}

## References

These are not copied into the packet. Paths are relative to the project root. A `missing` item is recorded, not silently dropped; report it instead of working around it.

{{references}}

## Agent Must Update

The Coordinator fills these sections before a Worker starts. A section still showing its placeholder has not been assigned.

{{agentSections}}
