"use client";

import Link from "next/link";
import { Fragment, type MouseEvent, type RefObject } from "react";

import { areaNodeId, projectNodeId } from "@/data/map";
import { areas, getProjectsByArea, type AreaId, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

/** Live pill elements keyed by map node id. The map positions them each frame. */
export type PillRegistry = Map<string, HTMLElement>;

type Props = {
  selectedArea: AreaId | null;
  pills: RefObject<PillRegistry>;
  onSelectArea: (area: AreaId, pill: HTMLElement) => void;
  onOpenProject: (project: Project, pill: HTMLElement) => void;
};

const PILL =
  "pointer-events-auto absolute top-0 left-0 inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/85 px-2.5 text-xs font-medium text-foreground shadow-xs backdrop-blur-sm transition-colors outline-none select-none hover:border-foreground/40 hover:bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * The labels of the map, as real controls. Areas are buttons that focus
 * their cluster; the selected area's projects are links to their case
 * studies that open the preview on a plain click. DOM order is area → its
 * projects → next area, so Tab walks the map cluster by cluster.
 *
 * Nothing here knows about positions: the map writes `style.transform`
 * onto the registered elements directly, outside React.
 */
export function MapOverlay({ selectedArea, pills, onSelectArea, onOpenProject }: Props) {
  const register = (id: string) => (element: HTMLElement | null) => {
    if (!element) return;
    pills.current.set(id, element);
    return () => {
      pills.current.delete(id);
    };
  };

  return (
    <>
      {Object.values(areas).map((area) => {
        const selected = selectedArea === area.id;
        return (
          <Fragment key={area.id}>
            <button
              type="button"
              ref={register(areaNodeId(area.id))}
              aria-expanded={selected}
              className={cn(PILL, selected && "border-foreground/50 bg-background")}
              onClick={(event) => onSelectArea(area.id, event.currentTarget)}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: `var(--map-area-${area.id})` }}
              />
              {area.label}
            </button>
            {selected &&
              getProjectsByArea(area.id).map((project) => (
                <Link
                  key={project.slug}
                  ref={register(projectNodeId(project.slug))}
                  href={`/projects/${project.slug}`}
                  className={cn(PILL, "animate-map-pill-in motion-reduce:animate-none")}
                  onClick={(event) => {
                    // A plain click (which is also what Enter on the focused link
                    // dispatches) opens the preview. Modified and middle clicks are
                    // left to the browser so "open in new tab" keeps working.
                    if (!isPlainLeftClick(event)) return;
                    event.preventDefault();
                    onOpenProject(project, event.currentTarget);
                  }}
                >
                  {project.title}
                </Link>
              ))}
          </Fragment>
        );
      })}
    </>
  );
}
