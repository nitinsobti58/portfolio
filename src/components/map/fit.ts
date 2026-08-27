import type { AreaId } from "@/data/projects";

import { HALO_FACTOR } from "./render";
import type { SimNode, Size, Transform } from "./types";

export const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

/** Screen padding around the whole graph when fitting it to the viewport. */
export const FIT_PADDING = 48;
export const FIT_MAX_SCALE = 1.25;

/** Screen padding around an area cluster when flying to it; leaves room for its pills. */
export const FOCUS_PADDING = 96;
export const FOCUS_MAX_SCALE = 2;

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Radius a node occupies on screen: self and area nodes are drawn with a halo. */
export function drawnRadius(node: SimNode) {
  return node.type === "project" ? node.radius : node.radius * HALO_FACTOR;
}

/**
 * Bounding box of the nodes as drawn (halos included), so fitting with the
 * default padding also leaves room for the label pills hanging below them.
 */
export function boundsOf(nodes: readonly SimNode[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const r = drawnRadius(n);
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Transform that centers the node bounds in the viewport with `padding`
 * screen pixels on every side, never scaling above `maxScale`.
 */
export function fitTransform(
  nodes: readonly SimNode[],
  size: Size,
  padding = FIT_PADDING,
  maxScale = FIT_MAX_SCALE,
): Transform {
  const b = boundsOf(nodes);
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const k = Math.min(maxScale, availW / w, availH / h);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    k,
    x: size.width / 2 - cx * k,
    y: size.height / 2 - cy * k,
  };
}

/** The nodes that make up an area's cluster: the area node plus its projects. */
export function clusterOf(nodes: readonly SimNode[], area: AreaId): SimNode[] {
  return nodes.filter((n) => n.type !== "self" && n.area === area);
}

/**
 * Transform that frames one area's cluster. Falls back to the whole graph
 * when the area has no nodes, so the result is always a sensible view.
 */
export function focusTransform(
  nodes: readonly SimNode[],
  area: AreaId,
  size: Size,
  padding = FOCUS_PADDING,
  maxScale = FOCUS_MAX_SCALE,
): Transform {
  const cluster = clusterOf(nodes, area);
  return fitTransform(cluster.length ? cluster : nodes, size, padding, maxScale);
}

function clamp(value: number, lo: number, hi: number) {
  // A viewport smaller than twice the margin inverts the range; settle in the middle.
  if (lo > hi) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Keeps at least `margin` screen pixels of the graph's bounding box inside
 * the viewport, at any scale, so the map can be panned freely but never
 * lost off-screen. Returns the input object when nothing needs clamping.
 */
export function constrainTransform(
  t: Transform,
  b: Bounds,
  size: Size,
  margin: number,
): Transform {
  const x = clamp(t.x, margin - b.maxX * t.k, size.width - margin - b.minX * t.k);
  const y = clamp(t.y, margin - b.maxY * t.k, size.height - margin - b.minY * t.k);
  if (x === t.x && y === t.y) return t;
  return { k: t.k, x, y };
}

/** True when two transforms differ by less than a screen pixel. */
export function sameTransform(a: Transform, b: Transform, epsilon = 0.5) {
  return (
    Math.abs(a.k - b.k) < 1e-3 &&
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon
  );
}

export function toScreen(t: Transform, x: number, y: number) {
  return { x: x * t.k + t.x, y: y * t.k + t.y };
}

export function toWorld(t: Transform, sx: number, sy: number) {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}
