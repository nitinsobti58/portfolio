import type { Rect } from "./types";

export type LabelKind = "area" | "project";

export type LabelSide = "below" | "above";

/** One label to place, all in screen pixels. */
export type LabelSpec = {
  id: string;
  kind: LabelKind;
  /** Screen position of the node the label belongs to. */
  x: number;
  y: number;
  /** Distance from the node center to the label's near edge (drawn radius · k + gap). */
  offset: number;
  width: number;
  height: number;
  /** Keep the label visible in its default slot even when it collides (it has keyboard focus). */
  pinned?: boolean;
};

/** A node disc the labels must not cover, in screen pixels. */
export type Obstacle = { id: string; x: number; y: number; r: number };

export type Placement = {
  id: string;
  /** Top-left corner of the label. */
  x: number;
  y: number;
  side: LabelSide;
  visible: boolean;
};

/** Minimum screen pixels between a label and anything it must not touch. */
export const LABEL_MARGIN = 4;

const RANK: Record<LabelKind, number> = { area: 0, project: 1 };

function slot(spec: LabelSpec, side: LabelSide): Rect {
  return {
    x: spec.x - spec.width / 2,
    y: side === "below" ? spec.y + spec.offset : spec.y - spec.offset - spec.height,
    width: spec.width,
    height: spec.height,
  };
}

function rectsIntersect(a: Rect, b: Rect, margin: number) {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

function rectHitsCircle(rect: Rect, c: Obstacle, margin: number) {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.height));
  return Math.hypot(c.x - nx, c.y - ny) < c.r + margin;
}

/**
 * Lays out the label pills so they never cover each other or a node.
 *
 * Rule: area labels are placed first, then project labels, each in input
 * order. Every label tries its default slot below its node, then the slot
 * above it; the first slot clear of already placed labels and of every
 * node disc (its own excepted) wins. A project label with no clear slot is
 * hidden; area labels and the pinned (focused) label stay visible below
 * their node regardless, so the primary navigation never disappears and
 * keyboard focus is never dropped.
 *
 * Pure: screen positions in, placements out (same order as the input).
 */
export function placeLabels(
  specs: readonly LabelSpec[],
  obstacles: readonly Obstacle[] = [],
  margin = LABEL_MARGIN,
): Placement[] {
  const order = specs
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => RANK[a.spec.kind] - RANK[b.spec.kind] || a.index - b.index);

  const placed: Rect[] = [];
  const result: Placement[] = new Array(specs.length);

  for (const { spec, index } of order) {
    const clear = (rect: Rect) =>
      !placed.some((other) => rectsIntersect(rect, other, margin)) &&
      !obstacles.some((o) => o.id !== spec.id && rectHitsCircle(rect, o, margin));

    let side: LabelSide = "below";
    let rect = slot(spec, side);
    let visible = true;
    if (!clear(rect)) {
      const above = slot(spec, "above");
      if (clear(above)) {
        side = "above";
        rect = above;
      } else if (spec.kind === "project" && !spec.pinned) {
        visible = false;
      }
    }

    if (visible) placed.push(rect);
    result[index] = { id: spec.id, x: rect.x, y: rect.y, side, visible };
  }

  return result;
}
