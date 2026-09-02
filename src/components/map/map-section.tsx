"use client";

import dynamic from "next/dynamic";
import { Component, useSyncExternalStore, type ReactNode } from "react";

/**
 * Tailwind's `md` breakpoint (`--breakpoint-md`: 48rem, 768px at the
 * browser's default font size). The section's `md:block` and the compact
 * project rows key on the same query, and rem in a media query resolves
 * against the same default font size for CSS and for matchMedia, so the CSS
 * and JS gates flip together at any text-size setting. A px value here would
 * not: it would leave an empty box (or a hidden, running map) whenever the
 * default font size is not 16px.
 */
export const MAP_QUERY = "(min-width: 48rem)";

/**
 * The map and everything it pulls in (d3-zoom, d3-force, the preview sheet)
 * live in their own chunk, requested only once a wide viewport asks for it.
 * Below the breakpoint the module is never fetched, so no simulation,
 * particle, or frame-loop code can run there. The box around it already
 * reserves the space, so nothing needs to show while the chunk loads.
 */
const PortfolioMap = dynamic(() => import("./portfolio-map").then((m) => m.PortfolioMap), {
  ssr: false,
  loading: () => null,
});

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MAP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(MAP_QUERY).matches;
const getServerSnapshot = () => false;

type BoundaryState = { failed: boolean };

/**
 * If the map chunk cannot load (a stale deploy after a window crosses the
 * breakpoint, a blocked request) or the map throws while rendering, the
 * section collapses and the page is its semantic HTML, as §7 of the spec
 * asks, instead of Next's route-level error screen replacing everything.
 * One discrete failure flag; React.lazy caches the rejection, so there is
 * nothing to retry short of a reload.
 */
export class MapErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Mounts the canvas map only from the `md` breakpoint up. The section and
 * its sized box are in the server HTML, shown by CSS from that breakpoint,
 * so the page does not shift when the map appears after hydration; below it
 * the box is display: none and the map is neither mounted nor loaded. The
 * project list on the page is the mobile experience — and the whole page
 * when scripts do not run, since the empty box collapses under noscript.
 */
export function MapSection() {
  const isWide = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <section data-map-section aria-label="Portfolio map" className="hidden md:block">
      <noscript>
        <style>{"[data-map-section]{display:none}"}</style>
      </noscript>
      <MapErrorBoundary>
        <div className="h-[min(70vh,720px)] min-h-[480px] w-full">
          {isWide && <PortfolioMap className="h-full w-full" />}
        </div>
      </MapErrorBoundary>
    </section>
  );
}
