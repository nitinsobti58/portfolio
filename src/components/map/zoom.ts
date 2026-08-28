import {
  zoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";

import { constrainTransform, type Bounds } from "./fit";
import type { Size, Transform } from "./types";

export const SCALE_EXTENT: [number, number] = [0.5, 4];

/** Pointer travel (px) below which a mousedown/mouseup pair is still a click. d3 defaults to 0. */
export const CLICK_DISTANCE = 4;

/** Minimum graph bounding-box pixels that must stay inside the viewport while panning. */
export const PAN_MARGIN = 80;

/** Fly-to duration in ms. Under prefers-reduced-motion the transform is applied at once instead. */
export const FLY_DURATION = 600;

/** Scale factor applied by one press of the zoom in / zoom out buttons. */
export const ZOOM_STEP = 1.6;

/** Largest zoom step one wheel event may take, in log2 units (0.5 ≈ 1.41×). */
export const WHEEL_DELTA_MAX = 0.5;

type FilterEvent = { type: string; ctrlKey: boolean; metaKey: boolean; button?: number };

type WheelLike = { deltaY: number; deltaMode: number; ctrlKey: boolean };

/**
 * d3's wheel delta, clamped. d3 multiplies Ctrl + wheel by 10 because a
 * trackpad pinch arrives that way with tiny deltas, but a Ctrl + mouse-wheel
 * notch (deltaY ≈ 100) would then jump from the fit view to the maximum
 * scale in one event. Pinch deltas stay well under the cap.
 */
export function wheelDelta(event: WheelLike) {
  const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
  const delta = -event.deltaY * unit * (event.ctrlKey ? 10 : 1);
  return Math.max(-WHEEL_DELTA_MAX, Math.min(WHEEL_DELTA_MAX, delta));
}

/**
 * Cooperative gestures. The map is one section of a scrolling page, so a
 * plain wheel must keep scrolling the page: only ⌘/Ctrl + wheel zooms (a
 * trackpad pinch also arrives as a wheel event with `ctrlKey` set, so pinch
 * still zooms). Pointer rules are d3's defaults: primary button only, and
 * no Ctrl + click (macOS right-click emulation).
 */
export function zoomFilter(event: FilterEvent) {
  if (event.type === "wheel") return event.ctrlKey || event.metaKey;
  return !event.ctrlKey && !event.button;
}

export type MapZoom = ZoomBehavior<HTMLElement, unknown>;

export type MapZoomOptions = {
  bounds: () => Bounds;
  size: () => Size;
  /** Fires for every transform change, gesture or programmatic. `gesture` is true for user input. */
  onZoom: (transform: ZoomTransform, gesture: boolean) => void;
};

/** Converts our plain transform into d3-zoom's class (same k/x/y semantics). */
export function toZoomTransform(t: Transform): ZoomTransform {
  return zoomIdentity.translate(t.x, t.y).scale(t.k);
}

/**
 * Builds the d3-zoom behavior for the map. The caller attaches it with
 * `select(element).call(zoom)`; from then on the transform d3 stores on the
 * element is the single source of truth and must only change through
 * `zoom.transform`.
 */
export function createMapZoom({ bounds, size, onZoom }: MapZoomOptions): MapZoom {
  return zoom<HTMLElement, unknown>()
    .scaleExtent(SCALE_EXTENT)
    .clickDistance(CLICK_DISTANCE)
    .filter(zoomFilter)
    .wheelDelta(wheelDelta)
    // The viewport we already track, rather than d3's clientWidth/Height
    // read; it decides the center for scaleBy and the fly-to interpolation.
    .extent((): [[number, number], [number, number]] => {
      const s = size();
      return [
        [0, 0],
        [s.width, s.height],
      ];
    })
    .constrain((transform) => {
      const c = constrainTransform(transform, bounds(), size(), PAN_MARGIN);
      return c === transform ? transform : toZoomTransform(c);
    })
    .on("zoom", (event: D3ZoomEvent<HTMLElement, unknown>) => {
      onZoom(event.transform, event.sourceEvent != null);
    });
}
