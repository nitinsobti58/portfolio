import { describe, expect, it } from "vitest";

import {
  CLAMP_SIGMA,
  createRng,
  DRIFT_AMPLITUDE,
  generateParticles,
  LERP_TAU,
  MAX_PARTICLES,
  OPACITY_RANGE,
  PARTICLES_PER_ANCHOR,
  SIZE_RANGE,
  SPREAD_FACTOR,
  stepParticles,
  TINT_COUNT,
  type ParticleAnchor,
} from "../particles";

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
