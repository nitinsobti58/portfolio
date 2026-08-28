"use client";

// Side-effect import: patches `selection.transition()` onto d3-selection.
import "d3-transition";

import { Minus, Plus } from "lucide-react";
import { select, type Selection } from "d3-selection";
import type { Transition } from "d3-transition";
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
  panToReveal,
  sameTransform,
} from "./fit";
import { hitTest } from "./hit";
import { placeLabels, type LabelSpec, type Obstacle } from "./labels";
import { MapOverlay, type PillRegistry } from "./map-overlay";
import {
  centerOn,
  drawMinimap,
  MINIMAP_SIZE,
  minimapToWorld,
  minimapTransform,
  viewportRect,
} from "./minimap";
import { readPalette } from "./palette";
import { drawMap, LABEL_GAP } from "./render";
import { createSimulation, settle } from "./simulation";
import type { Rect, SimNode, Size, Transform } from "./types";
import {
  createMapZoom,
  FLY_DURATION,
  PAN_MARGIN,
  SCALE_EXTENT,
  toZoomTransform,
  ZOOM_STEP,
} from "./zoom";

type Props = {
  className?: string;
};

/** Screen pixels kept between a revealed pill (and its node) and the map edge. */
const REVEAL_MARGIN = 24;

/** How long the cooperative-gesture hint stays up after the last plain wheel event. */
const HINT_MS = 1200;

/** Why a pill is currently hidden. Off-screen pills leave the tab order; Tab brings them back into view. */
type HiddenReason = "offscreen" | "collision";

/** Imperative handles created by the mount effect; null before mount and after unmount. */
type MapControls = {
  focusArea: (area: AreaId) => void;
  fitView: () => void;
  syncPills: () => void;
  zoomBy: (factor: number) => void;
  /**
   * Makes a hidden pill visible so it can take focus. Returns true when the
   * map is panning to it and will focus it itself; false when the caller
   * should let the browser move focus normally.
   */
  revealPill: (pill: HTMLElement) => boolean;
};

type ZoomTarget =
  | Selection<HTMLElement, unknown, null, undefined>
  | Transition<HTMLElement, unknown, null, undefined>;

/**
 * Canvas 2D map of the portfolio with d3-zoom pan/zoom, click-to-focus
 * areas, a minimap, and a DOM overlay of pills that double as the labels and
 * the keyboard path. All per-frame state (positions, the zoom transform, the
 * palette) lives inside the mount effect; React only re-renders on the
 * discrete `selectedArea` / preview changes.
 */
export function PortfolioMap({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);
  const zoomInRef = useRef<HTMLButtonElement>(null);
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

  const zoomBy = (factor: number, button: HTMLButtonElement) => {
    if (button.getAttribute("aria-disabled") === "true") return;
    controlsRef.current?.zoomBy(factor);
  };

  /** The pill Tab would move to next, in the overlay's DOM order (area → its projects → next area). */
  const adjacentPill = (active: HTMLElement, backwards: boolean): HTMLElement | null => {
    const pills = Array.from(overlayRef.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
    const index = pills.indexOf(active);
    if (index >= 0) return pills[backwards ? index - 1 : index + 1] ?? null;
    // Shift+Tab from the first control button walks back into the overlay.
    if (backwards && active === zoomOutRef.current) return pills[pills.length - 1] ?? null;
    return null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The preview sheet is portaled, but React still bubbles its keys here; it manages its own.
    const target = event.target;
    if (!(target instanceof HTMLElement) || !containerRef.current?.contains(target)) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      resetView();
      return;
    }
    if (event.key !== "Tab") return;
    // Off-screen pills are hidden and would be skipped: pan them into view first.
    const next = adjacentPill(target, event.shiftKey);
    if (next && controlsRef.current?.revealPill(next)) event.preventDefault();
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
    const minimap = minimapRef.current;
    const overlay = overlayRef.current;
    if (!container || !canvas || !minimap || !overlay) return;

    const sim = settle(createSimulation(buildMapGraph()));
    const nodeById = new Map(sim.nodes.map((n) => [n.id, n]));
    const bounds = boundsOf(sim.nodes);
    // The graph is static, so the world → minimap mapping is fixed for the map's lifetime.
    const minimapView = minimapTransform(bounds);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let palette = readPalette();
    let size: Size = { width: 0, height: 0 };
    let minimapShown = true;
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
    /** Per-pill results of the last sync, for the Tab-reveal path. */
    const hiddenReason = new Map<HTMLElement, HiddenReason>();
    const revealRects = new Map<HTMLElement, Rect>();

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMap(ctx, sim, palette, transform, size);
      if (!minimapShown) return;
      const mctx = minimap.getContext("2d");
      if (!mctx) return;
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMinimap(mctx, sim.nodes, palette, minimapView, viewportRect(transform, size, minimapView));
    };

    const setAria = (element: HTMLElement | null, name: string, value: string) => {
      if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
    };

    // Positions every registered pill in screen space by mutating the DOM
    // directly. Pills keep a constant size at any zoom. Labels that would
    // cover each other or a node are flipped above their node or hidden
    // (labels.ts); pills that land outside the map are hidden, which also
    // drops them from the tab order so keyboard users are never focused on
    // something unseen. The focused pill is never hidden: that would blur it
    // to <body>.
    const syncPills = () => {
      const t = transform;
      const active = document.activeElement;

      // Read phase: measure every pill before any style is written.
      const specs: LabelSpec[] = [];
      const elements: HTMLElement[] = [];
      for (const [id, element] of pillsRef.current) {
        const node = nodeById.get(id);
        if (!node || node.x == null || node.y == null || node.type === "self") continue;
        specs.push({
          id,
          kind: node.type,
          x: node.x * t.k + t.x,
          y: node.y * t.k + t.y,
          offset: drawnRadius(node) * t.k + LABEL_GAP,
          width: element.offsetWidth,
          height: element.offsetHeight,
          pinned: element === active,
        });
        elements.push(element);
      }
      const obstacles: Obstacle[] = [];
      for (const node of sim.nodes) {
        if (node.x == null || node.y == null) continue;
        obstacles.push({
          id: node.id,
          x: node.x * t.k + t.x,
          y: node.y * t.k + t.y,
          r: drawnRadius(node) * t.k,
        });
      }
      const placed = placeLabels(specs, obstacles);

      // Write phase.
      hiddenReason.clear();
      revealRects.clear();
      placed.forEach((p, i) => {
        const element = elements[i];
        const spec = specs[i];
        element.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
        const cx = p.x + spec.width / 2;
        const cy = p.y + spec.height / 2;
        const onScreen = cx >= 0 && cx <= size.width && cy >= 0 && cy <= size.height;
        let reason: HiddenReason | null = null;
        if (!onScreen && !spec.pinned) reason = "offscreen";
        else if (!p.visible) reason = "collision";
        element.style.visibility = reason ? "hidden" : "";
        if (reason) hiddenReason.set(element, reason);
        // What a Tab-reveal pan must bring into view: the node disc plus its pill.
        const r = spec.offset - LABEL_GAP;
        const left = Math.min(p.x, spec.x - r);
        const top = Math.min(p.y, spec.y - r);
        revealRects.set(element, {
          x: left,
          y: top,
          width: Math.max(p.x + spec.width, spec.x + r) - left,
          height: Math.max(p.y + spec.height, spec.y + r) - top,
        });
      });
      overlay.style.visibility = "visible";
      if (resetRef.current) resetRef.current.hidden = sameTransform(t, fit);
      setAria(zoomInRef.current, "aria-disabled", String(t.k >= SCALE_EXTENT[1] - 1e-3));
      setAria(zoomOutRef.current, "aria-disabled", String(t.k <= SCALE_EXTENT[0] + 1e-3));
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

    /**
     * Runs a zoom operation, animated as a d3 transition unless motion is
     * reduced. `done` fires once the target transform is in place (not when
     * user input interrupts the flight).
     */
    const fly = (
      animate: boolean,
      run: (target: ZoomTarget) => void,
      done?: () => void,
      duration = FLY_DURATION,
    ) => {
      const id = ++flight;
      programmatic = true;
      if (animate && !reduceMotion.matches) {
        run(
          selection
            .transition()
            .duration(duration)
            .on("end", () => {
              if (id === flight) programmatic = false;
              done?.();
            })
            .on("interrupt", () => {
              if (id === flight) programmatic = false;
            }),
        );
      } else {
        run(selection);
        programmatic = false;
        done?.();
      }
    };

    const setTransform = (target: Transform, animate: boolean, done?: () => void) => {
      fly(animate, (s) => zoom.transform(s, toZoomTransform(target)), done);
    };

    const focusArea = (area: AreaId) => {
      interacted = true;
      setTransform(focusTransform(sim.nodes, area, size), true);
    };

    const fitView = () => {
      interacted = false;
      if (!sameTransform(transform, fit)) setTransform(fit, true);
    };

    // Zoom in / out about the viewport center. d3's scaleBy clamps to the
    // scale extent and runs the pan constraint, unlike a raw zoom.transform.
    const zoomBy = (factor: number) => {
      interacted = true;
      fly(true, (s) => zoom.scaleBy(s, factor), undefined, FLY_DURATION / 2);
    };

    const revealPill = (pill: HTMLElement) => {
      const reason = hiddenReason.get(pill);
      if (!reason) return false;
      if (reason === "collision") {
        // On screen but yielding to another label: show it and let the browser
        // focus it; the next sync keeps it visible while it has focus.
        pill.style.visibility = "";
        return false;
      }
      const rect = revealRects.get(pill);
      if (!rect) return false;
      const target = constrainTransform(
        panToReveal(transform, rect, size, REVEAL_MARGIN),
        bounds,
        size,
        PAN_MARGIN,
      );
      interacted = true;
      setTransform(target, true, () => {
        render();
        pill.focus({ preventScroll: true });
      });
      return true;
    };

    // Sizes the backing stores for the container and the *current* device
    // pixel ratio. Runs on layout changes and on DPR changes (window moved
    // between screens). Re-fits only while the user has not taken over the view.
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
      minimap.width = Math.round(MINIMAP_SIZE.width * dpr);
      minimap.height = Math.round(MINIMAP_SIZE.height * dpr);
      minimap.style.width = `${MINIMAP_SIZE.width}px`;
      minimap.style.height = `${MINIMAP_SIZE.height}px`;
      // Hidden by the container query on narrow maps; skip its redraws then.
      minimapShown = minimap.offsetWidth > 0;
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

    controlsRef.current = { focusArea, fitView, syncPills, zoomBy, revealPill };
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
    // per flip, after the DOM has actually changed, and only the canvases repaint.
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

    // Focus changes can pin or release a label; re-run the placement so a
    // pill that only shows while focused hides again once focus moves on.
    const onFocusChange = () => syncPills();
    overlay.addEventListener("focusin", onFocusChange);
    overlay.addEventListener("focusout", onFocusChange);

    // Minimap: press or drag recenters the view on the point under the
    // pointer, through zoom.transform so the container's __zoom stays the
    // single source of truth. The pointerdown is cancelled so no compatibility
    // mousedown reaches d3-zoom on the container (it would start a pan).
    let scrubbing = false;
    const recenter = (event: PointerEvent) => {
      const box = minimap.getBoundingClientRect();
      const w = minimapToWorld(minimapView, event.clientX - box.left, event.clientY - box.top);
      const target = constrainTransform(centerOn(transform, size, w.x, w.y), bounds, size, PAN_MARGIN);
      interacted = true;
      setTransform(target, false);
    };
    const onMinimapDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      scrubbing = true;
      recenter(event);
      try {
        minimap.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone (or synthetic); the press alone still recentered.
      }
    };
    const onMinimapMove = (event: PointerEvent) => {
      if (scrubbing) recenter(event);
    };
    const onMinimapUp = () => {
      scrubbing = false;
    };
    const swallow = (event: Event) => event.stopPropagation();
    minimap.addEventListener("pointerdown", onMinimapDown);
    minimap.addEventListener("pointermove", onMinimapMove);
    minimap.addEventListener("pointerup", onMinimapUp);
    minimap.addEventListener("pointercancel", onMinimapUp);
    minimap.addEventListener("touchstart", swallow, { passive: true });

    // Cooperative gestures: a plain wheel scrolls the page (the zoom filter
    // lets it through); show how to zoom instead, briefly.
    const hint = hintRef.current;
    if (hint) {
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      hint.textContent = `Use ${mac ? "⌘" : "Ctrl"} + scroll to zoom`;
    }
    let hintTimer = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || !hint) return;
      hint.setAttribute("data-show", "");
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => hint.removeAttribute("data-show"), HINT_MS);
    };
    container.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      window.clearTimeout(hintTimer);
      container.removeEventListener("wheel", onWheel);
      minimap.removeEventListener("pointerdown", onMinimapDown);
      minimap.removeEventListener("pointermove", onMinimapMove);
      minimap.removeEventListener("pointerup", onMinimapUp);
      minimap.removeEventListener("pointercancel", onMinimapUp);
      minimap.removeEventListener("touchstart", swallow);
      overlay.removeEventListener("focusin", onFocusChange);
      overlay.removeEventListener("focusout", onFocusChange);
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

  const control = cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "aria-disabled:opacity-50");

  return (
    <div
      ref={containerRef}
      // overflow-clip (not hidden): a clipped box is not a scroll container, so
      // focusing a pill near the edge cannot scroll the canvas out from under the map.
      className={cn("relative touch-none overflow-clip @container", className)}
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Map of projects grouped by area: trading, data, web, and real estate. Drag to pan; zoom with the buttons or Ctrl + scroll."
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
      <canvas
        ref={minimapRef}
        aria-hidden
        className="absolute top-3 left-3 hidden cursor-pointer rounded-md border border-border/70 bg-background/80 shadow-xs backdrop-blur-sm @3xl:block"
      />
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <button
          ref={zoomOutRef}
          type="button"
          aria-label="Zoom out"
          className={control}
          onClick={(event) => zoomBy(1 / ZOOM_STEP, event.currentTarget)}
        >
          <Minus />
        </button>
        <button
          ref={zoomInRef}
          type="button"
          aria-label="Zoom in"
          className={control}
          onClick={(event) => zoomBy(ZOOM_STEP, event.currentTarget)}
        >
          <Plus />
        </button>
        <button
          ref={resetRef}
          type="button"
          hidden
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          onClick={resetView}
        >
          Reset view
        </button>
      </div>
      <div
        ref={hintRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-foreground/85 px-3 py-1.5 text-xs font-medium text-background opacity-0 transition-opacity duration-200 data-show:opacity-100"
      >
        Use Ctrl + scroll to zoom
      </div>
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
