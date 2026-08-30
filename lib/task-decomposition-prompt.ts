import { GRAPH_IDENTITY_PROMPT } from './graph-identity.ts';
import {
  TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA,
  TASK_DECOMPOSITION_HARNESS_PROMPT,
} from './task-decomposition-harness.ts';

export function buildTaskDecompositionPrompt(packet: unknown) {
  return `${TASK_DECOMPOSITION_HARNESS_PROMPT}

${GRAPH_IDENTITY_PROMPT}

The complete output contract follows. Return one JSON object and no Markdown fence or commentary:

${JSON.stringify(TASK_DECOMPOSITION_HARNESS_OUTPUT_SCHEMA, null, 2)}

The current bounded request packet follows. Echo its request identity exactly. Read every primary file from contextWorkspace before reasoning. Related files are available for your own read-only, on-demand inspection. Only reference Nodes and Resources present in this packet:

${JSON.stringify(packet, null, 2)}`;
}

export function buildTaskDecompositionContinuationPrompt(packet: unknown) {
  return `Continue the existing AgentManager Decomposition Session under the previously supplied Harness and output contract. The packet below contains the current operation, user input, a fresh Context Workspace, and authoritative state changes. Read every primary file in the supplied Workspace. Inspect related files only when your reasoning identifies a concrete need. Do not reinterpret or replace unchanged prior Context. Return one JSON object and no Markdown fence or commentary.

${GRAPH_IDENTITY_PROMPT}

${JSON.stringify(packet, null, 2)}`;
}
