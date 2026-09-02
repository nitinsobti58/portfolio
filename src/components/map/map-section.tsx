"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

/** The map's box; the placeholder reserves the same space so the page does not shift while the chunk loads. */
const MAP_CLASS = "h-[min(70vh,720px)] min-h-[480px] w-full";

/**
 * The map and everything it pulls in (d3-zoom, d3-force, the preview sheet)
 * live in their own chunk, requested only once a wide viewport asks for it.
 * Below the breakpoint the module is never fetched, so no simulation,
 * particle, or frame-loop code can run there.
 */
const PortfolioMap = dynamic(() => import("./portfolio-map").then((m) => m.PortfolioMap), {
  ssr: false,
  loading: () => <div className={MAP_CLASS} aria-hidden />,
});

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/**
 * Mounts the canvas map only at ≥768px. Below that nothing map-related runs
 * or loads; the project list on the page is the mobile experience.
 */
export function MapSection() {
  const isWide = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!isWide) return null;

  return (
    <section aria-label="Portfolio map" className="hidden md:block">
      <PortfolioMap className={MAP_CLASS} />
    </section>
  );
}
