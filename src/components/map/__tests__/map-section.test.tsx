// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MapSection } from "../map-section";
import { generateParticles, stepParticles } from "../particles";
import { createSimulation, settle } from "../simulation";

/** Set by the map module's mock factory the first time anything imports it. */
const mapModule = vi.hoisted(() => ({ imported: false }));

// The real implementations, wrapped so the tests can tell whether they ran.
vi.mock("../simulation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../simulation")>();
  return {
    ...actual,
    createSimulation: vi.fn(actual.createSimulation),
    settle: vi.fn(actual.settle),
  };
});
vi.mock("../particles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../particles")>();
  return {
    ...actual,
    generateParticles: vi.fn(actual.generateParticles),
    stepParticles: vi.fn(actual.stepParticles),
  };
});
vi.mock("../portfolio-map", async (importOriginal) => {
  mapModule.imported = true;
  return importOriginal();
});

/** The viewport the tests pretend to have; flipped per test. */
let wide = false;

beforeAll(() => {
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ObserverStub);
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query.includes("min-width") && wide;
    },
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) as DOMRect;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("MapSection", () => {
  // Order matters: the narrow case must run before anything has loaded the map module.
  it("below 768px renders nothing and never loads, simulates, spawns particles, or requests a frame", async () => {
    wide = false;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const { container } = render(<MapSection />);
    // A dynamic import would resolve within a few ticks; give it every chance.
    await wait(100);

    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector("canvas")).toBeNull();
    expect(mapModule.imported).toBe(false);
    expect(createSimulation).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(generateParticles).not.toHaveBeenCalled();
    expect(stepParticles).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });

  it("at 768px and up loads the map module and mounts the canvas, so the spies above are live", async () => {
    wide = true;
    const raf = vi.spyOn(window, "requestAnimationFrame");

    render(<MapSection />);

    expect(await screen.findByRole("img", { name: /map of projects/i })).toBeInTheDocument();
    expect(mapModule.imported).toBe(true);
    expect(createSimulation).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(generateParticles).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalled();
  });
});
