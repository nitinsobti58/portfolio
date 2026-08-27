import { describe, expect, it, vi } from "vitest";

import { CLICK_DISTANCE, createMapZoom, PAN_MARGIN, SCALE_EXTENT, toZoomTransform } from "../zoom";

const bounds = { minX: -300, minY: -200, maxX: 300, maxY: 200 };
const size = { width: 1000, height: 600 };
const extent: [[number, number], [number, number]] = [[0, 0], [size.width, size.height]];
const unbounded: [[number, number], [number, number]] = [
  [-Infinity, -Infinity],
  [Infinity, Infinity],
];

describe("toZoomTransform", () => {
  it("keeps k, x and y and applies like our Transform", () => {
    const t = toZoomTransform({ k: 2, x: 10, y: -5 });
    expect([t.k, t.x, t.y]).toEqual([2, 10, -5]);
    expect(t.apply([3, 4])).toEqual([16, 3]);
    expect(t.invert([16, 3])).toEqual([3, 4]);
  });
});

describe("createMapZoom", () => {
  const make = () => {
    const onZoom = vi.fn();
    const zoom = createMapZoom({ bounds: () => bounds, size: () => size, onZoom });
    return { zoom, onZoom };
  };

  it("uses the spec's scale extent and a forgiving click distance", () => {
    const { zoom } = make();
    expect(zoom.scaleExtent()).toEqual(SCALE_EXTENT);
    expect(zoom.clickDistance()).toBe(CLICK_DISTANCE);
  });

  it("constrains panning so the graph keeps its margin on screen", () => {
    const { zoom } = make();
    const constrain = zoom.constrain();
    const pushed = toZoomTransform({ k: 1, x: 5000, y: 300 });
    const kept = constrain(pushed, extent, unbounded);
    expect(kept.x).toBeCloseTo(size.width - PAN_MARGIN - bounds.minX);
    expect(kept.y).toBe(300);
    const fine = toZoomTransform({ k: 1, x: 500, y: 300 });
    expect(constrain(fine, extent, unbounded)).toBe(fine);
  });

  it("reports whether a zoom event came from user input", () => {
    const { zoom, onZoom } = make();
    const listener = zoom.on("zoom")!;
    const transform = toZoomTransform({ k: 1, x: 0, y: 0 });
    const el = {} as HTMLElement;
    listener.call(el, { transform, sourceEvent: null }, undefined);
    listener.call(el, { transform, sourceEvent: { type: "wheel" } }, undefined);
    expect(onZoom).toHaveBeenNthCalledWith(1, transform, false);
    expect(onZoom).toHaveBeenNthCalledWith(2, transform, true);
  });
});
