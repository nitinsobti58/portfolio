"use client";

// Side-effect import: patches `selection.transition()` onto d3-selection.
import "d3-transition";

import { select } from "d3-selection";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { ProjectPreview } from "@/components/projects/project-preview";
import { buttonVariants } from "@/components/ui/button";
import { areaNodeId, buildMapGraph, projectNodeId, projectSlugOf } from "@/data/map";
import { areas, getProject, type AreaId, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

import {
  boundsOf,
  constrainTransform,
  drawnRadius,
  fitTransform,
  focusTransform,
  sameTransform,
} from "./fit";
import { hitTest } from "./hit";
import { MapOverlay, type PillRegistry } from "./map-overlay";
import { readPalette } from "./palette";
import { drawMap, LABEL_GAP } from "./render";
import { createSimulation, settle } from "./simulation";
import type { SimNode, Size, Transform } from "./types";
import { createMapZoom, FLY_DURATION, PAN_MARGIN, toZoomTransform } from "./zoom";

type Props = {
  className?: string;
};

/** How far (px) a pill's anchor may sit outside the map before the pill is hidden. */
const PILL_SLACK = 40;

/** Imperative handles created by the mount effect; null before mount and after unmount. */
type MapControls = {
  focusArea: (area: AreaId) => void;
  fitView: () => void;
  syncPills: () => void;
};

/**
 * Canvas 2D map of the portfolio with d3-zoom pan/zoom, click-to-focus
 * areas, and a DOM overlay of pills that double as the labels and the
 * keyboard path. All per-frame state (positions, the zoom transform, the
 * palette) lives inside the mount effect; React only re-renders on the
 * discrete `selectedArea` / preview changes.
 */
export function PortfolioMap({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const pillsRef = useRef<PillRegistry>(new Map());
  const controlsRef = useRef<MapControls | null>(null);
  /** The pill that opened the preview; the sheet hands focus back to it on close. */
  const openerRef = useRef<HTMLElement | null>(null);

  const [selectedArea, setSelectedArea] = useState<AreaId | null>(null);
  const [previewProject, setPreviewProject] = useState<Project | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  /**
   * Keyboard focus may sit on a project pill that is about to unmount or on
   * the Reset button that is about to hide. Park it on an area pill first so
   * it never falls back to <body>.
   */
  const parkFocus = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const onProjectPill = active.tagName === "A" && overlayRef.current?.contains(active);
    if (!onProjectPill && active !== resetRef.current) return;
    const area = selectedArea ?? Object.values(areas)[0].id;
    pillsRef.current.get(areaNodeId(area))?.focus({ preventScroll: true });
  };

  const activateArea = (area: AreaId) => {
    if (selectedArea === area) {
      parkFocus();
      setSelectedArea(null);
      controlsRef.current?.fitView();
      return;
    }
    setSelectedArea(area);
    controlsRef.current?.focusArea(area);
  };

  const openPreview = (project: Project, opener: HTMLElement | null) => {
    openerRef.current = opener;
    if (selectedArea !== project.area) setSelectedArea(project.area);
    setPreviewProject(project);
    setPreviewOpen(true);
  };

  const resetView = () => {
    parkFocus();
    setSelectedArea(null);
    controlsRef.current?.fitView();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    resetView();
  };

  // Effect events read the latest state from listeners registered once on mount.
  const onCanvasClick = useEffectEvent((node: SimNode | null) => {
    if (!node || node.type === "self") {
      if (selectedArea) {
        parkFocus();
        setSelectedArea(null);
      }
      return;
    }
    if (node.type === "area") {
      if (node.area) activateArea(node.area);
      return;
    }
    const slug = projectSlugOf(node.id);
    const project = slug ? getProject(slug) : undefined;
    if (project) openPreview(project, pillsRef.current.get(node.id) ?? null);
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!container || !canvas || !overlay) return;

    const sim = settle(createSimulation(buildMapGraph()));
    const nodeById = new Map(sim.nodes.map((n) => [n.id, n]));
    const bounds = boundsOf(sim.nodes);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let palette = readPalette();
    let size: Size = { width: 0, height: 0 };
    /** Mirror of the transform d3-zoom holds on the container. Only `onZoom` writes it. */
    let transform: Transform = { k: 1, x: 0, y: 0 };
    let fit: Transform = transform;
    /** True once the user has panned, zoomed, or focused an area; resize then keeps their view. */
    let interacted = false;
    /**
     * True while a transform we initiated is in flight. d3-zoom reuses a
     * still-open wheel gesture (and its sourceEvent) for programmatic
     * transforms, so `sourceEvent` alone cannot tell a fly-to from input.
     */
    let programmatic = false;
    let flight = 0;
    let frame = 0;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMap(ctx, sim, palette, transform, size);
    };

    // Positions every registered pill under its node, in screen space, by
    // mutating the DOM directly. Pills keep a constant size at any zoom.
    // Pills that land outside the map are hidden, which also drops them from
    // the tab order so keyboard users are never focused on something unseen.
    const syncPills = () => {
      const t = transform;
      for (const [id, element] of pillsRef.current) {
        const node = nodeById.get(id);
        if (!node || node.x == null || node.y == null) continue;
        const sx = Math.round(node.x * t.k + t.x);
        const sy = Math.round(node.y * t.k + t.y + drawnRadius(node) * t.k + LABEL_GAP);
        element.style.transform = `translate(${sx}px, ${sy}px) translateX(-50%)`;
        const onScreen =
          sx > -PILL_SLACK && sx < size.width + PILL_SLACK && sy > -PILL_SLACK && sy < size.height;
        element.style.visibility = onScreen ? "" : "hidden";
      }
      overlay.style.visibility = "visible";
      if (resetRef.current) resetRef.current.hidden = sameTransform(t, fit);
    };

    const render = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      draw();
      syncPills();
    };

    // Gestures can fire many zoom events per frame; coalesce them into one paint.
    const scheduleFrame = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
        syncPills();
      });
    };

    const zoom = createMapZoom({
      bounds: () => bounds,
      size: () => size,
      onZoom: (next, gesture) => {
        transform = next;
        if (gesture && !programmatic) interacted = true;
        scheduleFrame();
      },
    });
    // The behavior lives on the container so wheel and drag over a pill still
    // pan and zoom. Double-click zoom is off: it fought with click-to-focus.
    const selection = select<HTMLElement, unknown>(container)
      .call(zoom)
      .on("dblclick.zoom", null);

    const setTransform = (target: Transform, animate: boolean) => {
      const next = toZoomTransform(target);
      const id = ++flight;
      programmatic = true;
      if (animate && !reduceMotion.matches) {
        selection
          .transition()
          .duration(FLY_DURATION)
          .on("end interrupt", () => {
            if (id === flight) programmatic = false;
          })
          .call(zoom.transform, next);
      } else {
        selection.call(zoom.transform, next);
        programmatic = false;
      }
    };

    const focusArea = (area: AreaId) => {
      interacted = true;
      setTransform(focusTransform(sim.nodes, area, size), true);
    };

    const fitView = () => {
      interacted = false;
      if (!sameTransform(transform, fit)) setTransform(fit, true);
    };

    // Sizes the backing store for the container and the *current* device pixel
    // ratio. Runs on layout changes and on DPR changes (window moved between
    // screens). Re-fits only while the user has not taken over the view.
    const resize = () => {
      const rect = container.getBoundingClientRect();
      size = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      fit = fitTransform(sim.nodes, size);
      if (!interacted) {
        setTransform(fit, false);
      } else {
        // Keep the user's view, but a smaller viewport must not strand the graph off-screen.
        const constrained = constrainTransform(transform, bounds, size, PAN_MARGIN);
        if (constrained !== transform) setTransform(constrained, false);
      }
      render();
    };

    controlsRef.current = { focusArea, fitView, syncPills };
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

    // next-themes flips the `dark` class on <html>; the palette is re-read once
    // per flip, after the DOM has actually changed, and only the canvas repaints.
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      render();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const onClick = (event: MouseEvent) => {
      onCanvasClick(hitTest(sim.nodes, transform, event.offsetX, event.offsetY));
    };
    const onPointerMove = (event: PointerEvent) => {
      const hit = hitTest(sim.nodes, transform, event.offsetX, event.offsetY);
      canvas.style.cursor = hit && hit.type !== "self" ? "pointer" : "";
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("pointermove", onPointerMove);

    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("pointermove", onPointerMove);
      themeObserver.disconnect();
      observer.disconnect();
      dprQuery?.removeEventListener("change", onDprChange);
      if (frame) cancelAnimationFrame(frame);
      selection.interrupt().on(".zoom", null);
      controlsRef.current = null;
      sim.simulation.stop();
    };
  }, []);

  // Newly rendered pills (an area's projects) need positions before paint.
  useLayoutEffect(() => {
    controlsRef.current?.syncPills();
  }, [selectedArea]);

  return (
    <div
      ref={containerRef}
      // overflow-clip (not hidden): a clipped box is not a scroll container, so
      // focusing a pill near the edge cannot scroll the canvas out from under the map.
      className={cn("relative touch-none overflow-clip", className)}
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Map of projects grouped by area: trading, data, web, and real estate. Drag to pan, scroll to zoom."
        className="block cursor-grab active:cursor-grabbing"
      />
      <div ref={overlayRef} className="pointer-events-none invisible absolute inset-0">
        <MapOverlay
          selectedArea={selectedArea}
          pills={pillsRef}
          onSelectArea={activateArea}
          onOpenProject={openPreview}
        />
      </div>
      <button
        ref={resetRef}
        type="button"
        hidden
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "absolute top-3 right-3")}
        onClick={resetView}
      >
        Reset view
      </button>
      <ProjectPreview
        project={previewProject}
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) setPreviewOpen(false);
        }}
        onClosed={() => setPreviewProject(null)}
        finalFocus={() =>
          openerRef.current ??
          (previewProject ? pillsRef.current.get(projectNodeId(previewProject.slug)) : null) ??
          true
        }
      />
    </div>
  );
}
