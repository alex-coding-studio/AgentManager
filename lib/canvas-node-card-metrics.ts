export type CanvasNodeCardDensity = 'standard' | 'compact';

export const CANVAS_NODE_CARD_WIDTH = 288;

export const CANVAS_NODE_CARD_MIN_HEIGHT: Record<
  CanvasNodeCardDensity,
  number
> = {
  standard: 160,
  compact: 104,
};

export function canvasNodeCardMinHeight(density: CanvasNodeCardDensity) {
  return CANVAS_NODE_CARD_MIN_HEIGHT[density];
}
