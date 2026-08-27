"use client";

import { useSyncExternalStore } from "react";

import { PortfolioMap } from "./portfolio-map";

const QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/**
 * Mounts the canvas map only at ≥768px. Below that nothing map-related runs;
 * the project grid on the page is the mobile experience.
 */
export function MapSection() {
  const isWide = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!isWide) return null;

  return (
    <section aria-label="Portfolio map" className="hidden md:block">
      <PortfolioMap className="h-[min(70vh,720px)] min-h-[480px] w-full" />
    </section>
  );
}
