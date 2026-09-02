import path from 'node:path';
import { readAgentProfile, type AgentProfile } from './agent-profile.ts';
import { PublicApiError } from './api-errors.ts';

export type AgentGraphInputPacket = {
  instruction: string;
  contextRefs: string[];
  files: File[];
  profile: AgentProfile;
};

export type AgentGraphInputSnapshot = Omit<AgentGraphInputPacket, 'files'> & {
  attachments: Array<{
    name: string;
    type: string;
    size: number;
  }>;
};

export function readAgentGraphInputPacket(
  formData: FormData,
  options: {
    instructionRequired?: boolean;
    maxInstructionBytes?: number;
    allowedExtensions?: string[];
    maxContextRefs?: number;
    maxFiles?: number;
    maxFileBytes?: number;
  } = {},
): AgentGraphInputPacket {
  const value = formData.get('instruction');
  if (typeof value !== 'string')
    throw new PublicApiError('An Instruction is required.', 400);
  const instruction = value.trim();
  if (options.instructionRequired !== false && !instruction)
    throw new PublicApiError('An Instruction is required.', 400);
  if (Buffer.byteLength(instruction) > (options.maxInstructionBytes ?? 20_000))
    throw new PublicApiError('The Agent instruction is too large.', 400);

  const contextRefs = [
    ...new Set(
      formData
        .getAll('contextRefs')
        .filter((entry): entry is string => typeof entry === 'string'),
    ),
  ];
  if (contextRefs.length > (options.maxContextRefs ?? 50))
    throw new PublicApiError('Too many Context documents were selected.', 400);

  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File);
  if (files.length > (options.maxFiles ?? 20))
    throw new PublicApiError('Too many files were attached.', 400);
  const allowed = (options.allowedExtensions ?? ['.md', '.markdown']).map(
    (extension) => extension.toLowerCase(),
  );
  for (const file of files) {
    if (!allowed.includes(path.extname(file.name).toLowerCase()))
      throw new PublicApiError('An attached file type is not supported.', 400);
    if (file.size > (options.maxFileBytes ?? 2 * 1024 * 1024))
      throw new PublicApiError('An attached file is too large.', 400);
  }
  return {
    instruction,
    contextRefs,
    files,
    profile: readAgentProfile(formData),
  };
}

export function snapshotAgentGraphInput(
  input: AgentGraphInputPacket,
): AgentGraphInputSnapshot {
  return {
    instruction: input.instruction,
    contextRefs: [...input.contextRefs],
    profile: structuredClone(input.profile),
    attachments: input.files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
  };
}
