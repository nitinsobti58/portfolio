import { describe, expect, it } from "vitest";

import type { Palette } from "../palette";
import type { ParticleField } from "../particles";
import { drawMinimap, MINIMAP_MIN_DOT, MINIMAP_SIZE } from "../minimap";
import {
  CENTER_LABEL_PAD,
  CENTER_LABEL_SIZE,
  drawMap,
  drawParticles,
  HALO_FACTOR,
  LABEL_GAP,
  type ParticleLayer,
} from "../render";
import { SPRITE_LEVELS, spriteLevel } from "../sprites";
import type { SimLink, SimNode } from "../types";

type Call = { name: string; args: unknown[] };

/**
 * A recording stand-in for CanvasRenderingContext2D: every method call is
 * logged in order and every property assignment is logged as `set:<name>`.
 */
function recordingContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_, name: string) {
      if (name === "measureText") return () => ({ width: 40 });
      if (name in props) return props[name];
      return (...args: unknown[]) => {
        calls.push({ name, args });
      };
    },
    set(_, name: string, value) {
      props[name] = value;
      calls.push({ name: `set:${name}`, args: [value] });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

type Sprite = { anchor: number; tint: number; level: number };

/** Sprites tagged with their indices so a test can see which one was drawn. */
function taggedSprites(anchors: number, tints: number) {
  return Array.from({ length: anchors }, (_, anchor) =>
    Array.from({ length: tints }, (_, tint) =>
      SPRITE_LEVELS.map((_, level) => ({ anchor, tint, level }) as unknown as CanvasImageSource),
    ),
  );
}

type Spec = { x: number; y: number; size: number; opacity?: number; anchor?: number; tint?: number };

function fieldOf(specs: Spec[]): ParticleField {
  const count = specs.length;
  const field: ParticleField = {
    count,
    anchor: new Uint16Array(count),
    homeX: new Float32Array(count),
    homeY: new Float32Array(count),
    phase: new Float32Array(count),
    phase2: new Float32Array(count),
    speed: new Float32Array(count),
    amplitude: new Float32Array(count),
    size: new Float32Array(count),
    opacity: new Float32Array(count),
    tint: new Uint8Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
  };
  specs.forEach((s, i) => {
    field.x[i] = s.x;
    field.y[i] = s.y;
    field.homeX[i] = s.x;
    field.homeY[i] = s.y;
    field.size[i] = s.size;
    field.opacity[i] = s.opacity ?? 0.5;
    field.anchor[i] = s.anchor ?? 0;
    field.tint[i] = s.tint ?? 0;
  });
  return field;
}

function layerOf(specs: Spec[], dpr = 1): ParticleLayer {
  return { field: fieldOf(specs), sprites: taggedSprites(2, 3), dpr };
}

const drawn = (calls: Call[]) => calls.filter((c) => c.name === "drawImage");
const spriteOf = (call: Call) => call.args[0] as Sprite;

const palette: Palette = {
  link: "#888",
  self: "#333",
  label: "#111",
  labelMuted: "#666",
  fontFamily: "sans-serif",
  area: { trading: "#a52", data: "#258", web: "#638", realestate: "#472" },
};

describe("drawParticles", () => {
  const view = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it("draws each particle once, as its sprite at its opacity, in a box of twice its size", () => {
    const { ctx, calls } = recordingContext();
    drawParticles(ctx, layerOf([{ x: 10, y: 20, size: 3, opacity: 0.3, anchor: 1, tint: 2 }]), view, 1);

    const images = drawn(calls);
    expect(images).toHaveLength(1);
    expect(images[0].args.slice(1)).toEqual([7, 17, 6, 6]);
    expect(spriteOf(images[0])).toMatchObject({ anchor: 1, tint: 2 });
    // The opacity is set right before the draw, and reset once at the end.
    const alphas = calls.filter((c) => c.name === "set:globalAlpha").map((c) => c.args[0]);
    expect(alphas[0]).toBeCloseTo(0.3);
    expect(alphas[alphas.length - 1]).toBe(1);
    expect(calls.indexOf(images[0])).toBeGreaterThan(calls.findIndex((c) => c.name === "set:globalAlpha"));
  });

  it("skips particles wholly outside the view and keeps those that overlap its edge", () => {
    const { ctx, calls } = recordingContext();
    drawParticles(
      ctx,
      layerOf([
        { x: 105, y: 50, size: 3 }, // right edge at 102 > 100: gone
        { x: 102, y: 50, size: 3 }, // left edge at 99 ≤ 100: overlaps
        { x: -5, y: 50, size: 3 }, // right edge at -2 < 0: gone
        { x: -2, y: 50, size: 3 }, // right edge at 1 ≥ 0: overlaps
        { x: 50, y: 104, size: 3 },
        { x: 50, y: 102, size: 3 },
        { x: 50, y: -4, size: 3 },
        { x: 50, y: -2, size: 3 },
      ]),
      view,
      1,
    );
    const xs = drawn(calls).map((c) => (c.args[1] as number) + (c.args[3] as number) / 2);
    const ys = drawn(calls).map((c) => (c.args[2] as number) + (c.args[4] as number) / 2);
    expect(xs).toEqual([102, -2, 50, 50]);
    expect(ys).toEqual([50, 50, 102, -2]);
  });

  it("never resets the opacity mid-way and leaves the context at full opacity even when nothing is drawn", () => {
    const { ctx, calls } = recordingContext();
    drawParticles(ctx, layerOf([{ x: 500, y: 500, size: 1 }]), view, 1);
    expect(drawn(calls)).toHaveLength(0);
    expect(calls.map((c) => c.name)).toEqual(["set:globalAlpha"]);
    expect(calls[0].args[0]).toBe(1);
  });

  it("picks the sprite level from the particle's diameter in device pixels", () => {
    const check = (size: number, k: number, dpr: number) => {
      const { ctx, calls } = recordingContext();
      drawParticles(ctx, layerOf([{ x: 50, y: 50, size }], dpr), view, k);
      return spriteOf(drawn(calls)[0]).level;
    };
    // Diameter on screen = 2 · size · k, times dpr for device pixels.
    expect(check(3, 2, 2)).toBe(spriteLevel(24));
    expect(check(3, 2, 2)).toBe(2);
    expect(check(3, 0.5, 1)).toBe(spriteLevel(3));
    expect(check(3, 0.5, 1)).toBe(0);
    expect(check(6, 4, 2)).toBe(SPRITE_LEVELS.length - 1);
  });
});

describe("drawMap", () => {
  const empty = { nodes: [], links: [] };

  it("culls particles by the viewport's world rectangle, inverted from the transform", () => {
    // screen = world · 2 + (100, 50) on a 400 × 300 canvas → world view x ∈ [-50, 150], y ∈ [-25, 125].
    const t = { k: 2, x: 100, y: 50 };
    const size = { width: 400, height: 300 };
    const { ctx, calls } = recordingContext();
    drawMap(
      ctx,
      empty,
      palette,
      t,
      size,
      layerOf([
        { x: -60, y: 0, size: 5 }, // right edge -55 < -50: outside
        { x: -54, y: 0, size: 5 }, // right edge -49: overlaps the left edge
        { x: 156, y: 0, size: 5 }, // left edge 151 > 150: outside
        { x: 0, y: 131, size: 5 }, // top edge 126 > 125: outside
        { x: 0, y: -31, size: 5 }, // bottom edge -26 < -25: outside
        { x: 0, y: -29, size: 5 }, // bottom edge -24: overlaps the top edge
      ]),
    );
    const centers = drawn(calls).map((c) => [
      (c.args[1] as number) + 5,
      (c.args[2] as number) + 5,
    ]);
    expect(centers).toEqual([
      [-54, 0],
      [0, -29],
    ]);
  });

  it("draws in world space with the zoom applied, and the dust after the links but under the halos", () => {
    const a: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 26, x: 0, y: 0 };
    const b: SimNode = { id: "area:data", type: "area", area: "data", label: "Data", radius: 26, x: 100, y: 0 };
    const link: SimLink = { source: a, target: b, strength: 1 };
    const t = { k: 1.5, x: 20, y: 10 };
    const { ctx, calls } = recordingContext();
    drawMap(ctx, { nodes: [a, b], links: [link] }, palette, t, { width: 400, height: 300 }, layerOf([{ x: 50, y: 0, size: 2 }]));

    const names = calls.map((c) => c.name);
    expect(calls.find((c) => c.name === "translate")?.args).toEqual([20, 10]);
    expect(calls.find((c) => c.name === "scale")?.args).toEqual([1.5, 1.5]);
    expect(names.indexOf("stroke")).toBeLessThan(names.indexOf("drawImage"));
    expect(names.indexOf("drawImage")).toBeLessThan(names.indexOf("fill"));
    // Links are hairlines at any zoom: the width is divided by the scale.
    expect(calls.find((c) => c.name === "set:lineWidth")?.args[0]).toBeCloseTo(1.25 / 1.5);
  });

  it("draws nothing for the dust when no layer is given", () => {
    const { ctx, calls } = recordingContext();
    drawMap(ctx, empty, palette, { k: 1, x: 0, y: 0 }, { width: 10, height: 10 });
    expect(drawn(calls)).toHaveLength(0);
  });
});

describe("drawMap nodes", () => {
  it("draws the self node as a halo and three nested discs that shrink and grow more opaque toward the core", () => {
      // A soft sphere without any gradient: flat discs at r, 0.66r and 0.34r at
      // opacity 0.22, 0.45 and 0.9, all in the self color and all on the same
      // center, drawn over a halo of HALO_FACTOR·r at 0.08.
      const self: SimNode = { id: "self", type: "self", label: "Me", radius: 50, x: 10, y: 20 };
      const { ctx, calls } = recordingContext();
      drawMap(ctx, { nodes: [self], links: [] }, palette, { k: 1, x: 0, y: 0 }, { width: 400, height: 300 });

      // Each arc, with the fill color and opacity in effect when it was drawn.
      const before = (i: number, name: string) => calls.slice(0, i).reverse().find((c) => c.name === name)?.args[0];
      const round = (n: unknown) => Math.round((n as number) * 1e6) / 1e6;
      const discs = calls.flatMap((c, i) =>
        c.name === "arc"
          ? [{ x: c.args[0], y: c.args[1], r: round(c.args[2]), alpha: before(i, "set:globalAlpha"), fill: before(i, "set:fillStyle") }]
          : [],
      );
      expect(discs).toEqual([
        { x: 10, y: 20, r: 50 * HALO_FACTOR, alpha: 0.08, fill: palette.self },
        { x: 10, y: 20, r: 50, alpha: 0.22, fill: palette.self },
        { x: 10, y: 20, r: 33, alpha: 0.45, fill: palette.self },
        { x: 10, y: 20, r: 17, alpha: 0.9, fill: palette.self },
      ]);
      // Every disc is a full, filled circle, and the context is handed back at full opacity.
      const arcs = calls.filter((c) => c.name === "arc");
      expect(arcs.every((c) => c.args[3] === 0 && c.args[4] === Math.PI * 2)).toBe(true);
      expect(calls.filter((c) => c.name === "fill")).toHaveLength(4);
      const lastFill = calls.indexOf(calls.filter((c) => c.name === "fill").at(-1)!);
      expect(calls.slice(lastFill).find((c) => c.name === "set:globalAlpha")?.args).toEqual([1]);
    });

  it("halos self and area nodes under every solid disc, colors nodes by area, and skips nodes without a position", () => {
      // Halos come first (self at 0.08, area at 0.14, both HALO_FACTOR·r) so no halo
      // ever tints a neighbour's disc; projects get a single 0.95 disc and no halo;
      // area and project nodes take their area's color. A node d3 has not placed yet
      // draws nothing at all.
      const self: SimNode = { id: "self", type: "self", label: "Me", radius: 40, x: 0, y: 0 };
      const area: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 20, x: 100, y: 0 };
      const project: SimNode = { id: "project:p", type: "project", area: "web", href: "/projects/p", label: "P", radius: 10, x: 150, y: 30 };
      const unplaced: SimNode = { id: "area:data", type: "area", area: "data", label: "Data", radius: 20 };
      const { ctx, calls } = recordingContext();
      drawMap(ctx, { nodes: [self, area, project, unplaced], links: [] }, palette, { k: 1, x: 0, y: 0 }, { width: 400, height: 300 });

      const before = (i: number, name: string) => calls.slice(0, i).reverse().find((c) => c.name === name)?.args[0];
      const round = (n: unknown) => Math.round((n as number) * 1e6) / 1e6;
      const discs = calls.flatMap((c, i) =>
        c.name === "arc"
          ? [{ x: c.args[0], y: c.args[1], r: round(c.args[2]), alpha: before(i, "set:globalAlpha"), fill: before(i, "set:fillStyle") }]
          : [],
      );
      expect(discs).toEqual([
        { x: 0, y: 0, r: 40 * HALO_FACTOR, alpha: 0.08, fill: palette.self },
        { x: 100, y: 0, r: 20 * HALO_FACTOR, alpha: 0.14, fill: palette.area.web },
        { x: 0, y: 0, r: 40, alpha: 0.22, fill: palette.self },
        { x: 0, y: 0, r: 26.4, alpha: 0.45, fill: palette.self },
        { x: 0, y: 0, r: 13.6, alpha: 0.9, fill: palette.self },
        { x: 100, y: 0, r: 20, alpha: 0.85, fill: palette.area.web },
        { x: 150, y: 30, r: 10, alpha: 0.95, fill: palette.area.web },
      ]);
      expect(calls.some((c) => c.name === "set:fillStyle" && c.args[0] === palette.area.data)).toBe(false);
    });
});

describe("drawMap center label", () => {
  it("draws the center label in screen space just below the self halo, over a cleared box padded around the text", () => {
      // Screen = world · 2 + (100, 50). The self node at world (10, 20) with r 50 is
      // centered at (120, 90); the label's top edge sits HALO_FACTOR·r·k + LABEL_GAP
      // below that, in screen pixels so it keeps its size at any zoom. The box behind
      // the measured 40 px of text is cleared first so the link running down to the
      // area below does not cross the letters.
      const self: SimNode = { id: "self", type: "self", label: "Nitin", radius: 50, x: 10, y: 20 };
      const t = { k: 2, x: 100, y: 50 };
      const size = { width: 400, height: 300 };
      const { ctx, calls } = recordingContext();
      drawMap(ctx, { nodes: [self], links: [] }, palette, t, size);

      const sy = 90 + 50 * HALO_FACTOR * 2 + LABEL_GAP;
      const text = calls.find((c) => c.name === "fillText")!;
      expect(text.args).toEqual(["Nitin", 120, sy]);
      const clears = calls.filter((c) => c.name === "clearRect");
      expect(clears.map((c) => c.args)).toEqual([
        [0, 0, size.width, size.height],
        [120 - 20 - CENTER_LABEL_PAD, sy - CENTER_LABEL_PAD, 40 + CENTER_LABEL_PAD * 2, CENTER_LABEL_SIZE + CENTER_LABEL_PAD * 2],
      ]);
      // Cleared, then written, after the world-space transform has been restored.
      const names = calls.map((c) => c.name);
      expect(names.indexOf("restore")).toBeLessThan(calls.indexOf(clears[1]));
      expect(calls.indexOf(clears[1])).toBeLessThan(calls.indexOf(text));
      // Centered, top-anchored, medium weight at CENTER_LABEL_SIZE in the palette font and label color.
      const before = (i: number, name: string) => calls.slice(0, i).reverse().find((c) => c.name === name)?.args[0];
      const at = calls.indexOf(text);
      expect(before(at, "set:textAlign")).toBe("center");
      expect(before(at, "set:textBaseline")).toBe("top");
      expect(before(at, "set:font")).toBe(`500 ${CENTER_LABEL_SIZE}px ${palette.fontFamily}`);
      expect(before(at, "set:fillStyle")).toBe(palette.label);

      // Without a self node there is no label and nothing but the frame clear.
      const area: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 20, x: 0, y: 0 };
      const other = recordingContext();
      drawMap(other.ctx, { nodes: [area], links: [] }, palette, t, size);
      expect(other.calls.filter((c) => c.name === "fillText")).toHaveLength(0);
      expect(other.calls.filter((c) => c.name === "clearRect")).toHaveLength(1);
    });
});

describe("drawMap links", () => {
  it("fades each link by its strength and skips links whose endpoints are not yet positioned", () => {
      // alpha = 0.35 + 0.4·strength, so a strength-0 link is a faint 0.35 and a
      // strength-1 link a solid 0.75; each is a single stroked segment between the
      // endpoints' world positions in the link color. A link to a node d3 has not
      // placed is not drawn rather than stroked to (undefined, undefined).
      const a: SimNode = { id: "area:web", type: "area", area: "web", label: "Web", radius: 20, x: 0, y: 0 };
      const b: SimNode = { id: "area:data", type: "area", area: "data", label: "Data", radius: 20, x: 100, y: 40 };
      const c: SimNode = { id: "area:trading", type: "area", area: "trading", label: "Trading", radius: 20, x: -50, y: 80 };
      const unplaced: SimNode = { id: "area:realestate", type: "area", area: "realestate", label: "RE", radius: 20 };
      const links: SimLink[] = [
        { source: a, target: b, strength: 0 },
        { source: b, target: c, strength: 1 },
        { source: a, target: c, strength: 0.5 },
        { source: a, target: unplaced, strength: 1 },
      ];
      const { ctx, calls } = recordingContext();
      drawMap(ctx, { nodes: [a, b, c, unplaced], links }, palette, { k: 1, x: 0, y: 0 }, { width: 400, height: 300 });

      const before = (i: number, name: string) => calls.slice(0, i).reverse().find((c) => c.name === name)?.args[0];
      const strokes = calls.map((call, i) => ({ call, i })).filter(({ call }) => call.name === "stroke");
      expect(strokes.map(({ i }) => Math.round((before(i, "set:globalAlpha") as number) * 1e9) / 1e9)).toEqual([0.35, 0.75, 0.55]);
      expect(calls.filter((call) => call.name === "moveTo").map((call) => call.args)).toEqual([[0, 0], [100, 40], [0, 0]]);
      expect(calls.filter((call) => call.name === "lineTo").map((call) => call.args)).toEqual([[100, 40], [-50, 80], [-50, 80]]);
      expect(before(strokes[0].i, "set:strokeStyle")).toBe(palette.link);
      expect(before(strokes[0].i, "set:lineCap")).toBe("round");
      // Opacity goes back to 1 before anything else (dust, halos) is drawn.
      const afterLinks = calls.slice(strokes[2].i);
      expect(afterLinks.find((call) => call.name === "set:globalAlpha")?.args).toEqual([1]);
    });
});

describe("drawMinimap", () => {
  it("draws every positioned node as a dot no smaller than the minimum in its color, then the half-pixel-aligned viewport frame", () => {
      // Minimap = world · 0.1 + (90, 60). Dots scale with the minimap but never
      // shrink below MINIMAP_MIN_DOT, so small projects stay visible; self takes
      // the self color and everything else its area color; projects are a touch
      // more opaque. A node without a position is skipped.
      const mm = { k: 0.1, x: 90, y: 60 };
      const nodes: SimNode[] = [
        { id: "self", type: "self", label: "Me", radius: 40, x: 0, y: 0 },
        { id: "area:data", type: "area", area: "data", label: "Data", radius: 26, x: 100, y: 0 },
        { id: "project:p", type: "project", area: "data", href: "/projects/p", label: "P", radius: 8, x: -200, y: 100 },
        { id: "area:web", type: "area", area: "web", label: "Web", radius: 26 },
      ];
      const { ctx, calls } = recordingContext();
      drawMinimap(ctx, nodes, palette, mm, { x: 20.4, y: 30.6, width: 50.4, height: 0.2 });

      expect(calls[0]).toEqual({ name: "clearRect", args: [0, 0, MINIMAP_SIZE.width, MINIMAP_SIZE.height] });
      const before = (i: number, name: string) => calls.slice(0, i).reverse().find((c) => c.name === name)?.args[0];
      const round = (n: unknown) => Math.round((n as number) * 1e6) / 1e6;
      const dots = calls.flatMap((c, i) =>
        c.name === "arc"
          ? [{ x: round(c.args[0]), y: round(c.args[1]), r: round(c.args[2]), alpha: before(i, "set:globalAlpha"), fill: before(i, "set:fillStyle") }]
          : [],
      );
      expect(dots).toEqual([
        { x: 90, y: 60, r: 4, alpha: 0.75, fill: palette.self },
        { x: 100, y: 60, r: 2.6, alpha: 0.75, fill: palette.area.data },
        { x: 70, y: 70, r: MINIMAP_MIN_DOT, alpha: 0.9, fill: palette.area.data },
      ]);
      expect(calls.filter((c) => c.name === "fill")).toHaveLength(3);

      // The viewport is rounded to whole pixels and offset by half a pixel so the
      // 1 px stroke lands on a single device row; a viewport thinner than a pixel
      // is still drawn 1 px tall. Faint fill, then the stroke, both in the label color.
      const fillRect = calls.find((c) => c.name === "fillRect")!;
      const strokeRect = calls.find((c) => c.name === "strokeRect")!;
      expect(fillRect.args).toEqual([20.5, 31.5, 50, 1]);
      expect(strokeRect.args).toEqual([20.5, 31.5, 50, 1]);
      const iFill = calls.indexOf(fillRect);
      const iStroke = calls.indexOf(strokeRect);
      expect(before(iFill, "set:globalAlpha")).toBe(0.06);
      expect(before(iFill, "set:fillStyle")).toBe(palette.label);
      expect(before(iStroke, "set:globalAlpha")).toBe(0.55);
      expect(before(iStroke, "set:strokeStyle")).toBe(palette.label);
      expect(before(iStroke, "set:lineWidth")).toBe(1);
      // The frame sits above every dot, and the context is handed back at full opacity.
      expect(iFill).toBeGreaterThan(calls.indexOf(calls.filter((c) => c.name === "fill").at(-1)!));
      expect(iFill).toBeLessThan(iStroke);
      expect(calls.at(-1)).toEqual({ name: "set:globalAlpha", args: [1] });
    });
});
