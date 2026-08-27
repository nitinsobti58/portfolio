import type { SimNode, Size, Transform } from "./types";

export const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(nodes: readonly SimNode[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    minX = Math.min(minX, x - n.radius);
    minY = Math.min(minY, y - n.radius);
    maxX = Math.max(maxX, x + n.radius);
    maxY = Math.max(maxY, y + n.radius);
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
  padding = 48,
  maxScale = 1.25,
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

export function toScreen(t: Transform, x: number, y: number) {
  return { x: x * t.k + t.x, y: y * t.k + t.y };
}

export function toWorld(t: Transform, sx: number, sy: number) {
  return { x: (sx - t.x) / t.k, y: (sy - t.y) / t.k };
}
