export interface Rect { left: number; top: number; bottom: number; right: number }
export interface Size { width: number; height: number }

export function computePosition(
  anchor: Rect,
  popup: Size,
  viewport: Size,
  gap = 6,
): { left: number; top: number } {
  const roomBelow = viewport.height - anchor.bottom;
  let top =
    roomBelow >= popup.height + gap
      ? anchor.bottom + gap
      : Math.max(0, anchor.top - popup.height - gap);
  top = Math.min(top, Math.max(0, viewport.height - popup.height));

  let left = anchor.left;
  left = Math.min(left, viewport.width - popup.width);
  left = Math.max(0, left);

  return { left, top };
}
