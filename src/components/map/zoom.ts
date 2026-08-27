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
    .constrain((transform) => {
      const c = constrainTransform(transform, bounds(), size(), PAN_MARGIN);
      return c === transform ? transform : toZoomTransform(c);
    })
    .on("zoom", (event: D3ZoomEvent<HTMLElement, unknown>) => {
      onZoom(event.transform, event.sourceEvent != null);
    });
}
