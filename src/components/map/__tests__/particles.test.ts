import { describe, expect, it } from "vitest";

import { buildMapGraph } from "@/data/map";

import {
  CLAMP_SIGMA,
  createRng,
  DRIFT_AMPLITUDE,
  generateParticles,
  LERP_TAU,
  MAX_PARTICLES,
  OPACITY_RANGE,
  OUTWARD_SHIFT,
  PARTICLES_PER_ANCHOR,
  SIZE_RANGE,
  SPREAD_FACTOR,
  stepParticles,
  TINT_COUNT,
  type ParticleAnchor,
} from "../particles";
import { createSimulation, settle } from "../simulation";

const anchors: ParticleAnchor[] = [
  { x: 0, y: -210, radius: 26, area: "trading" },
  { x: 210, y: 0, radius: 26, area: "data" },
  { x: 0, y: 210, radius: 26, area: "web" },
  { x: -210, y: 0, radius: 26, area: "realestate" },
];

describe("createRng", () => {
  it("is deterministic for a seed and stays in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(createRng(43)()).not.toBe(createRng(42)());
  });
});

describe("generateParticles", () => {
  it("spawns the configured count per anchor, within the total budget", () => {
    const field = generateParticles(anchors);
    expect(field.count).toBe(anchors.length * PARTICLES_PER_ANCHOR);
    expect(field.count).toBeLessThanOrEqual(MAX_PARTICLES);
    for (let i = 0; i < field.count; i++) {
      expect(field.anchor[i]).toBe(Math.floor(i / PARTICLES_PER_ANCHOR));
    }
  });

  it("shrinks the per-anchor count so many anchors never exceed the budget", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...anchors[i % 4], x: i * 100 }));
    const field = generateParticles(many);
    expect(field.count).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(field.count).toBe(12 * Math.floor(MAX_PARTICLES / 12));
    expect(generateParticles([]).count).toBe(0);
  });

  it("is identical for the same seed and different for another", () => {
    const a = generateParticles(anchors, { seed: 7 });
    const b = generateParticles(anchors, { seed: 7 });
    const c = generateParticles(anchors, { seed: 8 });
    expect(Array.from(a.homeX)).toEqual(Array.from(b.homeX));
    expect(Array.from(a.phase)).toEqual(Array.from(b.phase));
    expect(Array.from(a.homeX)).not.toEqual(Array.from(c.homeX));
  });

  it("keeps every cluster inside its clamp radius, leaning away from the origin", () => {
    const field = generateParticles(anchors);
    const clamp = 26 * SPREAD_FACTOR * CLAMP_SIGMA;
    const outward = new Array(anchors.length).fill(0);
    for (let i = 0; i < field.count; i++) {
      const a = anchors[field.anchor[i]];
      const dx = field.homeX[i] - a.x;
      const dy = field.homeY[i] - a.y;
      // The center is shifted outward, so allow that on top of the clamp.
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(clamp + 16 + 1e-3);
      const d = Math.hypot(a.x, a.y);
      outward[field.anchor[i]] += (dx * a.x + dy * a.y) / d;
    }
    for (const sum of outward) expect(sum / PARTICLES_PER_ANCHOR).toBeGreaterThan(8);
  });

  it("places each particle nearer its own anchor than any other", () => {
    const field = generateParticles(anchors);
    for (let i = 0; i < field.count; i++) {
      const own = anchors[field.anchor[i]];
      const dOwn = Math.hypot(field.homeX[i] - own.x, field.homeY[i] - own.y);
      for (const other of anchors) {
        if (other === own) continue;
        expect(dOwn).toBeLessThan(Math.hypot(field.homeX[i] - other.x, field.homeY[i] - other.y));
      }
    }
  });

  it("keeps sizes, opacities, tints, and drift parameters in range", () => {
    const field = generateParticles(anchors);
    let small = 0;
    for (let i = 0; i < field.count; i++) {
      expect(field.size[i]).toBeGreaterThanOrEqual(SIZE_RANGE[0]);
      expect(field.size[i]).toBeLessThanOrEqual(SIZE_RANGE[1]);
      expect(field.opacity[i]).toBeGreaterThanOrEqual(OPACITY_RANGE[0] * 0.75);
      expect(field.opacity[i]).toBeLessThanOrEqual(OPACITY_RANGE[1]);
      expect(field.tint[i]).toBeGreaterThanOrEqual(0);
      expect(field.tint[i]).toBeLessThan(TINT_COUNT);
      expect(field.amplitude[i]).toBeLessThanOrEqual(DRIFT_AMPLITUDE);
      expect(field.amplitude[i]).toBeGreaterThanOrEqual(DRIFT_AMPLITUDE / 2);
      expect(field.speed[i]).toBeGreaterThan(0);
      if (field.size[i] < (SIZE_RANGE[0] + SIZE_RANGE[1]) / 2) small++;
    }
    // Sizes are skewed toward small.
    expect(small / field.count).toBeGreaterThan(0.6);
  });

  it("starts every particle at rest on its drift target, so the first paint is settled", () => {
    const field = generateParticles(anchors);
    const rested = generateParticles(anchors);
    stepParticles(rested, 0, 1000);
    expect(Array.from(field.x)).toEqual(Array.from(rested.x));
    expect(Array.from(field.y)).toEqual(Array.from(rested.y));
    for (let i = 0; i < field.count; i++) {
      expect(Math.abs(field.x[i] - field.homeX[i])).toBeLessThanOrEqual(field.amplitude[i] + 1e-4);
      expect(Math.abs(field.y[i] - field.homeY[i])).toBeLessThanOrEqual(field.amplitude[i] + 1e-4);
    }
  });
});

describe("stepParticles", () => {
  it("does nothing for a zero step", () => {
    const field = generateParticles(anchors);
    const x = Array.from(field.x);
    stepParticles(field, 12.5, 0);
    expect(Array.from(field.x)).toEqual(x);
  });

  it("never drifts further than the amplitude from home", () => {
    const field = generateParticles(anchors);
    let time = 0;
    for (let f = 0; f < 600; f++) {
      time += 1 / 60;
      stepParticles(field, time, 1 / 60);
    }
    for (let i = 0; i < field.count; i++) {
      expect(Math.hypot(field.x[i] - field.homeX[i], field.y[i] - field.homeY[i])).toBeLessThanOrEqual(
        field.amplitude[i] * Math.SQRT2 + 1e-3,
      );
    }
  });

  it("actually moves the particles over time", () => {
    const field = generateParticles(anchors);
    const before = Array.from(field.x);
    stepParticles(field, 3, 3);
    let moved = 0;
    for (let i = 0; i < field.count; i++) if (Math.abs(field.x[i] - before[i]) > 0.1) moved++;
    expect(moved / field.count).toBeGreaterThan(0.5);
  });

  it("lerps a displaced particle back toward its target instead of snapping", () => {
    const field = generateParticles(anchors);
    const target = field.x[0];
    field.x[0] = target + 100;
    stepParticles(field, 0, LERP_TAU);
    // After one time constant the gap has closed by 1 - 1/e.
    expect(field.x[0] - target).toBeCloseTo(100 * Math.exp(-1), 3);
    stepParticles(field, 0, 10);
    expect(field.x[0]).toBeCloseTo(target, 3);
  });
});

describe("stepParticles frame-rate independence", () => {
  it("reaches the same position whether a step is taken at once or in many small pieces", () => {
    // Toward a fixed target the exponential lerp composes exactly: two steps of dt equal one of 2·dt.
    const whole = generateParticles(anchors);
    const pieces = generateParticles(anchors);
    for (const field of [whole, pieces]) {
      field.x[0] += 50;
      field.y[0] -= 30;
    }
    stepParticles(whole, 0, 0.5);
    for (let i = 0; i < 50; i++) stepParticles(pieces, 0, 0.01);
    expect(pieces.x[0]).toBeCloseTo(whole.x[0], 3);
    expect(pieces.y[0]).toBeCloseTo(whole.y[0], 3);
  });

  it("closes a gap by 1 − e^(−dt/τ) per step, so a long pause is a glide rather than a snap", () => {
    const field = generateParticles(anchors);
    const target = field.x[0];
    field.x[0] = target + 100;
    // A frame of MAX_FRAME_DT (0.1 s) closes about 22 % of the gap; the rest follows over later frames.
    stepParticles(field, 0, 0.1);
    expect(field.x[0] - target).toBeCloseTo(100 * Math.exp(-0.1 / LERP_TAU), 3);
    expect(field.x[0] - target).toBeGreaterThan(70);
  });
});

describe("generateParticles on the real map", () => {
  it("covers each area's own projects and keeps clear of every other area's, from the settled graph", () => {
      // The same anchors portfolio-map.tsx builds: the settled area nodes, not the synthetic ring above.
      const sim = settle(createSimulation(buildMapGraph()));
      const real: ParticleAnchor[] = sim.nodes
        .filter((n) => n.type === "area")
        .map((n) => ({ x: n.x!, y: n.y!, radius: n.radius, area: n.area! }));
      const field = generateParticles(real);
      expect(field.count).toBe(real.length * PARTICLES_PER_ANCHOR);

      // Spec §5: σ ≈ 60 world units covers the area's projects (~80 away) but not its neighbors.
      const sigma = 26 * SPREAD_FACTOR;
      const envelope = sigma * CLAMP_SIGMA + OUTWARD_SHIFT;
      const projects = sim.nodes.filter((n) => n.type === "project");
      for (const project of projects) {
        const own = real.find((a) => a.area === project.area)!;
        expect(Math.hypot(project.x! - own.x, project.y! - own.y)).toBeLessThan(envelope);
        // A handful of homes land on the project's collision halo, so the dust visibly reaches it.
        let onProject = 0;
        for (let i = 0; i < field.count; i++) {
          if (real[field.anchor[i]].area !== project.area) continue;
          if (Math.hypot(field.homeX[i] - project.x!, field.homeY[i] - project.y!) < project.radius + 8) onProject++;
        }
        expect(onProject).toBeGreaterThanOrEqual(5);
      }
      for (let i = 0; i < field.count; i++) {
        const own = real[field.anchor[i]];
        const dOwn = Math.hypot(field.homeX[i] - own.x, field.homeY[i] - own.y);
        for (const other of real) {
          if (other === own) continue;
          expect(dOwn).toBeLessThan(Math.hypot(field.homeX[i] - other.x, field.homeY[i] - other.y));
        }
        for (const project of projects) {
          if (project.area === own.area) continue;
          // Foreign projects stay more than two standard deviations from any home.
          expect(Math.hypot(field.homeX[i] - project.x!, field.homeY[i] - project.y!)).toBeGreaterThan(2 * sigma);
        }
      }
    });
});

describe("generateParticles trait distributions", () => {
  it("fades opacity with size: every particle sits in the 0.75–1× band under the size-fade line", () => {
      const field = generateParticles(anchors);
      const [sizeMin, sizeMax] = SIZE_RANGE;
      const [opacityMin, opacityMax] = OPACITY_RANGE;
      for (let i = 0; i < field.count; i++) {
        // The fade line runs from opacityMax at the smallest size down to opacityMin at the largest.
        const sizeNorm = (field.size[i] - sizeMin) / (sizeMax - sizeMin);
        const line = opacityMax + (opacityMin - opacityMax) * sizeNorm;
        expect(field.opacity[i]).toBeLessThanOrEqual(line + 1e-5);
        expect(field.opacity[i]).toBeGreaterThanOrEqual(line * 0.75 - 1e-5);
      }
      // So dust is inky and the big blobs are a wash: the smallest quarter is far darker than the largest.
      const bySize = Array.from({ length: field.count }, (_, i) => i).sort((a, b) => field.size[a] - field.size[b]);
      const quarter = Math.floor(field.count / 4);
      const mean = (ids: number[]) => ids.reduce((sum, i) => sum + field.opacity[i], 0) / ids.length;
      expect(mean(bySize.slice(0, quarter))).toBeGreaterThan(1.5 * mean(bySize.slice(-quarter)));
    });

  it("spreads tints evenly across the sprite variants and honors a tints override", () => {
      const field = generateParticles(anchors);
      const counts = new Array<number>(TINT_COUNT).fill(0);
      for (let i = 0; i < field.count; i++) counts[field.tint[i]]++;
      for (const n of counts) {
        // Each variant gets about 1/TINT_COUNT of the field; ±5 points is ~4σ for 1600 draws.
        expect(n / field.count).toBeGreaterThan(1 / TINT_COUNT - 0.05);
        expect(n / field.count).toBeLessThan(1 / TINT_COUNT + 0.05);
      }
      // More variants widen the range without leaving one unused.
      const five = generateParticles(anchors, { tints: 5 });
      const used = new Set<number>();
      for (let i = 0; i < five.count; i++) used.add(five.tint[i]);
      expect([...used].sort()).toEqual([0, 1, 2, 3, 4]);
    });
});

describe("generateParticles options", () => {
  it("honors perAnchor, spread, and outward overrides, sizing every typed array to the count", () => {
      const small = generateParticles(anchors, { perAnchor: 50 });
      expect(small.count).toBe(anchors.length * 50);
      const arrays = [
        small.anchor, small.homeX, small.homeY, small.phase, small.phase2, small.speed,
        small.amplitude, small.size, small.opacity, small.tint, small.x, small.y,
      ];
      for (const array of arrays) expect(array.length).toBe(small.count);
      for (let i = 0; i < small.count; i++) expect(small.anchor[i]).toBe(Math.floor(i / 50));

      // Same seed, so the gaussian draws are identical and only the scale differs.
      const one = generateParticles(anchors, { spread: 1, outward: 0 });
      const two = generateParticles(anchors, { spread: 2, outward: 0 });
      for (let i = 0; i < one.count; i++) {
        const a = anchors[one.anchor[i]];
        expect(two.homeX[i] - a.x).toBeCloseTo(2 * (one.homeX[i] - a.x), 3);
        expect(two.homeY[i] - a.y).toBeCloseTo(2 * (one.homeY[i] - a.y), 3);
        // spread 1 → σ = radius, and the clamp is in σ units.
        expect(Math.hypot(one.homeX[i] - a.x, one.homeY[i] - a.y)).toBeLessThanOrEqual(a.radius * CLAMP_SIGMA + 1e-3);
      }
      // With no outward nudge the cluster's mean sits on the anchor itself (within a fifth of σ).
      for (let k = 0; k < anchors.length; k++) {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let i = 0; i < one.count; i++) {
          if (one.anchor[i] !== k) continue;
          sx += one.homeX[i] - anchors[k].x;
          sy += one.homeY[i] - anchors[k].y;
          n++;
        }
        expect(Math.hypot(sx / n, sy / n)).toBeLessThan(anchors[k].radius * 0.2);
      }
      // outward moves every home by exactly that many units along the anchor's direction from the origin.
      const pushed = generateParticles(anchors, { spread: 1, outward: 10 });
      for (let i = 0; i < one.count; i++) {
        const a = anchors[one.anchor[i]];
        const d = Math.hypot(a.x, a.y);
        expect(pushed.homeX[i] - one.homeX[i]).toBeCloseTo((a.x / d) * 10, 3);
        expect(pushed.homeY[i] - one.homeY[i]).toBeCloseTo((a.y / d) * 10, 3);
      }
    });
});

describe("stepParticles drift path", () => {
  it("traces a loop, not a segment: x and y drift are uncorrelated over a full cycle", () => {
      // A small field: every particle is sampled across its own cycle, so cost grows with count².
      const field = generateParticles(anchors, { perAnchor: 10 });
      // An infinite step lands exactly on the target, so sampling with dt = ∞ reads the drift itself.
      const samples = 200;
      for (let i = 0; i < field.count; i++) {
        // Five x-cycles are four y-cycles (DRIFT_RATIO = 0.8), so the path closes on itself.
        const span = (5 * Math.PI * 2) / field.speed[i];
        const xs: number[] = [];
        const ys: number[] = [];
        for (let s = 0; s < samples; s++) {
          stepParticles(field, (s / samples) * span, Infinity);
          xs.push(field.x[i] - field.homeX[i]);
          ys.push(field.y[i] - field.homeY[i]);
        }
        const mean = (v: number[]) => v.reduce((sum, value) => sum + value, 0) / v.length;
        const mx = mean(xs);
        const my = mean(ys);
        let sxy = 0;
        let sxx = 0;
        let syy = 0;
        for (let s = 0; s < samples; s++) {
          sxy += (xs[s] - mx) * (ys[s] - my);
          sxx += (xs[s] - mx) ** 2;
          syy += (ys[s] - my) ** 2;
        }
        // Both axes swing (RMS ≈ amplitude/√2) and they do not swing together.
        expect(Math.sqrt(sxx / samples)).toBeGreaterThan(field.amplitude[i] * 0.6);
        expect(Math.sqrt(syy / samples)).toBeGreaterThan(field.amplitude[i] * 0.6);
        expect(Math.abs(sxy / Math.sqrt(sxx * syy))).toBeLessThan(0.2);
      }
    });
});
