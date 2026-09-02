import {
  defineAgentGraphIntentionRegistry,
  intentionProfile,
} from './agent-graph-intention.ts';
import {
  defineAgentGraphMotionRegistry,
  motionProfile,
} from './agent-graph-motion.ts';

export const whatsNextIntentionRegistry = defineAgentGraphIntentionRegistry({
  module: 'whats-next',
  defaultId: 'mvp-exploration',
  profiles: [
    {
      id: 'mvp-exploration',
      label: 'MVP Exploration',
      description:
        'Explore concrete product value and testable user experiences.',
      prompt: `INTENTION PROFILE — MVP Exploration
Create Discovery-layer MVPs that help the user discuss or validate product value. Focus on a concrete user problem, action, observable response, recognizable value and material assumptions. Do not produce implementation tasks, a formal Feature document or technical architecture. Every Candidate must use layer discovery and artifactKind mvp.`,
    },
    {
      id: 'feature-synthesis',
      label: 'Feature Synthesis',
      description:
        'Synthesize selected Discovery evidence into Product Design Features.',
      prompt: `INTENTION PROFILE — Feature Synthesis
Turn the selected Discovery evidence into Product Design Feature candidates. A Feature is a rich but lightweight functional module: explain the user problem, included validated capabilities, how they combine, interactions with existing product behavior, boundaries, excluded experiments, evidence and unresolved questions. Do not create an intermediate Discovery Feature, implementation task list, corporate design process or technical architecture. Every Candidate must use layer product-design and artifactKind feature.`,
    },
    {
      id: 'product-design-completion',
      label: 'Product Design Completion',
      description:
        'Complete a known product with justified missing Feature boundaries.',
      prompt: `INTENTION PROFILE — Product Design Completion
The selected Product Source is the trigger for this product-wide completion pass, not the complete user-selected Context. Treat the User Input as a concrete missing product concern in an already coherent product. Read the Product Source, every current Product Design Feature and every user-supplied primary Product Design document before proposing anything. When the packet contains zero current Product Design Features, treat this as the first Product Design pass. Generate one or more Features only when the available input establishes a coherent product goal and identifies clear, independently useful user problems, lifecycles or product capabilities. A complete Product Design document may justify many Feature Candidates. Otherwise return one bounded clarification. Never turn a broad request such as "complete this product" into invented Features without evidence of their boundaries, and never require an MVP merely because no Product Design Feature exists yet.

First judge whether the concern deserves an independent Feature. Create one only when it owns a distinct user problem, lifecycle, or cross-Feature product rule. If the concern is already covered, return no-change. If it is only a missing rule or edge case inside an existing Feature, return no-change and identify that Feature and the refinement needed in the Reflection. Ask one bounded clarification when a material product ruling prevents an honest design. Never manufacture a duplicate or nominal Feature merely to answer the request.

When an independent Feature is justified, derive a Product Design Feature that completes the known product: explain the user problem, product rules and state changes, interactions with every affected existing Feature, lifecycle and failure boundaries, exclusions, dependencies, and only the unresolved questions that materially need user judgment. Preserve settled product decisions, do not rewrite existing Features, and do not require an MVP or prototype detour when the product goal is already clear. Product Design has one primary lineage level: Candidate derivedFrom must contain only the selected Product Source. Explain affected sibling Features in Markdown, and use dependsOn only for a true prerequisite rather than conceptual interaction. Do not produce implementation tasks or technical architecture. Every Candidate must use layer product-design and artifactKind feature.`,
    },
  ] as const,
});

export type WhatsNextIntention =
  (typeof whatsNextIntentionRegistry.profiles)[number]['id'];
export const whatsNextIntentions = whatsNextIntentionRegistry.profiles.map(
  (profile) => profile.id,
);

export const whatsNextMotionRegistry = defineAgentGraphMotionRegistry({
  module: 'whats-next',
  defaultId: 'unspecified',
  profiles: [
    {
      id: 'unspecified',
      label: 'Unspecified',
      description:
        'Follow every clear semantic boundary without forcing a count.',
      prompt: `MOTION PROFILE — Unspecified
Return exactly as many Candidates as the user's actual semantic boundaries require. Use one Candidate for one independent concern. When the User Input or a supplied Product Design document contains several independently useful problems, lifecycles or capabilities, return one Candidate per boundary. Do not split one module to increase count, collapse distinct modules, or truncate a clear design to an arbitrary limit.`,
    },
    {
      id: 'diverge',
      label: 'Diverge',
      description: 'Expand materially different product directions.',
      prompt: `MOTION PROFILE — Diverge
Return two to five materially distinct Candidates. Expand useful alternatives under the selected Intention without manufacturing near-duplicates.`,
    },
    {
      id: 'converge',
      label: 'Converge',
      description: 'Aggregate selected meaning into one product direction.',
      prompt: `MOTION PROFILE — Converge
Return exactly one aggregate Candidate. Preserve the important contribution of every selected source, identify exclusions and unresolved conflicts, and ask one bounded clarification instead when honest synthesis is impossible.`,
    },
  ] as const,
});

export type WhatsNextMotion =
  (typeof whatsNextMotionRegistry.profiles)[number]['id'];
export const whatsNextMotions = whatsNextMotionRegistry.profiles.map(
  (profile) => profile.id,
);

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

export function whatsNextIntentionProfile(value: unknown) {
  return intentionProfile(whatsNextIntentionRegistry, value);
}

export function assertWhatsNextMotion(
  value: unknown,
): asserts value is WhatsNextMotion {
  if (!whatsNextMotions.includes(value as WhatsNextMotion))
    throw new Error("The What's Next Motion is invalid.");
}

export function whatsNextMotionProfile(value: unknown) {
  return motionProfile(whatsNextMotionRegistry, value);
}
