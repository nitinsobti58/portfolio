import type { Palette } from "./palette";
import type { SimLink, SimNode, Size, Transform } from "./types";

/** Halo radius as a multiple of the node radius, for self and area nodes. */
export const HALO_FACTOR = 1.9;

export type Scene = {
  nodes: readonly SimNode[];
  links: readonly SimLink[];
};

function endpoints(link: SimLink) {
  // After d3-force initialises, source/target are node objects.
  const s = link.source as SimNode;
  const t = link.target as SimNode;
  return { s, t };
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function nodeColor(node: SimNode, palette: Palette) {
  if (node.type === "self") return palette.self;
  return node.area ? palette.area[node.area] : palette.self;
}

/**
 * Draws one full frame. `ctx` is expected to already be scaled for
 * devicePixelRatio; `size` is in CSS pixels. Flat fills only — no
 * gradients, no shadows, no blend modes.
 */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: Palette,
  t: Transform,
  size: Size,
) {
  ctx.clearRect(0, 0, size.width, size.height);

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(t.k, t.k);

  // Links
  ctx.lineWidth = 1.25 / t.k;
  ctx.strokeStyle = palette.link;
  ctx.lineCap = "round";
  for (const link of scene.links) {
    const { s, t: target } = endpoints(link);
    if (s.x == null || s.y == null || target.x == null || target.y == null) continue;
    ctx.globalAlpha = 0.35 + link.strength * 0.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes: halos first so they sit under every solid disc.
  for (const node of scene.nodes) {
    if (node.x == null || node.y == null || node.type === "project") continue;
    ctx.fillStyle = nodeColor(node, palette);
    ctx.globalAlpha = node.type === "self" ? 0.08 : 0.14;
    circle(ctx, node.x, node.y, node.radius * HALO_FACTOR);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const node of scene.nodes) {
    if (node.x == null || node.y == null) continue;
    const color = nodeColor(node, palette);
    ctx.fillStyle = color;

    if (node.type === "self") {
      // Layered translucent discs read as a soft sphere without any gradient.
      ctx.globalAlpha = 0.22;
      circle(ctx, node.x, node.y, node.radius);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      circle(ctx, node.x, node.y, node.radius * 0.66);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      circle(ctx, node.x, node.y, node.radius * 0.34);
      ctx.fill();
    } else if (node.type === "area") {
      ctx.globalAlpha = 0.85;
      circle(ctx, node.x, node.y, node.radius);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.95;
      circle(ctx, node.x, node.y, node.radius);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Labels are drawn in screen space so they stay a constant size.
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const node of scene.nodes) {
    if (node.x == null || node.y == null) continue;
    const sx = node.x * t.k + t.x;
    const sy = node.y * t.k + t.y;
    // Self and area nodes carry a halo (see above); hang their labels below it.
    const haloFactor = node.type === "project" ? 1 : HALO_FACTOR;
    const gap = node.radius * haloFactor * t.k + 6;
    if (node.type === "self") {
      ctx.font = `500 15px ${palette.fontFamily}`;
      ctx.fillStyle = palette.label;
    } else if (node.type === "area") {
      ctx.font = `500 13px ${palette.fontFamily}`;
      ctx.fillStyle = palette.label;
    } else {
      ctx.font = `400 12px ${palette.fontFamily}`;
      ctx.fillStyle = palette.labelMuted;
    }
    ctx.fillText(node.label, sx, sy + gap);
  }
  ctx.restore();
}
