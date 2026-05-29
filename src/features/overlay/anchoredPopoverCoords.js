/** CSS class for portaled dropdowns (bell, branch switcher, future menus). */
export const ANCHORED_POPOVER_LAYER_CLASS = 'apg-anchored-popover';

/** Paint order: above sticky sub-nav (z-10..30), below toasts (9999) and modals (9500+). */
export const ANCHORED_POPOVER_Z_INDEX = 9000;

const DEFAULT_PADDING = 12;

/**
 * Compute fixed viewport coordinates for a popover anchored to a trigger rect.
 * Used by React portals so `backdrop-filter` / `overflow` ancestors cannot trap the panel.
 *
 * @param {DOMRect} anchorRect
 * @param {{ width: number, height: number }} viewport
 * @param {{
 *   offset?: number,
 *   align?: 'end' | 'start',
 *   padding?: number,
 *   width?: number,
 *   maxHeight?: number,
 * }} [options]
 * @returns {{ top: number, right?: number, left?: number, width: number, maxHeight: number }}
 */
export function measureAnchoredPopoverCoords(anchorRect, viewport, options = {}) {
  const offset = options.offset ?? 8;
  const align = options.align === 'start' ? 'start' : 'end';
  const padding = options.padding ?? DEFAULT_PADDING;
  const requestedWidth = options.width ?? 320;
  const panelMaxHeight = options.maxHeight ?? 320;

  const panelWidth = Math.min(
    requestedWidth,
    Math.max(160, viewport.width - padding * 2),
  );

  const spaceBelow = viewport.height - anchorRect.bottom - offset;
  const spaceAbove = anchorRect.top - offset;
  const preferBelow = spaceBelow >= Math.min(panelMaxHeight, 120) || spaceBelow >= spaceAbove;

  let top;
  let maxHeight;
  if (preferBelow) {
    top = anchorRect.bottom + offset;
    maxHeight = Math.min(panelMaxHeight, Math.max(96, spaceBelow - padding));
  } else {
    maxHeight = Math.min(panelMaxHeight, Math.max(96, spaceAbove - padding));
    top = Math.max(padding, anchorRect.top - offset - maxHeight);
  }

  if (align === 'end') {
    const right = Math.max(padding, viewport.width - anchorRect.right);
    return { top, right, width: panelWidth, maxHeight };
  }

  let left = anchorRect.left;
  left = Math.max(padding, Math.min(left, viewport.width - panelWidth - padding));
  return { top, left, width: panelWidth, maxHeight };
}
