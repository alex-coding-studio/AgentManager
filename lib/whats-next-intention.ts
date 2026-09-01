export const whatsNextIntentions = [
  'mvp-exploration',
  'feature-synthesis',
  'product-design-completion',
] as const;
export type WhatsNextIntention = (typeof whatsNextIntentions)[number];

export const whatsNextMotions = ['unspecified', 'diverge', 'converge'] as const;
export type WhatsNextMotion = (typeof whatsNextMotions)[number];

export const whatsNextLayers = ['discovery', 'product-design'] as const;
export type WhatsNextLayer = (typeof whatsNextLayers)[number];

export function intentionDestination(intention: WhatsNextIntention): {
  layer: WhatsNextLayer;
  artifactKind: 'mvp' | 'feature';
} {
  return intention === 'feature-synthesis' ||
    intention === 'product-design-completion'
    ? { layer: 'product-design', artifactKind: 'feature' }
    : { layer: 'discovery', artifactKind: 'mvp' };
}

export function assertWhatsNextIntention(
  value: unknown,
): asserts value is WhatsNextIntention {
  if (!whatsNextIntentions.includes(value as WhatsNextIntention))
    throw new Error("The What's Next Intention is invalid.");
}

export function assertWhatsNextMotion(
  value: unknown,
): asserts value is WhatsNextMotion {
  if (!whatsNextMotions.includes(value as WhatsNextMotion))
    throw new Error("The What's Next Motion is invalid.");
}
