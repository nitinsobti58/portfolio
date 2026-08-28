import { toScreen, toWorld, type Bounds } from "./fit";
import type { Palette } from "./palette";
import type { Rect, SimNode, Size, Transform } from "./types";

/** CSS pixel size of the minimap canvas. */
export const MINIMAP_SIZE: Size = { width: 180, height: 120 };

/**
 * Screen pixels kept clear around the graph inside the minimap. Wide enough
 * that the viewport rectangle at the fit view sits visibly inside the frame
 * instead of coinciding with its border.
 */
export const MINIMAP_PADDING = 18;

/** Smallest dot the minimap draws for a node, in CSS pixels. */
export const MINIMAP_MIN_DOT = 1.5;

/**
 * World → minimap transform that fits the graph bounds inside the minimap
 * with `padding` on every side. The graph is static, so this is computed
 * once and reused for every frame.
 */
export function minimapTransform(
  bounds: Bounds,
  size: Size = MINIMAP_SIZE,
  padding = MINIMAP_PADDING,
): Transform {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const k = Math.min((size.width - padding * 2) / w, (size.height - padding * 2) / h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { k, x: size.width / 2 - cx * k, y: size.height / 2 - cy * k };
}

/**
 * The main viewport, as a rectangle in minimap pixels: invert the zoom
 * transform to get the viewport's world corners, then map them through
 * the minimap transform. Not clipped; the canvas edge clips it visually.
 */
export function viewportRect(view: Transform, size: Size, minimap: Transform): Rect {
  const tl = toWorld(view, 0, 0);
  const br = toWorld(view, size.width, size.height);
  const a = toScreen(minimap, tl.x, tl.y);
  const b = toScreen(minimap, br.x, br.y);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/** World coordinates under a point on the minimap. */
export function minimapToWorld(minimap: Transform, mx: number, my: number) {
  return toWorld(minimap, mx, my);
}

/** The transform that keeps the current scale but puts a world point at the viewport center. */
export function centerOn(view: Transform, size: Size, wx: number, wy: number): Transform {
  return { k: view.k, x: size.width / 2 - wx * view.k, y: size.height / 2 - wy * view.k };
}

/**
 * Draws the minimap: every node as a flat dot in its area color, then the
 * viewport rectangle. `ctx` is expected to already be scaled for
 * devicePixelRatio; sizes are CSS pixels.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  nodes: readonly SimNode[],
  palette: Palette,
  minimap: Transform,
  viewport: Rect,
  size: Size = MINIMAP_SIZE,
) {
  ctx.clearRect(0, 0, size.width, size.height);

  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const p = toScreen(minimap, node.x, node.y);
    const r = Math.max(MINIMAP_MIN_DOT, node.radius * minimap.k);
    ctx.fillStyle = node.type === "self" ? palette.self : node.area ? palette.area[node.area] : palette.self;
    ctx.globalAlpha = node.type === "project" ? 0.9 : 0.75;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Half-pixel alignment keeps the 1 px stroke crisp.
  const x = Math.round(viewport.x) + 0.5;
  const y = Math.round(viewport.y) + 0.5;
  const w = Math.max(1, Math.round(viewport.width));
  const h = Math.max(1, Math.round(viewport.height));
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = palette.label;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.label;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;
}
