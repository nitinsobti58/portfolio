import type { Palette } from "./palette";
import type { SimLink, SimNode, Size, Transform } from "./types";

/** Halo radius as a multiple of the node radius, for self and area nodes. */
export const HALO_FACTOR = 1.9;

/** Screen pixels between a node's halo (or disc) and its label. Shared with the pill overlay. */
export const LABEL_GAP = 6;

/** Font size of the center node's canvas label, in CSS pixels. */
export const CENTER_LABEL_SIZE = 15;

/** Cleared padding around the center label so links stop short of the text. */
export const CENTER_LABEL_PAD = 4;

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

  // The DOM overlay carries every area and project label as a pill; only
  // the center node keeps a canvas label. Drawn in screen space so it stays
  // a constant size at any zoom. The link to the area below the center runs
  // straight through this label, so the box behind the text is cleared to
  // the page background first, the way the pills occlude their links.
  const self = scene.nodes.find((n) => n.type === "self");
  if (self && self.x != null && self.y != null) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `500 ${CENTER_LABEL_SIZE}px ${palette.fontFamily}`;
    const sx = self.x * t.k + t.x;
    const sy = self.y * t.k + t.y + self.radius * HALO_FACTOR * t.k + LABEL_GAP;
    const width = ctx.measureText(self.label).width;
    ctx.clearRect(
      sx - width / 2 - CENTER_LABEL_PAD,
      sy - CENTER_LABEL_PAD,
      width + CENTER_LABEL_PAD * 2,
      CENTER_LABEL_SIZE + CENTER_LABEL_PAD * 2,
    );
    ctx.fillStyle = palette.label;
    ctx.fillText(self.label, sx, sy);
    ctx.restore();
  }
}
