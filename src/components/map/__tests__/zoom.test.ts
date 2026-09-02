import { describe, expect, it, vi } from "vitest";

import {
  CLICK_DISTANCE,
  createMapZoom,
  PAN_MARGIN,
  SCALE_EXTENT,
  toZoomTransform,
  WHEEL_DELTA_MAX,
  wheelDelta,
  zoomFilter,
} from "../zoom";

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

  it("uses the tracked size as the zoom extent", () => {
    const { zoom } = make();
    expect(zoom.extent().call({} as HTMLElement, undefined)).toEqual(extent);
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

describe("zoomFilter", () => {
  const wheel = (mods: Partial<{ ctrlKey: boolean; metaKey: boolean }> = {}) => ({
    type: "wheel",
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });
  const mouse = (mods: Partial<{ ctrlKey: boolean; button: number }> = {}) => ({
    type: "mousedown",
    ctrlKey: false,
    metaKey: false,
    button: 0,
    ...mods,
  });

  it("lets a plain wheel scroll the page and zooms only with ⌘/Ctrl (or a pinch)", () => {
    expect(zoomFilter(wheel())).toBe(false);
    expect(zoomFilter(wheel({ ctrlKey: true }))).toBe(true);
    expect(zoomFilter(wheel({ metaKey: true }))).toBe(true);
  });

  it("keeps d3's pointer rules: primary button only, no Ctrl + click", () => {
    expect(zoomFilter(mouse())).toBe(true);
    expect(zoomFilter(mouse({ button: 2 }))).toBe(false);
    expect(zoomFilter(mouse({ ctrlKey: true }))).toBe(false);
  });

  it("is installed on the behavior", () => {
    const zoom = createMapZoom({ bounds: () => bounds, size: () => size, onZoom: vi.fn() });
    expect(zoom.filter()).toBe(zoomFilter);
  });
});

describe("wheelDelta", () => {
  it("keeps d3's formula for small deltas (trackpad pinch and scroll)", () => {
    expect(wheelDelta({ deltaY: -10, deltaMode: 0, ctrlKey: false })).toBeCloseTo(0.02);
    expect(wheelDelta({ deltaY: -10, deltaMode: 0, ctrlKey: true })).toBeCloseTo(0.2);
    expect(wheelDelta({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBeCloseTo(0.15);
  });

  it("clamps a Ctrl + mouse-wheel notch to one moderate step in either direction", () => {
    expect(wheelDelta({ deltaY: -120, deltaMode: 0, ctrlKey: true })).toBe(WHEEL_DELTA_MAX);
    expect(wheelDelta({ deltaY: 120, deltaMode: 0, ctrlKey: true })).toBe(-WHEEL_DELTA_MAX);
  });

  it("is installed on the behavior", () => {
    const zoom = createMapZoom({ bounds: () => bounds, size: () => size, onZoom: vi.fn() });
    expect(zoom.wheelDelta()).toBe(wheelDelta);
  });
});

describe("wheelDelta units", () => {
  it("is odd in deltaY and treats page-mode (deltaMode 2) deltas as whole steps", () => {
      // Scrolling one way must zoom in exactly as much as scrolling the other way
      // zooms out, in every delta mode, with and without the Ctrl multiplier, and
      // never beyond the cap; otherwise a wheel up/down pair would drift the scale.
      for (const deltaMode of [0, 1, 2]) {
        for (const ctrlKey of [false, true]) {
          for (const deltaY of [0.3, 3, 53, 120, 1000]) {
            const up = wheelDelta({ deltaY: -deltaY, deltaMode, ctrlKey });
            const down = wheelDelta({ deltaY, deltaMode, ctrlKey });
            expect(up).toBeGreaterThan(0);
            expect(down).toBeCloseTo(-up, 12);
            expect(up).toBeLessThanOrEqual(WHEEL_DELTA_MAX);
          }
        }
      }
      // deltaMode 2 is pages (Firefox with "scroll a page at a time"): one unit per
      // page, so a third of a page is a 0.3 step and a whole page still hits the
      // cap instead of jumping to the scale extent.
      expect(wheelDelta({ deltaY: -0.3, deltaMode: 2, ctrlKey: false })).toBeCloseTo(0.3);
      expect(wheelDelta({ deltaY: -1, deltaMode: 2, ctrlKey: false })).toBe(WHEEL_DELTA_MAX);
      expect(wheelDelta({ deltaY: 0.04, deltaMode: 2, ctrlKey: true })).toBeCloseTo(-0.4);
    });
});

describe("zoomFilter touch", () => {
  it("lets touch gestures through: a touch has no button and needs no modifier", () => {
      // A tablet in landscape (≥ 768 px) mounts the canvas with `touch-none`, so
      // d3-zoom owns one-finger pan and two-finger pinch. Touch events carry no
      // `button` at all (FilterEvent makes it optional for this reason), and only
      // the wheel rule asks for ⌘/Ctrl — a touch must never be filtered out.
      const touch = { type: "touchstart", ctrlKey: false, metaKey: false };
      expect(zoomFilter(touch)).toBe(true);
      expect(zoomFilter({ ...touch, metaKey: true })).toBe(true);
      expect(zoomFilter({ ...touch, ctrlKey: true })).toBe(false);
    });
});
