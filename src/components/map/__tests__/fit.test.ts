import { describe, expect, it } from "vitest";

import { buildMapGraph } from "@/data/map";
import { areas } from "@/data/projects";

import {
  boundsOf,
  clusterOf,
  constrainTransform,
  drawnRadius,
  fitTransform,
  FOCUS_MAX_SCALE,
  FOCUS_PADDING,
  focusTransform,
  panToReveal,
  sameTransform,
  toScreen,
  toWorld,
} from "../fit";
import { HALO_FACTOR } from "../render";
import { createSimulation, settle } from "../simulation";
import type { SimNode } from "../types";
import { PAN_MARGIN } from "../zoom";

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

  it("includes the halo of self and area nodes in the bounds", () => {
    const area: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 26, x: 0, y: 0 };
    const b = boundsOf([area]);
    expect(b.maxY).toBeCloseTo(26 * HALO_FACTOR);
    expect(drawnRadius(area)).toBeCloseTo(26 * HALO_FACTOR);
    expect(drawnRadius(node("p", 0, 0, 12))).toBe(12);
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

describe("focusTransform", () => {
  const self: SimNode = { id: "self", type: "self", label: "me", radius: 34, x: 0, y: 0 };
  const area: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 26, x: 200, y: 0 };
  const p1: SimNode = { ...node("project:a", 260, -40, 12), area: "web" };
  const p2: SimNode = { ...node("project:b", 270, 50, 12), area: "web" };
  const other: SimNode = { id: "area:data", type: "area", area: "data", label: "Data", radius: 26, x: -200, y: 0 };
  const nodes = [self, area, p1, p2, other];
  const size = { width: 1000, height: 600 };

  it("selects the area node and its projects, never the center", () => {
    expect(clusterOf(nodes, "web").map((n) => n.id)).toEqual(["area:web", "project:a", "project:b"]);
    expect(clusterOf(nodes, "trading")).toEqual([]);
  });

  it("centers the cluster in the viewport", () => {
    const t = focusTransform(nodes, "web", size, 96);
    const b = boundsOf(clusterOf(nodes, "web"));
    const center = toScreen(t, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(300);
  });

  it("keeps every cluster node inside the padding when the viewport is the limit", () => {
    // Small enough that the padding, not the scale cap, decides k.
    const small = { width: 400, height: 300 };
    const t = focusTransform(nodes, "web", small, 96);
    expect(t.k).toBeLessThan(FOCUS_MAX_SCALE);
    const b = boundsOf(clusterOf(nodes, "web"));
    const top = toScreen(t, b.minX, b.minY);
    const bottom = toScreen(t, b.maxX, b.maxY);
    expect(top.x).toBeGreaterThanOrEqual(96 - 1e-6);
    expect(top.y).toBeGreaterThanOrEqual(96 - 1e-6);
    expect(bottom.x).toBeLessThanOrEqual(small.width - 96 + 1e-6);
    expect(bottom.y).toBeLessThanOrEqual(small.height - 96 + 1e-6);
    // The binding axis touches the padding exactly.
    expect(Math.min(top.y - 96, small.height - 96 - bottom.y)).toBeCloseTo(0);
  });

  it("never zooms past the focus cap", () => {
    const t = focusTransform(nodes, "web", { width: 4000, height: 4000 });
    expect(t.k).toBe(FOCUS_MAX_SCALE);
  });

  it("falls back to the whole graph for an area without nodes", () => {
    expect(focusTransform(nodes, "trading", size)).toEqual(fitTransform(nodes, size, 96, FOCUS_MAX_SCALE));
  });
});

describe("constrainTransform", () => {
  const bounds = { minX: -300, minY: -200, maxX: 300, maxY: 200 };
  const size = { width: 1000, height: 600 };
  const margin = 80;

  it("returns the same object when the graph is comfortably in view", () => {
    const t = { k: 1, x: 500, y: 300 };
    expect(constrainTransform(t, bounds, size, margin)).toBe(t);
  });

  it("stops the graph from leaving the viewport on every side", () => {
    // Pushed far right: the graph's left edge must stay ≤ width - margin.
    const right = constrainTransform({ k: 1, x: 5000, y: 300 }, bounds, size, margin);
    expect(toScreen(right, bounds.minX, 0).x).toBeCloseTo(size.width - margin);
    // Pushed far left: the graph's right edge must stay ≥ margin.
    const left = constrainTransform({ k: 1, x: -5000, y: 300 }, bounds, size, margin);
    expect(toScreen(left, bounds.maxX, 0).x).toBeCloseTo(margin);
    const down = constrainTransform({ k: 1, x: 500, y: 5000 }, bounds, size, margin);
    expect(toScreen(down, 0, bounds.minY).y).toBeCloseTo(size.height - margin);
    const up = constrainTransform({ k: 1, x: 500, y: -5000 }, bounds, size, margin);
    expect(toScreen(up, 0, bounds.maxY).y).toBeCloseTo(margin);
  });

  it("is scale-aware: a zoomed-in graph can still be panned across its full extent", () => {
    const k = 4;
    // Graph is 2400 px wide at k = 4; both ends must be reachable.
    const showLeft = constrainTransform({ k, x: margin - bounds.minX * k, y: 300 }, bounds, size, margin);
    expect(toScreen(showLeft, bounds.minX, 0).x).toBeCloseTo(margin);
    const showRight = constrainTransform({ k, x: size.width - margin - bounds.maxX * k, y: 300 }, bounds, size, margin);
    expect(toScreen(showRight, bounds.maxX, 0).x).toBeCloseTo(size.width - margin);
  });

  it("settles in the middle when the range inverts (tiny viewport, tiny graph)", () => {
    // width 50 with 80 px margins and a 6 px wide graph: lo = 77, hi = -27.
    const t = constrainTransform({ k: 0.01, x: 0, y: 0 }, bounds, { width: 50, height: 50 }, margin);
    expect(t.x).toBeCloseTo((77 + -27) / 2);
    expect(Number.isFinite(t.y)).toBe(true);
  });
});

describe("sameTransform", () => {
  it("tolerates sub-pixel differences only", () => {
    expect(sameTransform({ k: 1, x: 10, y: 10 }, { k: 1, x: 10.4, y: 9.7 })).toBe(true);
    expect(sameTransform({ k: 1, x: 10, y: 10 }, { k: 1, x: 11, y: 10 })).toBe(false);
    expect(sameTransform({ k: 1, x: 10, y: 10 }, { k: 1.01, x: 10, y: 10 })).toBe(false);
  });
});

describe("panToReveal", () => {
  const size = { width: 1000, height: 600 };
  const t = { k: 2, x: 100, y: 50 };

  it("returns the same object when the rect is already inside the margin", () => {
    expect(panToReveal(t, { x: 100, y: 100, width: 80, height: 28 }, size, 24)).toBe(t);
  });

  it("pans by the smallest amount that brings the rect inside on each axis", () => {
    const right = panToReveal(t, { x: 990, y: 100, width: 80, height: 28 }, size, 24);
    expect(right.k).toBe(2);
    expect(right.x).toBeCloseTo(100 + (1000 - 24 - 1070));
    expect(right.y).toBe(50);
    const upLeft = panToReveal(t, { x: -60, y: -40, width: 80, height: 28 }, size, 24);
    expect(upLeft.x).toBeCloseTo(100 + 84);
    expect(upLeft.y).toBeCloseTo(50 + 64);
    const below = panToReveal(t, { x: 100, y: 700, width: 80, height: 28 }, size, 24);
    expect(below.y).toBeCloseTo(50 + (600 - 24 - 728));
  });

  it("aligns an oversized rect by its top-left edge", () => {
    const huge = panToReveal(t, { x: 300, y: 300, width: 5000, height: 5000 }, size, 24);
    expect(huge.x).toBeCloseTo(100 + (24 - 300));
    expect(huge.y).toBeCloseTo(50 + (24 - 300));
  });
});

describe("fit edge cases", () => {
  it("treats a node without a position as sitting at the origin", () => {
    const unplaced: SimNode = { id: "u", type: "project", label: "u", radius: 5 };
    expect(boundsOf([unplaced])).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
  });

  it("fits a single node at the scale cap, centered", () => {
    const only = node("a", 30, -20, 0);
    const t = fitTransform([only], { width: 400, height: 300 }, 48, 1.25);
    expect(t.k).toBe(1.25);
    expect(toScreen(t, 30, -20)).toEqual({ x: 200, y: 150 });
  });

  it("is a true inverse: screen → world → screen returns the point at any scale", () => {
    for (const t of [{ k: 0.5, x: -40, y: 12 }, { k: 4, x: 900, y: -300 }]) {
      const w = toWorld(t, 123.4, 56.7);
      const s = toScreen(t, w.x, w.y);
      expect(s.x).toBeCloseTo(123.4, 9);
      expect(s.y).toBeCloseTo(56.7, 9);
    }
  });
});

describe("focusTransform on the real graph", () => {
  it("frames every area's cluster inside the padding, centered, without tripping the pan constraint", () => {
      // The fly-to target behind each area pill, on the real settled graph, at a
      // laptop viewport and at the narrowest viewport the canvas still mounts at.
      // For every area the cluster must exist (so focus never silently falls back
      // to the whole graph), sit fully inside FOCUS_PADDING, be centered, and
      // already satisfy the pan constraint d3 applies on arrival — otherwise the
      // fly-to would land somewhere other than where it aimed.
      const { nodes } = settle(createSimulation(buildMapGraph()));
      const graphBounds = boundsOf(nodes);
      for (const size of [{ width: 1280, height: 720 }, { width: 768, height: 480 }]) {
        for (const area of Object.values(areas)) {
          const cluster = clusterOf(nodes, area.id);
          expect(cluster.length).toBeGreaterThan(1);
          const t = focusTransform(nodes, area.id, size);
          const b = boundsOf(cluster);
          const tl = toScreen(t, b.minX, b.minY);
          const br = toScreen(t, b.maxX, b.maxY);
          expect(t.k).toBeGreaterThan(0);
          expect(t.k).toBeLessThanOrEqual(FOCUS_MAX_SCALE);
          expect(tl.x).toBeGreaterThanOrEqual(FOCUS_PADDING - 1e-6);
          expect(tl.y).toBeGreaterThanOrEqual(FOCUS_PADDING - 1e-6);
          expect(br.x).toBeLessThanOrEqual(size.width - FOCUS_PADDING + 1e-6);
          expect(br.y).toBeLessThanOrEqual(size.height - FOCUS_PADDING + 1e-6);
          expect((tl.x + br.x) / 2).toBeCloseTo(size.width / 2);
          expect((tl.y + br.y) / 2).toBeCloseTo(size.height / 2);
          expect(constrainTransform(t, graphBounds, size, PAN_MARGIN)).toBe(t);
        }
      }
    });
});

describe("constrainTransform idempotence", () => {
  it("is idempotent: a constrained transform passes a second pass untouched, at any scale", () => {
      // d3 runs the constraint on every gesture frame, and createMapZoom relies on
      // the identity fast path (`c === transform`) to avoid allocating. So once a
      // transform has been clamped, clamping it again must return the very same
      // object with the same k — no drift, no fresh allocation.
      const bounds = { minX: -300, minY: -200, maxX: 300, maxY: 200 };
      const size = { width: 1000, height: 600 };
      const margin = 80;
      const pushed = [
        { k: 0.5, x: 5000, y: -5000 },
        { k: 1, x: -5000, y: 5000 },
        { k: 4, x: 5000, y: 5000 },
        { k: 2, x: 500, y: 300 },
      ];
      for (const t of pushed) {
        const once = constrainTransform(t, bounds, size, margin);
        expect(once.k).toBe(t.k);
        expect(constrainTransform(once, bounds, size, margin)).toBe(once);
      }
      // The inverted-range branch settles in the middle and must stay there too.
      const tiny = { width: 50, height: 50 };
      const mid = constrainTransform({ k: 0.01, x: 0, y: 0 }, bounds, tiny, margin);
      expect(constrainTransform(mid, bounds, tiny, margin)).toBe(mid);
    });
});
