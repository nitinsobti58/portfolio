import { describe, expect, it } from "vitest";

import { buildMapGraph, SELF_ID } from "@/data/map";

import { createSimulation, settle } from "../simulation";

describe("map simulation", () => {
  it("settles every node to a finite position", () => {
    const sim = settle(createSimulation(buildMapGraph()));
    for (const node of sim.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("keeps the center node pinned at the origin", () => {
    const sim = settle(createSimulation(buildMapGraph()));
    const self = sim.nodes.find((n) => n.id === SELF_ID)!;
    expect(self.x).toBe(0);
    expect(self.y).toBe(0);
  });

  it("does not leave nodes overlapping", () => {
    const sim = settle(createSimulation(buildMapGraph()));
    for (let i = 0; i < sim.nodes.length; i++) {
      for (let j = i + 1; j < sim.nodes.length; j++) {
        const a = sim.nodes[i];
        const b = sim.nodes[j];
        const d = Math.hypot(a.x! - b.x!, a.y! - b.y!);
        // Collision radius is radius + 8 each; allow a small tolerance.
        expect(d).toBeGreaterThan(a.radius + b.radius + 8);
      }
    }
  });

  it("places each project nearer its own area than any other", () => {
    const sim = settle(createSimulation(buildMapGraph()));
    const areas = sim.nodes.filter((n) => n.type === "area");
    for (const project of sim.nodes.filter((n) => n.type === "project")) {
      const own = areas.find((a) => a.area === project.area)!;
      const dOwn = Math.hypot(project.x! - own.x!, project.y! - own.y!);
      for (const other of areas) {
        if (other === own) continue;
        const dOther = Math.hypot(project.x! - other.x!, project.y! - other.y!);
        expect(dOwn).toBeLessThan(dOther);
      }
    }
  });

  it("is cold after settling so nothing keeps moving", () => {
    const sim = settle(createSimulation(buildMapGraph()));
    expect(sim.simulation.alpha()).toBe(0);
  });

  it("does not mutate the source graph", () => {
    const graph = buildMapGraph();
    settle(createSimulation(graph));
    expect("x" in graph.nodes[0]).toBe(false);
    expect(typeof graph.links[0].source).toBe("string");
  });
});
