import { describe, it, expect } from 'vitest';
import { computePosition } from '../src/position';

const vp = { width: 1000, height: 800 };
const popup = { width: 360, height: 300 };

describe('computePosition', () => {
  it('places below the anchor when there is room', () => {
    const p = computePosition({ left: 100, top: 100, bottom: 120, right: 160 }, popup, vp);
    expect(p.top).toBeGreaterThanOrEqual(120);
    expect(p.top).toBeLessThan(800);
  });

  it('flips above when there is no room below', () => {
    const p = computePosition({ left: 100, top: 700, bottom: 760, right: 160 }, popup, vp);
    expect(p.top + popup.height).toBeLessThanOrEqual(800);
  });

  it('clamps horizontally within the viewport', () => {
    const p = computePosition({ left: 980, top: 100, bottom: 120, right: 999 }, popup, vp);
    expect(p.left).toBeGreaterThanOrEqual(0);
    expect(p.left + popup.width).toBeLessThanOrEqual(1000);
  });
});
