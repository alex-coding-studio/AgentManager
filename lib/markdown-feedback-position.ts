type Rect = { left: number; top: number; right: number; bottom: number };

export function feedbackPopoverPosition(
  selection: Rect,
  reader: Rect,
  visible: Rect,
  width = 190,
  height = 36,
) {
  const margin = 8;
  const left = Math.max(reader.left, visible.left) + margin;
  const right = Math.min(reader.right, visible.right) - margin;
  const top = Math.max(reader.top, visible.top) + margin;
  const bottom = Math.min(reader.bottom, visible.bottom) - margin;
  if (
    selection.bottom <= top ||
    selection.top >= bottom ||
    selection.right <= left ||
    selection.left >= right ||
    right - left < width ||
    bottom - top < height
  )
    return null;
  const x = Math.max(left, Math.min(selection.left, right - width));
  const below = selection.bottom + margin;
  const y =
    below + height <= bottom
      ? below
      : Math.max(
          top,
          Math.min(selection.top - height - margin, bottom - height),
        );
  return { left: x - reader.left, top: y - reader.top };
}
