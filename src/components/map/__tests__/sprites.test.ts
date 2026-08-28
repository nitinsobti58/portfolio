import { describe, expect, it } from "vitest";

import { TINT_COUNT } from "../particles";
import { formatOklch, SPRITE_LEVELS, spriteLevel, srgbToOklch, tintsFrom } from "../sprites";

describe("srgbToOklch", () => {
  it("matches the reference values for white, black, and pure red", () => {
    const white = srgbToOklch(255, 255, 255);
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
    const black = srgbToOklch(0, 0, 0);
    expect(black.l).toBeCloseTo(0, 3);
    const red = srgbToOklch(255, 0, 0);
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });

  it("recovers the theme's terracotta from its compiled hex fallback", () => {
    // --map-area-trading: oklch(0.66 0.1 48) compiles to #c47f5b.
    const c = srgbToOklch(0xc4, 0x7f, 0x5b);
    expect(c.l).toBeCloseTo(0.66, 1);
    expect(c.c).toBeCloseTo(0.1, 1);
    expect(c.h).toBeCloseTo(48, -1);
  });
});

describe("tintsFrom", () => {
  it("returns the base color in the middle with a deeper and a paler neighbor", () => {
    const base = { l: 0.7, c: 0.11, h: 45 };
    const tints = tintsFrom(base);
    expect(tints).toHaveLength(TINT_COUNT);
    expect(tints[1]).toBe(formatOklch(base));
    expect(tints[0]).toBe(formatOklch({ l: 0.66, c: 0.11 * 1.05, h: 37 }));
    expect(tints[2]).toBe(formatOklch({ l: 0.75, c: 0.11 * 0.85, h: 53 }));
    expect(new Set(tints).size).toBe(TINT_COUNT);
  });

  it("keeps lightness, chroma, and hue in range", () => {
    for (const t of tintsFrom({ l: 0.98, c: 0.02, h: 355 })) {
      const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(t)!;
      expect(m).not.toBeNull();
      expect(parseFloat(m[1])).toBeLessThanOrEqual(1);
      expect(parseFloat(m[3])).toBeGreaterThanOrEqual(0);
      expect(parseFloat(m[3])).toBeLessThan(360);
    }
  });
});

describe("spriteLevel", () => {
  it("picks the smallest level that is at least the drawn diameter, so no draw downscales past 2×", () => {
    expect(SPRITE_LEVELS[spriteLevel(1)]).toBe(8);
    expect(SPRITE_LEVELS[spriteLevel(8)]).toBe(8);
    expect(SPRITE_LEVELS[spriteLevel(8.1)]).toBe(16);
    expect(SPRITE_LEVELS[spriteLevel(30)]).toBe(32);
    expect(SPRITE_LEVELS[spriteLevel(64)]).toBe(64);
    expect(SPRITE_LEVELS[spriteLevel(500)]).toBe(64);
    for (let d = 8; d <= 64; d += 0.5) {
      const level = SPRITE_LEVELS[spriteLevel(d)];
      expect(level).toBeGreaterThanOrEqual(d);
      expect(level / d).toBeLessThanOrEqual(2 + 1e-9);
    }
  });
});
