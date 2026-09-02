import { describe, expect, it } from "vitest";

import type { Palette } from "../palette";
import type { ParticleField } from "../particles";
import { drawMap, drawParticles, type ParticleLayer } from "../render";
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
