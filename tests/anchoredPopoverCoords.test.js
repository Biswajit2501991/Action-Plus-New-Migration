import { describe, expect, it } from 'vitest';
import {
  ANCHORED_POPOVER_Z_INDEX,
  measureAnchoredPopoverCoords,
} from '../src/features/overlay/anchoredPopoverCoords.js';

describe('measureAnchoredPopoverCoords', () => {
  const viewport = { width: 400, height: 800 };

  it('anchors below trigger with end alignment', () => {
    const anchor = { top: 100, bottom: 140, left: 300, right: 380, width: 80, height: 40 };
    const coords = measureAnchoredPopoverCoords(anchor, viewport, { offset: 8, width: 288 });
    expect(coords.top).toBe(148);
    expect(coords.right).toBe(20);
    expect(coords.width).toBe(288);
    expect(coords.maxHeight).toBeGreaterThan(0);
  });

  it('flips above trigger when little space below', () => {
    const anchor = { top: 720, bottom: 760, left: 300, right: 380, width: 80, height: 40 };
    const coords = measureAnchoredPopoverCoords(anchor, viewport, { maxHeight: 256, offset: 6 });
    expect(coords.top).toBeLessThan(anchor.top);
    expect(coords.maxHeight).toBeLessThanOrEqual(256);
  });

  it('clamps width to viewport padding', () => {
    const narrow = { width: 200, height: 600 };
    const anchor = { top: 10, bottom: 50, left: 10, right: 190, width: 180, height: 40 };
    const coords = measureAnchoredPopoverCoords(anchor, narrow, { width: 320 });
    expect(coords.width).toBeLessThanOrEqual(200 - 24);
  });

  it('uses start alignment with left coordinate', () => {
    const anchor = { top: 50, bottom: 90, left: 16, right: 120, width: 104, height: 40 };
    const coords = measureAnchoredPopoverCoords(anchor, viewport, { align: 'start', width: 200 });
    expect(coords.left).toBe(16);
    expect(coords.right).toBeUndefined();
  });
});

describe('ANCHORED_POPOVER_Z_INDEX', () => {
  it('sits above sticky bars but below toast layer', () => {
    expect(ANCHORED_POPOVER_Z_INDEX).toBe(9000);
    expect(ANCHORED_POPOVER_Z_INDEX).toBeLessThan(9999);
  });
});
