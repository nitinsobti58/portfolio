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

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/.*)?\)$/i;

/** Parses the `oklch(L C H)` form the theme uses; null for anything else. */
export function parseOklch(color: string): Oklch | null {
  const m = OKLCH.exec(color.trim());
  if (!m) return null;
  const l = m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  return { l, c: parseFloat(m[2]), h: parseFloat(m[3]) };
}

export function formatOklch({ l, c, h }: Oklch) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return `oklch(${clamp(l, 0, 1).toFixed(3)} ${clamp(c, 0, 0.4).toFixed(3)} ${((h % 360) + 360) % 360})`;
}

/**
 * The tint variants of an area color: a slightly deeper, the base, and a
 * paler one, a few degrees apart in hue so a cluster has the unevenness of
 * a wash rather than one flat ink. Colors that are not `oklch()` get the
 * base color for every tint.
 */
export function tintsOf(color: string, count = TINT_COUNT): string[] {
  const base = parseOklch(color);
  return Array.from({ length: count }, (_, i) => {
    if (!base || i >= TINT_HUE.length) return color;
    return formatOklch({
      l: base.l + TINT_LIGHTNESS[i],
      c: base.c * TINT_CHROMA[i],
      h: base.h + TINT_HUE[i],
    });
  });
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
