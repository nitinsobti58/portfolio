import { describe, expect, it } from "vitest";

import { TINT_COUNT } from "../particles";
import { formatOklch, parseOklch, SPRITE_LEVELS, spriteLevel, tintsOf } from "../sprites";

describe("parseOklch", () => {
  it("reads the theme's oklch form", () => {
    expect(parseOklch("oklch(0.7 0.11 45)")).toEqual({ l: 0.7, c: 0.11, h: 45 });
    expect(parseOklch(" oklch(70% 0.11 45deg / 0.5) ")).toEqual({ l: 0.7, c: 0.11, h: 45 });
  });

  it("rejects other color syntaxes", () => {
    expect(parseOklch("#abcdef")).toBeNull();
    expect(parseOklch("rgb(1, 2, 3)")).toBeNull();
    expect(parseOklch("")).toBeNull();
  });
});

describe("tintsOf", () => {
  it("returns the base color in the middle with a deeper and a paler neighbor", () => {
    const tints = tintsOf("oklch(0.7 0.11 45)");
    expect(tints).toHaveLength(TINT_COUNT);
    expect(tints[1]).toBe(formatOklch({ l: 0.7, c: 0.11, h: 45 }));
    const deeper = parseOklch(tints[0])!;
    const paler = parseOklch(tints[2])!;
    expect(deeper.l).toBeLessThan(0.7);
    expect(paler.l).toBeGreaterThan(0.7);
    expect(deeper.h).toBeLessThan(45);
    expect(paler.h).toBeGreaterThan(45);
    expect(new Set(tints).size).toBe(TINT_COUNT);
  });

  it("falls back to the base color when it cannot be parsed", () => {
    expect(tintsOf("#abcdef")).toEqual(["#abcdef", "#abcdef", "#abcdef"]);
  });

  it("keeps lightness and hue in range", () => {
    const tints = tintsOf("oklch(0.98 0.02 355)");
    for (const t of tints) {
      const c = parseOklch(t)!;
      expect(c.l).toBeLessThanOrEqual(1);
      expect(c.h).toBeGreaterThanOrEqual(0);
      expect(c.h).toBeLessThan(360);
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
    for (let d = 0.5; d <= 64; d += 0.5) {
      const level = SPRITE_LEVELS[spriteLevel(d)];
      expect(level).toBeGreaterThanOrEqual(d);
      expect(level / d).toBeLessThanOrEqual(2 + 1e-9 + (d < 8 ? 8 / d : 0));
    }
  });
});
