import { GRAPH_IDENTITY_PROMPT } from './graph-identity.ts';
import {
  WHATS_NEXT_HARNESS_OUTPUT_SCHEMA,
  whatsNextHarnessPrompt,
} from './whats-next-harness.ts';
import type {
  WhatsNextIntention,
  WhatsNextMotion,
} from './whats-next-intention.ts';

export function buildWhatsNextPrompt(
  packet: unknown,
  intention: WhatsNextIntention = 'mvp-exploration',
  motion: WhatsNextMotion = 'diverge',
) {
  return `${whatsNextHarnessPrompt(intention, motion)}

${GRAPH_IDENTITY_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(WHATS_NEXT_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current bounded request packet follows. Echo its request identity exactly. Read every primary file from contextWorkspace before reasoning. Related files are available for your own read-only, on-demand inspection. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildWhatsNextContinuationPrompt(
  packet: unknown,
  intention: WhatsNextIntention = 'mvp-exploration',
  motion: WhatsNextMotion = 'diverge',
) {
  return `Continue the existing AgentManager What's next Session under the previously supplied Harness and output contract. The packet below contains the current operation, user input, a fresh Context Workspace, and authoritative state changes. projectInstructions is the complete current user-managed module Instructions snapshot: replace earlier module instructions with this value rather than accumulating them. An empty string clears earlier module instructions; it does not remove the Harness or output contract. Read every primary file in the supplied Workspace. Do not reinterpret or replace other unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${GRAPH_IDENTITY_PROMPT}

${whatsNextHarnessPrompt(intention, motion)}

${JSON.stringify(packet, null, 2)}`;
}
