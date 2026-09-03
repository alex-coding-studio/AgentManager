import { GRAPH_IDENTITY_PROMPT } from '../../graph/identity.ts';
import {
  WHATS_NEXT_HARNESS_OUTPUT_SCHEMA,
  whatsNextHarnessPrompt,
} from './harness.ts';
import type { WhatsNextIntention, WhatsNextMotion } from './intention.ts';

export function buildWhatsNextPrompt(
  packet: unknown,
  intention: WhatsNextIntention = 'mvp-exploration',
  motion: WhatsNextMotion = 'unspecified',
) {
  return `${whatsNextHarnessPrompt(intention, motion)}

${GRAPH_IDENTITY_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(WHATS_NEXT_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current indexed request packet follows. Echo its request identity exactly. Read content.input first, followed by content.references and content.external from contextWorkspace. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildWhatsNextContinuationPrompt(
  packet: unknown,
  intention: WhatsNextIntention = 'mvp-exploration',
  motion: WhatsNextMotion = 'unspecified',
) {
  return `Continue the existing Praxis What's next Session under the previously supplied Harness and output contract. The packet below contains the current operation, indexed content, a fresh Context Workspace, and authoritative state changes. moduleInstructionsState is complete: present means read the module-instructions reference and replace earlier module instructions; cleared means discard earlier module instructions. Neither state removes the Harness or output contract. Read content.input first, followed by content.references and content.external. Do not reinterpret or replace other unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${GRAPH_IDENTITY_PROMPT}

${whatsNextHarnessPrompt(intention, motion)}

${JSON.stringify(packet, null, 2)}`;
}
