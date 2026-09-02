import { describe, expect, it } from "vitest";

import { hitRadius, hitTest } from "../hit";
import { HALO_FACTOR } from "../render";
import type { SimNode } from "../types";

const node = (
  id: string,
  type: SimNode["type"],
  x: number,
  y: number,
  radius: number,
): SimNode => ({ id, type, label: id, radius, x, y });

const IDENTITY = { k: 1, x: 0, y: 0 };

describe("hitTest", () => {
  const area = node("area:a", "area", 100, 100, 26);
  const project = node("project:p", "project", 200, 50, 12);
  const self = node("self", "self", 0, 0, 34);
  const nodes = [self, area, project];

  it("returns the node under the point", () => {
    expect(hitTest(nodes, IDENTITY, 100, 100)).toBe(area);
    expect(hitTest(nodes, IDENTITY, 203, 52)).toBe(project);
    expect(hitTest(nodes, IDENTITY, 2, -3)).toBe(self);
  });

  it("returns null for empty space", () => {
    expect(hitTest(nodes, IDENTITY, 400, 400)).toBeNull();
    // 70 px from the area center, beyond its 49 px halo plus slop.
    expect(hitTest(nodes, IDENTITY, 170, 100)).toBeNull();
  });

  it("inverts the zoom transform before testing", () => {
    const t = { k: 2, x: 50, y: -20 };
    // Area at world (100, 100) → screen (250, 180).
    expect(hitTest(nodes, t, 250, 180)).toBe(area);
    // Screen (400, 400) is world (175, 210): between the nodes, inside none.
    expect(hitTest(nodes, t, 400, 400)).toBeNull();
  });

  it("counts an area's halo as part of the node", () => {
    const edge = 26 * HALO_FACTOR;
    expect(hitTest(nodes, IDENTITY, 100 + edge - 1, 100)).toBe(area);
    expect(hitTest(nodes, IDENTITY, 100 + edge + 6, 100)).toBeNull();
  });

  it("applies slop in screen pixels regardless of scale", () => {
    // At k = 0.5 the 12-unit project disc is 6 px on screen; 4 px of slop applies on top.
    const t = { k: 0.5, x: 0, y: 0 };
    const cx = 200 * 0.5;
    const cy = 50 * 0.5;
    expect(hitTest(nodes, t, cx + 9.5, cy)).toBe(project);
    expect(hitTest(nodes, t, cx + 10.5, cy)).toBeNull();
    expect(hitTest(nodes, t, cx + 9.5, cy, 0)).toBeNull();
  });

  it("prefers the nearest center when hit regions overlap", () => {
    const big = node("big", "area", 0, 0, 40);
    const small = node("small", "project", 30, 0, 12);
    // Both regions contain each point; neither array order nor node size decides.
    expect(hitTest([big, small], IDENTITY, 28, 0)).toBe(small);
    expect(hitTest([small, big], IDENTITY, 14, 0)).toBe(big);
  });

  it("ignores nodes that have no position yet", () => {
    const unplaced: SimNode = { id: "u", type: "area", label: "u", radius: 26 };
    expect(hitTest([unplaced], IDENTITY, 0, 0)).toBeNull();
  });

  it("scales the hit radius with the slop and node type", () => {
    expect(hitRadius(project, 1)).toBe(16);
    expect(hitRadius(project, 2)).toBe(14);
    expect(hitRadius(area, 1)).toBeCloseTo(26 * HALO_FACTOR + 4);
  });
});

describe("hitTest boundaries", () => {
  const project = node("project:p", "project", 200, 50, 12);

  it("counts a point exactly on the hit radius as a hit", () => {
    // Radius 12 plus the default 4 px slop at k = 1: the boundary is 16 px out.
    expect(hitTest([project], IDENTITY, 216, 50)).toBe(project);
    expect(hitTest([project], IDENTITY, 216.01, 50)).toBeNull();
  });

  it("shrinks the slop in world units as the map zooms in", () => {
    // At k = 4 the 4 px slop is 1 world unit; 12 + 1 = 13 units → 52 px on screen from the center.
    const t = { k: 4, x: 0, y: 0 };
    expect(hitTest([project], t, 800 + 52, 200)).toBe(project);
    expect(hitTest([project], t, 800 + 52.5, 200)).toBeNull();
  });
});
