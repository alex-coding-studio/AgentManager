import {
  WHATS_NEXT_HARNESS_OUTPUT_SCHEMA,
  WHATS_NEXT_HARNESS_PROMPT,
} from './whats-next-harness.ts';

export function buildWhatsNextPrompt(packet: unknown) {
  return `${WHATS_NEXT_HARNESS_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(WHATS_NEXT_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current bounded request packet follows. Echo its request identity exactly. Read every primary file from contextWorkspace before reasoning. Related files are available for your own read-only, on-demand inspection. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildWhatsNextContinuationPrompt(packet: unknown) {
  return `Continue the existing AgentManager What's next Session under the previously supplied Harness and output contract. The packet below contains the current operation, user input, a fresh Context Workspace, and authoritative state changes. Read every primary file in the supplied Workspace. Do not reinterpret or replace unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${JSON.stringify(packet, null, 2)}`;
}
