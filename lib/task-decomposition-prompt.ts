import {
  TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA,
  TASK_DECOMPOSITION_HARNESS_PROMPT,
} from './task-decomposition-harness.ts';

export function buildTaskDecompositionPrompt(packet: unknown) {
  return `${TASK_DECOMPOSITION_HARNESS_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current bounded request packet follows. Echo its request identity exactly. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildTaskDecompositionContinuationPrompt(packet: unknown) {
  return `Continue the existing AgentManager Task Decomposition Session under the previously supplied Harness and output contract. The packet below contains only the current operation, new user input, new Resources, and authoritative state changes. Do not reinterpret or replace unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${JSON.stringify(packet, null, 2)}`;
}
