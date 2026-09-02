// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MAP_QUERY, MapErrorBoundary, MapSection } from "../map-section";
import { generateParticles, stepParticles } from "../particles";
import { createSimulation, settle } from "../simulation";

/** Set by the map module's mock factory the first time anything imports it. */
const mapModule = vi.hoisted(() => ({ imported: false }));

/** How many times next/dynamic has asked its loader for the map chunk. */
const dyn = vi.hoisted(() => ({ loaderCalls: 0 }));

// next/dynamic invokes the loader synchronously on the first render of the
// lazy element, so counting its calls makes the "never requested" case a
// deterministic assertion rather than a wait.
vi.mock("next/dynamic", async (importOriginal) => {
  const m = await importOriginal<typeof import("next/dynamic")>();
  const wrapped: typeof m.default = (loader, options) =>
    m.default(
      typeof loader === "function"
        ? () => {
            dyn.loaderCalls++;
            return loader();
          }
        : loader,
      options,
    );
  return { ...m, default: wrapped };
});

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
      return query === MAP_QUERY && wide;
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
  it("gates on Tailwind's md breakpoint, in the same unit as the section's md:block", () => {
    // 48rem, not 768px: rem resolves against the browser's default font size for
    // both the stylesheet and matchMedia, so the CSS and JS gates cannot diverge.
    expect(MAP_QUERY).toBe("(min-width: 48rem)");
    render(<MapSection />);
    expect(window.matchMedia).toHaveBeenCalledWith(MAP_QUERY);
  });

  // Order matters: the narrow case must run before anything has loaded the map module.
  it("below the breakpoint renders no map and never loads, simulates, spawns particles, or requests a frame", async () => {
    wide = false;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const { container } = render(<MapSection />);
    // These two are the proof: the loader was never invoked and the module was
    // never imported. Both are decided synchronously by the first render.
    expect(dyn.loaderCalls).toBe(0);
    expect(mapModule.imported).toBe(false);
    // Belt and braces for anything asynchronous.
    await wait(100);

    // The section and its box are in the HTML (CSS hides them below the breakpoint); the box stays empty.
    expect(container.querySelector("section > div")).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(dyn.loaderCalls).toBe(0);
    expect(mapModule.imported).toBe(false);
    expect(createSimulation).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(generateParticles).not.toHaveBeenCalled();
    expect(stepParticles).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });

  it("from the breakpoint up loads the map module and mounts the canvas, so the spies above are live", async () => {
    wide = true;
    const raf = vi.spyOn(window, "requestAnimationFrame");

    render(<MapSection />);

    expect(await screen.findByRole("img", { name: /map of projects/i })).toBeInTheDocument();
    expect(dyn.loaderCalls).toBe(1);
    expect(mapModule.imported).toBe(true);
    expect(createSimulation).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(generateParticles).toHaveBeenCalledTimes(1);
    expect(raf).toHaveBeenCalled();
  });

  it("collapses the section, not the page, when the map fails to load or render", () => {
    // React reports the caught error on console.error; keep the test output clean.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    function BrokenMap(): never {
      throw new Error("Loading chunk failed");
    }
    const { container } = render(
      <MapErrorBoundary>
        <div data-testid="box">
          <BrokenMap />
        </div>
      </MapErrorBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("box")).toBeNull();
    errors.mockRestore();
  });
});
