import type { AreaId } from "@/data/projects";

import type { Palette } from "./palette";
import { TINT_COUNT } from "./particles";

/**
 * Pre-rendered soft discs per area, indexed `[tint][level]`. Drawn with
 * `drawImage`, never a gradient per particle.
 */
export type SpriteSet = Record<AreaId, CanvasImageSource[][]>;

/**
 * Sprite edges in device pixels, smallest first. A particle draws the level
 * nearest above its own device-pixel diameter, so no draw downscales by
 * more than 2×: a 64 px sprite squeezed into 3 px is the slow path of a
 * software rasterizer, and it was measured at hundreds of ms per frame.
 */
export const SPRITE_LEVELS: readonly number[] = [8, 16, 32, 64];

/** Fraction of the radius that stays fully opaque before the edge fades out. */
export const SPRITE_CORE = 0.55;

/** Hue offset per tint, degrees, and the matching lightness offset. */
const TINT_HUE = [-8, 0, 8] as const;
const TINT_LIGHTNESS = [-0.04, 0, 0.05] as const;
const TINT_CHROMA = [1.05, 1, 0.85] as const;

export type Oklch = { l: number; c: number; h: number };

/** sRGB bytes → OKLCH (Ottosson's transform), so tints can be shifted in a perceptual space. */
export function srgbToOklch(r: number, g: number, b: number): Oklch {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  const h = c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

export function formatOklch({ l, c, h }: Oklch) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return `oklch(${clamp(l, 0, 1).toFixed(3)} ${clamp(c, 0, 0.4).toFixed(3)} ${(((h % 360) + 360) % 360).toFixed(1)})`;
}

/**
 * Resolves any CSS color the theme may hand over to sRGB by painting it on
 * a scratch canvas. The CSS build compiles the theme's `oklch()` values to
 * `lab()` with hex fallbacks, and a custom property reads back as whatever
 * text was declared, so parsing one syntax is not enough. Null when the
 * color is invalid or no 2D context exists.
 */
export function resolveColor(color: string): Oklch | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // An invalid color leaves fillStyle untouched; a sentinel makes that detectable.
  ctx.fillStyle = "#010203";
  ctx.fillStyle = color;
  if (ctx.fillStyle === "#010203" && color.trim().toLowerCase() !== "#010203") return null;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return srgbToOklch(r, g, b);
}

/**
 * The tint variants of a resolved color: a slightly deeper, the base, and a
 * paler one, a few degrees apart in hue so a cluster has the unevenness of
 * a wash rather than one flat ink.
 */
export function tintsFrom(base: Oklch, count = TINT_COUNT): string[] {
  return Array.from({ length: count }, (_, i) =>
    formatOklch({
      l: base.l + (TINT_LIGHTNESS[i] ?? 0),
      c: base.c * (TINT_CHROMA[i] ?? 1),
      h: base.h + (TINT_HUE[i] ?? 0),
    }),
  );
}

/** Tints of a CSS color string; a color that cannot be resolved gets the base color for every tint. */
export function tintsOf(color: string, count = TINT_COUNT): string[] {
  const base = resolveColor(color);
  return base ? tintsFrom(base, count) : Array.from({ length: count }, () => color);
}

/** Index into `SPRITE_LEVELS` for a particle drawn `deviceDiameter` device pixels wide. */
export function spriteLevel(deviceDiameter: number, levels = SPRITE_LEVELS) {
  for (let i = 0; i < levels.length - 1; i++) if (deviceDiameter <= levels[i]) return i;
  return levels.length - 1;
}

/**
 * Paints one soft disc: a solid fill masked by a radial alpha ramp that is
 * opaque through `SPRITE_CORE` of the radius and clear at the edge. The
 * mask is a gradient of alpha only, so it works for any color string.
 */
function paintSprite(canvas: HTMLCanvasElement, color: string, px: number) {
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, px, px);
  const r = px / 2;
  const mask = ctx.createRadialGradient(r, r, 0, r, r, r);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(SPRITE_CORE, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, px, px);
}

/**
 * Renders the sprite set for a palette: every area × tint × level. Levels
 * are in device pixels, so the set does not depend on devicePixelRatio;
 * it is rebuilt once per theme change and never per frame.
 */
export function renderSprites(palette: Palette): SpriteSet {
  const set = {} as SpriteSet;
  for (const [area, color] of Object.entries(palette.area) as [AreaId, string][]) {
    set[area] = tintsOf(color).map((tint) =>
      SPRITE_LEVELS.map((px) => {
        const canvas = document.createElement("canvas");
        paintSprite(canvas, tint, px);
        return canvas;
      }),
    );
  }
  return set;
}
