import { GRAPH_IDENTITY_PROMPT } from './graph-identity.ts';
import {
  TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA,
  TASK_DECOMPOSITION_HARNESS_PROMPT,
} from './task-decomposition-harness.ts';
import {
  taskDecompositionIntentionRegistry,
  taskDecompositionIntentionProfile,
  type TaskDecompositionIntention,
} from './task-decomposition-intention.ts';

export function buildTaskDecompositionPrompt(
  packet: unknown,
  intention: TaskDecompositionIntention = taskDecompositionIntentionRegistry.defaultId,
) {
  return `${TASK_DECOMPOSITION_HARNESS_PROMPT}

${taskDecompositionIntentionProfile(intention).prompt}

${GRAPH_IDENTITY_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current indexed request packet follows. Echo its request identity exactly. Read content.input first, followed by content.references and content.external from contextWorkspace. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildTaskDecompositionContinuationPrompt(packet: unknown) {
  return `Continue the existing AgentManager Decomposition Session under the previously supplied Harness and output contract. The packet below contains the current operation, indexed content, a fresh Context Workspace, and authoritative state changes. moduleInstructionsState is complete: present means read the module-instructions reference and replace earlier module instructions; cleared means discard earlier module instructions. Read content.input first, followed by content.references and content.external. Do not reinterpret or replace unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${GRAPH_IDENTITY_PROMPT}

${JSON.stringify(packet, null, 2)}`;
}
