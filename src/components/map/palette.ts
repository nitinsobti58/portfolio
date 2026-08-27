import type { AreaId } from "@/data/projects";

export type Palette = {
  link: string;
  self: string;
  label: string;
  labelMuted: string;
  fontFamily: string;
  area: Record<AreaId, string>;
};

const AREA_IDS: AreaId[] = ["trading", "data", "web", "realestate"];

/**
 * Reads the map colors from CSS custom properties. Call once per theme
 * change and cache the result; never call inside a frame loop.
 */
export function readPalette(el: HTMLElement = document.documentElement): Palette {
  const styles = getComputedStyle(el);
  const v = (name: string) => styles.getPropertyValue(name).trim();

  const area = {} as Record<AreaId, string>;
  for (const id of AREA_IDS) area[id] = v(`--map-area-${id}`);

  return {
    link: v("--map-link"),
    self: v("--map-self"),
    label: v("--map-label"),
    labelMuted: v("--map-label-muted"),
    fontFamily: styles.fontFamily || "sans-serif",
    area,
  };
}
