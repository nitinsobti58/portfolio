import { describe, expect, it } from "vitest";

import { LABEL_MARGIN, placeLabels, type LabelSpec, type Obstacle } from "../labels";

const label = (id: string, kind: LabelSpec["kind"], x: number, y: number, extra: Partial<LabelSpec> = {}): LabelSpec => ({
  id,
  kind,
  x,
  y,
  offset: 20,
  width: 80,
  height: 28,
  ...extra,
});

describe("placeLabels", () => {
  it("places every label below its node, centered, when nothing collides", () => {
    const out = placeLabels([label("area:a", "area", 100, 100), label("project:p", "project", 400, 100)]);
    expect(out).toEqual([
      { id: "area:a", x: 60, y: 120, side: "below", visible: true },
      { id: "project:p", x: 360, y: 120, side: "below", visible: true },
    ]);
  });

  it("returns placements in input order even though areas are placed first", () => {
    const out = placeLabels([label("project:p", "project", 400, 100), label("area:a", "area", 100, 100)]);
    expect(out.map((p) => p.id)).toEqual(["project:p", "area:a"]);
  });

  it("flips a project label above its node when its slot below hits an area label", () => {
    // Project 30 px below the area: its below-slot (y 150..178) overlaps the area's (120..148).
    const out = placeLabels([label("area:a", "area", 100, 100), label("project:p", "project", 100, 130)]);
    expect(out[0]).toMatchObject({ side: "below", visible: true });
    expect(out[1]).toMatchObject({ side: "above", visible: true, y: 130 - 20 - 28 });
  });

  it("hides a project label with no clear slot", () => {
    // Below (140..168) collides with area a's slot (160..188); above (92..120) with area b's (70..98).
    const out = placeLabels([
      label("area:a", "area", 100, 140),
      label("area:b", "area", 100, 50),
      label("project:p", "project", 100, 130, { offset: 10 }),
    ]);
    expect(out[2].visible).toBe(false);
    expect(out[2].side).toBe("below");
  });

  it("keeps a pinned project label visible in its slot below", () => {
    const out = placeLabels([
      label("area:a", "area", 100, 140),
      label("area:b", "area", 100, 50),
      label("project:p", "project", 100, 130, { offset: 10, pinned: true }),
    ]);
    expect(out[2]).toMatchObject({ side: "below", visible: true });
  });

  it("never hides an area label", () => {
    const out = placeLabels([
      label("area:a", "area", 100, 100),
      label("area:b", "area", 100, 100),
      label("area:c", "area", 100, 100),
    ]);
    expect(out.every((p) => p.visible)).toBe(true);
    expect(out.map((p) => p.side)).toEqual(["below", "above", "below"]);
  });

  it("area labels win over project labels regardless of input order", () => {
    const out = placeLabels([label("project:p", "project", 100, 130), label("area:a", "area", 100, 100)]);
    expect(out[1]).toMatchObject({ side: "below" });
    expect(out[0]).toMatchObject({ side: "above" });
  });

  it("treats node discs as obstacles but ignores the label's own node", () => {
    const disc: Obstacle = { id: "project:p", x: 100, y: 135, r: 10 };
    const own: Obstacle = { id: "area:a", x: 100, y: 100, r: 48 };
    // The area's slot below (120..148) covers the project disc → flip above.
    const out = placeLabels([label("area:a", "area", 100, 100)], [disc, own]);
    expect(out[0]).toMatchObject({ side: "above", visible: true });
    // Without the disc the own node is never an obstacle.
    expect(placeLabels([label("area:a", "area", 100, 100)], [own])[0].side).toBe("below");
  });

  it("keeps a margin between labels", () => {
    // Second label's slot starts exactly LABEL_MARGIN - 1 px below the first's bottom edge.
    const a = label("area:a", "area", 100, 100);
    const tooClose = label("area:b", "area", 100, 100 + 28 + LABEL_MARGIN - 1);
    const farEnough = label("area:c", "area", 100, 100 + 28 + LABEL_MARGIN);
    expect(placeLabels([a, tooClose])[1].side).toBe("above");
    expect(placeLabels([a, farEnough])[1].side).toBe("below");
  });

  it("handles zero-size labels (no layout yet) without collisions", () => {
    const out = placeLabels([
      label("area:a", "area", 100, 100, { width: 0, height: 0 }),
      label("project:p", "project", 400, 300, { width: 0, height: 0 }),
    ]);
    expect(out.every((p) => p.visible && p.side === "below")).toBe(true);
  });
});
