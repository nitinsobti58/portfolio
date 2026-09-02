"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

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
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/**
 * Mounts the canvas map only at ≥768px. The section and its sized box are
 * in the server HTML, shown by CSS from 768px up, so the page does not shift
 * when the map appears after hydration. Below 768px the box is display:
 * none and the map is neither mounted nor loaded; the project list on the
 * page is the mobile experience.
 */
export function MapSection() {
  const isWide = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <section aria-label="Portfolio map" className="hidden md:block">
      <div className="h-[min(70vh,720px)] min-h-[480px] w-full">
        {isWide && <PortfolioMap className="h-full w-full" />}
      </div>
    </section>
  );
}
