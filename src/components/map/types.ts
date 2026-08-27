import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";

import type { MapNode } from "@/data/map";

/** A map node once it has been handed to d3-force (gains x/y/vx/vy). */
export type SimNode = MapNode & SimulationNodeDatum;

/** d3-force replaces the string ids with node references after init. */
export type SimLink = SimulationLinkDatum<SimNode> & { strength: number };

/** World → screen: screen = world * k + (x, y). Same shape as d3-zoom's ZoomTransform. */
export type Transform = {
  k: number;
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};
