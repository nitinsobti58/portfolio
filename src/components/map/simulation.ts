import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";

import { SELF_ID, type MapGraph } from "@/data/map";

import type { SimLink, SimNode } from "./types";

/** Ring radius (world units) the area nodes settle onto around the center. */
export const AREA_RING_RADIUS = 210;

/** Projects are nudged just outside the area ring so clusters read outward. */
export const PROJECT_RING_RADIUS = AREA_RING_RADIUS + 70;

const RING_STRENGTH = { self: 0, area: 0.6, project: 0.12 } as const;

export const SETTLE_TICKS = 300;

/** Repulsion per node type. Projects are kept light so they hug their area. */
const CHARGE = { self: -320, area: -220, project: -50 } as const;

/** Rest length per link kind, in world units. */
const DISTANCE = {
  selfToArea: AREA_RING_RADIUS,
  areaToProject: 78,
  crossLink: 240,
} as const;

function linkDistance(link: SimLink) {
  const s = link.source as SimNode;
  const t = link.target as SimNode;
  if (s.type === "self" || t.type === "self") return DISTANCE.selfToArea;
  // Primary area→project links are strong; cross-links are weak (see data/map.ts).
  return link.strength >= 0.5 ? DISTANCE.areaToProject : DISTANCE.crossLink;
}

export type MapSimulation = {
  simulation: Simulation<SimNode, SimLink>;
  nodes: SimNode[];
  links: SimLink[];
};

/**
 * Seeds starting positions so the graph begins close to its resting shape:
 * center pinned at the origin, areas spread evenly on a ring, projects
 * scattered just outside their area. Together with the synchronous settle
 * this is what keeps the map from visibly "exploding" on first paint.
 */
function seedPositions(nodes: SimNode[]) {
  const areaNodes = nodes.filter((n) => n.type === "area");
  const angleById = new Map<string, number>();

  areaNodes.forEach((node, i) => {
    const angle = (i / areaNodes.length) * Math.PI * 2 - Math.PI / 2;
    angleById.set(node.id, angle);
    node.x = Math.cos(angle) * AREA_RING_RADIUS;
    node.y = Math.sin(angle) * AREA_RING_RADIUS;
  });

  const projectIndexByArea = new Map<string, number>();
  for (const node of nodes) {
    if (node.type === "self") {
      node.x = 0;
      node.y = 0;
      node.fx = 0;
      node.fy = 0;
    } else if (node.type === "project" && node.area) {
      const areaId = `area:${node.area}`;
      const base = angleById.get(areaId) ?? 0;
      const i = projectIndexByArea.get(areaId) ?? 0;
      projectIndexByArea.set(areaId, i + 1);
      const spread = (i - 1) * 0.35;
      const r = AREA_RING_RADIUS + 90;
      node.x = Math.cos(base + spread) * r;
      node.y = Math.sin(base + spread) * r;
    }
  }
}

export function createSimulation(graph: MapGraph): MapSimulation {
  // d3-force mutates its inputs, so work on copies and leave the data file pure.
  const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  const links: SimLink[] = graph.links.map((l) => ({ ...l }));

  seedPositions(nodes);

  const simulation = forceSimulation<SimNode, SimLink>(nodes)
    .force("charge", forceManyBody<SimNode>().strength((d) => CHARGE[d.type]))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => linkDistance(l))
        .strength((l) => l.strength),
    )
    .force(
      "ring",
      forceRadial<SimNode>(
        (d) => (d.type === "project" ? PROJECT_RING_RADIUS : AREA_RING_RADIUS),
        0,
        0,
      ).strength((d) => RING_STRENGTH[d.type]),
    )
    .force("x", forceX<SimNode>(0).strength(0.02))
    .force("y", forceY<SimNode>(0).strength(0.02))
    .force("collide", forceCollide<SimNode>((d) => d.radius + 8).iterations(2))
    .stop();

  return { simulation, nodes, links };
}

/** Runs the simulation synchronously to a resting state. Call before first paint. */
export function settle(sim: MapSimulation, ticks = SETTLE_TICKS) {
  sim.simulation.alpha(1).tick(ticks);
  // Leave the simulation cold; ambient motion later comes from particles, not forces.
  sim.simulation.alpha(0).alphaTarget(0);
  return sim;
}

export function centerOf(id: string, nodes: SimNode[]) {
  return nodes.find((n) => n.id === id) ?? nodes.find((n) => n.id === SELF_ID);
}
