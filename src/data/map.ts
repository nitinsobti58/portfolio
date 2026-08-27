import { areas, projects, type AreaId } from "@/data/projects";

export type NodeType = "self" | "area" | "project";

export type MapNode = {
  id: string;
  type: NodeType;
  label: string;
  /** Required for type === "project". */
  area?: AreaId;
  /** Required for type === "project". */
  href?: string;
  /** Collision + draw radius, in world units. */
  radius: number;
};

export type MapLink = {
  source: string;
  target: string;
  /** 0..1. Higher pulls the pair closer. */
  strength: number;
};

export type MapGraph = {
  nodes: MapNode[];
  links: MapLink[];
};

export const SELF_ID = "self";

export const areaNodeId = (area: AreaId) => `area:${area}`;
export const projectNodeId = (slug: string) => `project:${slug}`;

const RADIUS = {
  self: 34,
  area: 26,
  project: 12,
} as const;

/**
 * Builds the map graph from the project data so the two never drift.
 * Shape: one center node → one node per area → one node per project,
 * plus weaker cross-links from projects to their related areas.
 */
export function buildMapGraph(): MapGraph {
  const nodes: MapNode[] = [
    { id: SELF_ID, type: "self", label: "Nitin Sobti", radius: RADIUS.self },
  ];
  const links: MapLink[] = [];

  for (const area of Object.values(areas)) {
    nodes.push({
      id: areaNodeId(area.id),
      type: "area",
      label: area.label,
      area: area.id,
      radius: RADIUS.area,
    });
    links.push({ source: SELF_ID, target: areaNodeId(area.id), strength: 1 });
  }

  for (const project of projects) {
    const id = projectNodeId(project.slug);
    nodes.push({
      id,
      type: "project",
      label: project.title,
      area: project.area,
      href: `/projects/${project.slug}`,
      radius: RADIUS.project,
    });
    links.push({ source: areaNodeId(project.area), target: id, strength: 0.9 });
    for (const related of project.relatedAreas ?? []) {
      links.push({ source: areaNodeId(related), target: id, strength: 0.08 });
    }
  }

  return { nodes, links };
}
