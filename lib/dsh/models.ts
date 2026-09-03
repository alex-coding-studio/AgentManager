import type {
  LocalModel,
  ReasoningEffort,
} from '../local-agent-model-types.ts';

export const deepseekModels: LocalModel[] = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek-V4-Flash',
    description: 'Fast general-purpose DeepSeek model.',
    efforts: ['none', 'low', 'high', 'max'],
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek-V4-Pro',
    description: 'Reasoning-heavy DeepSeek model.',
    efforts: ['none', 'low', 'high', 'max'],
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek-V4-Flash-Vision-Exp',
    description: 'Multimodal (text and image) DeepSeek model.',
    efforts: ['none', 'low', 'high', 'max'],
  },
];

export function deepseekEffort(
  effort: '' | ReasoningEffort,
): 'off' | 'low' | 'high' | 'max' | undefined {
  if (effort === 'none') return 'off';
  if (effort === 'low' || effort === 'high' || effort === 'max') return effort;
  return undefined;
}
