import type { AreaId } from "@/data/projects";

/** A settled area node that a cluster of particles gathers around. */
export type ParticleAnchor = {
  x: number;
  y: number;
  /** Node radius in world units; the cluster's spread scales with it. */
  radius: number;
  area: AreaId;
};

/**
 * The particle field as a struct of arrays: every trait is generated once
 * per mount, and only `x` / `y` change per frame. Lengths are all `count`.
 */
export type ParticleField = {
  count: number;
  /** Index into the anchors the field was generated from. */
  anchor: Uint16Array;
  /** Rest position: anchor + gaussian offset, in world units. */
  homeX: Float32Array;
  homeY: Float32Array;
  /** Drift parameters: two phases so x and y trace a small loop, not a line. */
  phase: Float32Array;
  phase2: Float32Array;
  /** Angular speed of the drift, radians per second. */
  speed: Float32Array;
  /** Drift amplitude, world units. */
  amplitude: Float32Array;
  /** Draw radius, world units. */
  size: Float32Array;
  opacity: Float32Array;
  /** Which of the anchor's tinted sprites the particle uses. */
  tint: Uint8Array;
  /** Current position, world units. Written by `stepParticles`. */
  x: Float32Array;
  y: Float32Array;
};

export type ParticleOptions = {
  seed: number;
  perAnchor: number;
  /** Standard deviation of the cluster as a multiple of the anchor radius. */
  spread: number;
  /** Offsets beyond this many standard deviations are re-drawn, so clusters keep their edge. */
  clampSigma: number;
  /** World units the cluster's center is pushed away from the origin, toward the anchor's projects. */
  outward: number;
  tints: number;
};

export const PARTICLE_SEED = 1729;

/** Upper bound on the whole field; the per-anchor count shrinks to respect it. */
export const MAX_PARTICLES = 2000;

/** Chosen for four areas: 4 × 400 = 1600, inside the budget. */
export const PARTICLES_PER_ANCHOR = 400;

/** Area radius 26 → σ ≈ 60 world units: covers the area's projects (~78 away) but not its neighbors (~297). */
export const SPREAD_FACTOR = 2.3;
export const CLAMP_SIGMA = 2.2;
export const OUTWARD_SHIFT = 16;
export const TINT_COUNT = 3;

/** Radii in world units. The distribution is skewed hard toward small (`SIZE_SKEW`): mostly dust, a tail of soft blobs. */
export const SIZE_RANGE: readonly [number, number] = [0.8, 6];
export const SIZE_SKEW = 3;
/** Opacity runs opposite to size: dust is inky, the big blobs are a faint wash. */
export const OPACITY_RANGE: readonly [number, number] = [0.07, 0.4];

/** Drift: ~4 world units, slow. Periods of 9–25 s read as ambient, not busy. */
export const DRIFT_AMPLITUDE = 4;
export const DRIFT_SPEED: readonly [number, number] = [0.25, 0.7];
/** The y drift runs at a different rate so the path is a loop rather than a segment. */
export const DRIFT_RATIO = 0.8;

/** Time constant of the lerp toward the drift target, seconds. */
export const LERP_TAU = 0.4;

export const DEFAULT_OPTIONS: ParticleOptions = {
  seed: PARTICLE_SEED,
  perAnchor: PARTICLES_PER_ANCHOR,
  spread: SPREAD_FACTOR,
  clampSigma: CLAMP_SIGMA,
  outward: OUTWARD_SHIFT,
  tints: TINT_COUNT,
};

/**
 * Small deterministic PRNG (mulberry32). The field must look the same on
 * every load and in every test, so nothing here touches Math.random.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal pair (Box–Muller). */
function gaussianPair(rng: () => number): [number, number] {
  const u = 1 - rng(); // (0, 1]: keeps the log finite
  const v = rng();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

/** A gaussian offset in the disc of `clampSigma` standard deviations, by rejection. */
function clusterOffset(rng: () => number, sigma: number, clampSigma: number): [number, number] {
  for (let attempt = 0; attempt < 16; attempt++) {
    const [gx, gy] = gaussianPair(rng);
    if (Math.hypot(gx, gy) <= clampSigma) return [gx * sigma, gy * sigma];
  }
  return [0, 0];
}

function allocate(count: number): ParticleField {
  return {
    count,
    anchor: new Uint16Array(count),
    homeX: new Float32Array(count),
    homeY: new Float32Array(count),
    phase: new Float32Array(count),
    phase2: new Float32Array(count),
    speed: new Float32Array(count),
    amplitude: new Float32Array(count),
    size: new Float32Array(count),
    opacity: new Float32Array(count),
    tint: new Uint8Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
  };
}

/**
 * Generates the decorative dust once, from the settled anchors. Per anchor:
 * `perAnchor` particles with gaussian offsets (σ = radius · spread, clamped
 * to `clampSigma`), the cluster center nudged `outward` world units away
 * from the origin so it leans toward the anchor's projects. Sizes are
 * skewed small; bigger particles are fainter so the clusters read as soft
 * stains rather than confetti. Positions start at rest (the drift target
 * at t = 0), so the first paint is already the settled picture.
 *
 * Pure and deterministic for a given seed.
 */
export function generateParticles(
  anchors: readonly ParticleAnchor[],
  options: Partial<ParticleOptions> = {},
): ParticleField {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const perAnchor = anchors.length
    ? Math.min(o.perAnchor, Math.floor(MAX_PARTICLES / anchors.length))
    : 0;
  const field = allocate(perAnchor * anchors.length);
  const rng = createRng(o.seed);
  const [sizeMin, sizeMax] = SIZE_RANGE;
  const [opacityMin, opacityMax] = OPACITY_RANGE;
  const [speedMin, speedMax] = DRIFT_SPEED;

  let i = 0;
  anchors.forEach((anchor, a) => {
    const sigma = anchor.radius * o.spread;
    const distance = Math.hypot(anchor.x, anchor.y);
    const cx = anchor.x + (distance ? (anchor.x / distance) * o.outward : 0);
    const cy = anchor.y + (distance ? (anchor.y / distance) * o.outward : 0);

    for (let n = 0; n < perAnchor; n++, i++) {
      const [dx, dy] = clusterOffset(rng, sigma, o.clampSigma);
      field.anchor[i] = a;
      field.homeX[i] = cx + dx;
      field.homeY[i] = cy + dy;
      field.phase[i] = rng() * Math.PI * 2;
      field.phase2[i] = rng() * Math.PI * 2;
      field.speed[i] = speedMin + rng() * (speedMax - speedMin);
      field.amplitude[i] = DRIFT_AMPLITUDE * (0.5 + rng() * 0.5);
      const size = sizeMin + (sizeMax - sizeMin) * Math.pow(rng(), SIZE_SKEW);
      field.size[i] = size;
      const sizeNorm = (size - sizeMin) / (sizeMax - sizeMin);
      field.opacity[i] = (opacityMax + (opacityMin - opacityMax) * sizeNorm) * (0.75 + rng() * 0.25);
      field.tint[i] = Math.floor(rng() * o.tints);
    }
  });

  // Rest at the drift target: an infinite step lands every particle exactly on it.
  stepParticles(field, 0, Infinity);
  return field;
}

/**
 * Advances the field to `time` seconds. Each particle's target is its home
 * plus a small sinusoidal drift; the position lerps toward that target with
 * time constant `LERP_TAU`, frame-rate independent. The lerp is what makes
 * a pause harmless: when the loop resumes with a time jump, the target
 * moves and the particle glides after it instead of snapping.
 *
 * No physics: nothing here depends on other particles or on velocity.
 */
export function stepParticles(field: ParticleField, time: number, dt: number) {
  const blend = 1 - Math.exp(-dt / LERP_TAU);
  if (blend <= 0) return;
  const { count, homeX, homeY, phase, phase2, speed, amplitude, x, y } = field;
  for (let i = 0; i < count; i++) {
    const w = speed[i] * time;
    const a = amplitude[i];
    const tx = homeX[i] + a * Math.sin(w + phase[i]);
    const ty = homeY[i] + a * Math.cos(w * DRIFT_RATIO + phase2[i]);
    x[i] += (tx - x[i]) * blend;
    y[i] += (ty - y[i]) * blend;
  }
}
