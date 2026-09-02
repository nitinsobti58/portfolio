import { describe, expect, it } from "vitest";

import { fitTransform, toScreen } from "../fit";
import {
  centerOn,
  MINIMAP_PADDING,
  MINIMAP_SIZE,
  minimapToWorld,
  minimapTransform,
  viewportRect,
} from "../minimap";
import type { SimNode } from "../types";

const bounds = { minX: -250, minY: -260, maxX: 250, maxY: 250 };

describe("minimapTransform", () => {
  it("fits the graph bounds inside the minimap with padding on the binding axis", () => {
    const mm = minimapTransform(bounds);
    const tl = toScreen(mm, bounds.minX, bounds.minY);
    const br = toScreen(mm, bounds.maxX, bounds.maxY);
    // The graph is taller than wide relative to 180×120, so height binds.
    expect(tl.y).toBeCloseTo(MINIMAP_PADDING);
    expect(br.y).toBeCloseTo(MINIMAP_SIZE.height - MINIMAP_PADDING);
    expect(tl.x).toBeGreaterThanOrEqual(MINIMAP_PADDING);
    expect(br.x).toBeLessThanOrEqual(MINIMAP_SIZE.width - MINIMAP_PADDING);
    // Centered horizontally.
    expect((tl.x + br.x) / 2).toBeCloseTo(MINIMAP_SIZE.width / 2);
  });

  it("round-trips minimap pixels and world coordinates", () => {
    const mm = minimapTransform(bounds);
    const w = minimapToWorld(mm, 90, 60);
    const back = toScreen(mm, w.x, w.y);
    expect(back.x).toBeCloseTo(90);
    expect(back.y).toBeCloseTo(60);
  });
});

describe("viewportRect", () => {
  const size = { width: 1000, height: 600 };
  const nodes: SimNode[] = [
    { id: "a", type: "project", label: "a", radius: 0, x: bounds.minX, y: bounds.minY },
    { id: "b", type: "project", label: "b", radius: 0, x: bounds.maxX, y: bounds.maxY },
  ];

  it("covers at least the whole graph when the view is the fit view", () => {
    const mm = minimapTransform(bounds);
    const rect = viewportRect(fitTransform(nodes, size, 0, 10), size, mm);
    const tl = toScreen(mm, bounds.minX, bounds.minY);
    const br = toScreen(mm, bounds.maxX, bounds.maxY);
    expect(rect.x).toBeLessThanOrEqual(tl.x + 1e-6);
    expect(rect.y).toBeLessThanOrEqual(tl.y + 1e-6);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(br.x - 1e-6);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(br.y - 1e-6);
  });

  it("shrinks and moves with the zoom transform", () => {
    const mm = minimapTransform(bounds);
    const wide = viewportRect({ k: 1, x: 500, y: 300 }, size, mm);
    const tight = viewportRect({ k: 4, x: 500, y: 300 }, size, mm);
    expect(tight.width).toBeCloseTo(wide.width / 4);
    expect(tight.height).toBeCloseTo(wide.height / 4);
    // Zooming about the viewport center keeps the rect centered on the same world point.
    expect(tight.x + tight.width / 2).toBeCloseTo(wide.x + wide.width / 2);
    // Panning the view right moves the rect left in world terms.
    const panned = viewportRect({ k: 1, x: 600, y: 300 }, size, mm);
    expect(panned.x).toBeLessThan(wide.x);
  });
});

describe("centerOn", () => {
  it("keeps the scale and puts the world point at the viewport center", () => {
    const size = { width: 1000, height: 600 };
    const t = centerOn({ k: 2, x: 123, y: 456 }, size, 40, -30);
    expect(t.k).toBe(2);
    const c = toScreen(t, 40, -30);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(300);
  });
});

describe("minimap click", () => {
  it("centers the viewport rectangle on the clicked minimap point, at any scale", () => {
      // A click on the minimap goes minimapToWorld → centerOn → viewportRect
      // (the same chain the component runs). Whatever the current scale or pan,
      // the rectangle drawn afterwards must be centered on the point that was
      // clicked, and its size must be the viewport in minimap pixels, so
      // minimapToWorld really is the inverse of the minimap transform.
      const size = { width: 1000, height: 600 };
      const mm = minimapTransform(bounds);
      for (const k of [0.5, 1, 2.5, 4]) {
        for (const [mx, my] of [[20, 15], [90, 60], [170, 110]]) {
          const w = minimapToWorld(mm, mx, my);
          const view = centerOn({ k, x: -123, y: 456 }, size, w.x, w.y);
          const rect = viewportRect(view, size, mm);
          expect(rect.x + rect.width / 2).toBeCloseTo(mx);
          expect(rect.y + rect.height / 2).toBeCloseTo(my);
          expect(rect.width).toBeCloseTo((size.width / k) * mm.k);
          expect(rect.height).toBeCloseTo((size.height / k) * mm.k);
        }
      }
    });
});
