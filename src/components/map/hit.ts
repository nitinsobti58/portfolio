import { drawnRadius, toWorld } from "./fit";
import type { SimNode, Transform } from "./types";

/** Extra screen pixels around every node that still count as a hit. */
export const HIT_SLOP_PX = 4;

/**
 * Radius, in world units, inside which a screen point counts as hitting
 * `node`. Self and area nodes are hittable across their halo; the slop is
 * given in screen pixels so small project discs stay easy to click when the
 * map is zoomed out.
 */
export function hitRadius(node: SimNode, k: number, slopPx = HIT_SLOP_PX) {
  return drawnRadius(node) + slopPx / k;
}

/**
 * Finds the node under a screen point. Inverts the zoom transform and scans
 * every node for the nearest one whose hit radius contains the point. The
 * map has ~10 real nodes, so a linear scan is the right tool; no quadtree.
 */
export function hitTest(
  nodes: readonly SimNode[],
  t: Transform,
  sx: number,
  sy: number,
  slopPx = HIT_SLOP_PX,
): SimNode | null {
  const p = toWorld(t, sx, sy);
  let best: SimNode | null = null;
  let bestDistance = Infinity;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const d = Math.hypot(p.x - node.x, p.y - node.y);
    if (d <= hitRadius(node, t.k, slopPx) && d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}
