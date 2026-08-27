"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { buildMapGraph } from "@/data/map";

import { fitTransform } from "./fit";
import { readPalette, type Palette } from "./palette";
import { drawMap } from "./render";
import { createSimulation, settle, type MapSimulation } from "./simulation";
import type { Size, Transform } from "./types";

type Props = {
  className?: string;
};

/**
 * Canvas 2D map of the portfolio. All per-frame state lives in refs; React
 * only re-renders on theme changes. Phase 2 draws a settled, static graph.
 */
export function PortfolioMap({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<MapSimulation | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const transformRef = useRef<Transform>({ k: 1, x: 0, y: 0 });
  /** Rebuilds the backing store for the current size + DPR and redraws. Set by the mount effect. */
  const resizeRef = useRef<(() => void) | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    simRef.current = settle(createSimulation(buildMapGraph()));
    paletteRef.current = readPalette();

    const draw = () => {
      const sim = simRef.current;
      const palette = paletteRef.current;
      const ctx = canvas.getContext("2d");
      if (!sim || !palette || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMap(ctx, sim, palette, transformRef.current, sizeRef.current);
    };

    // Sizes the canvas for the container and the *current* device pixel ratio.
    // Called on layout changes and on DPR changes (window dragged between screens).
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width, height };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (simRef.current) {
        transformRef.current = fitTransform(simRef.current.nodes, sizeRef.current);
      }
      draw();
    };
    resizeRef.current = resize;
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ResizeObserver does not fire when only devicePixelRatio changes, so
    // watch the matching resolution media query and re-arm it after each change.
    let dprQuery: MediaQueryList | null = null;
    const onDprChange = () => {
      resize();
      watchDpr();
    };
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDprChange);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
    };
    watchDpr();

    return () => {
      observer.disconnect();
      dprQuery?.removeEventListener("change", onDprChange);
      resizeRef.current = null;
      simRef.current?.simulation.stop();
      simRef.current = null;
    };
  }, []);

  // Re-read colors when the theme flips, then rebuild + redraw through the same path.
  useEffect(() => {
    if (!resizeRef.current) return;
    paletteRef.current = readPalette();
    resizeRef.current();
  }, [resolvedTheme]);

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Map of projects grouped by area: trading, data, web, and real estate."
        className="block"
      />
    </div>
  );
}
