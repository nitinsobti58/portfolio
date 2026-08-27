import { describe, expect, it } from "vitest";

import { boundsOf, fitTransform, toScreen, toWorld } from "../fit";
import type { SimNode } from "../types";

const node = (id: string, x: number, y: number, radius = 10): SimNode => ({
  id,
  type: "project",
  label: id,
  radius,
  x,
  y,
});

describe("fit", () => {
  it("computes bounds including node radii", () => {
    const b = boundsOf([node("a", 0, 0, 10), node("b", 100, 50, 20)]);
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 120, maxY: 70 });
  });

  it("centers the bounds in the viewport", () => {
    const nodes = [node("a", -50, -50, 0), node("b", 50, 50, 0)];
    const t = fitTransform(nodes, { width: 400, height: 300 }, 0, 10);
    const c = toScreen(t, 0, 0);
    expect(c.x).toBeCloseTo(200);
    expect(c.y).toBeCloseTo(150);
  });

  it("respects padding and maxScale", () => {
    const nodes = [node("a", -50, -50, 0), node("b", 50, 50, 0)];
    const padded = fitTransform(nodes, { width: 400, height: 300 }, 100, 10);
    // Available height is 100 for a 100-tall graph → k = 1.
    expect(padded.k).toBeCloseTo(1);
    const capped = fitTransform(nodes, { width: 4000, height: 3000 }, 0, 1.25);
    expect(capped.k).toBe(1.25);
  });

  it("round-trips world and screen coordinates", () => {
    const t = { k: 1.5, x: 120, y: -30 };
    const s = toScreen(t, 40, 80);
    const w = toWorld(t, s.x, s.y);
    expect(w.x).toBeCloseTo(40);
    expect(w.y).toBeCloseTo(80);
  });

  it("handles an empty node list without NaN", () => {
    const t = fitTransform([], { width: 400, height: 300 });
    expect(Number.isFinite(t.k)).toBe(true);
    expect(Number.isFinite(t.x)).toBe(true);
  });
});
