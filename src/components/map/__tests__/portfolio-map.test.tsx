// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PortfolioMap } from "../portfolio-map";

/** Flip on per test to make fly-to transforms apply synchronously. */
let reducedMotion = false;

beforeAll(() => {
  // jsdom has no layout, canvas, or ResizeObserver; the map only needs them to exist.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") && reducedMotion,
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
  reducedMotion = false;
});

const areaNames = ["Trading", "Data", "Web", "Real Estate"];

/** A pill by its label, whether or not it is currently hidden (hidden pills have no accessible name). */
const pill = (label: string) => screen.getByText(label) as HTMLElement;

/** The wrapper d3-zoom is attached to; it holds the live transform as `__zoom`. */
function mapWrapper() {
  const wrapper = screen.getByRole("img").parentElement as HTMLElement & {
    __zoom?: { k: number; x: number; y: number };
  };
  return wrapper;
}

describe("PortfolioMap overlay", () => {
  it("renders one button pill per area and no project pills until an area is selected", () => {
    render(<PortfolioMap />);
    for (const name of areaNames) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("link", { name: "RU Trading" })).not.toBeInTheDocument();
  });

  it("selecting an area reveals its projects as links to their case studies", () => {
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));

    expect(screen.getByRole("button", { name: "Trading" })).toHaveAttribute("aria-expanded", "true");
    const pill = screen.getByRole("link", { name: "RU Trading" });
    expect(pill).toHaveAttribute("href", "/projects/ru-trading");
    expect(screen.queryByRole("link", { name: "Market Tool" })).not.toBeInTheDocument();
  });

  it("positions pills through the DOM, never through React", () => {
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Web" }));
    const pill = screen.getByRole("link", { name: "This Site" });
    expect(pill.style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\)$/);
    expect(screen.getByRole("button", { name: "Web" }).style.transform).toMatch(/translate\(/);
  });

  it("clicking the selected area again collapses it", () => {
    render(<PortfolioMap />);
    const data = screen.getByRole("button", { name: "Data" });
    fireEvent.click(data);
    expect(screen.getByRole("link", { name: "Market Tool" })).toBeInTheDocument();
    fireEvent.click(data);
    expect(data).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Market Tool" })).not.toBeInTheDocument();
  });

  it("Escape inside the map clears the selection", () => {
    render(<PortfolioMap />);
    const web = screen.getByRole("button", { name: "Web" });
    fireEvent.click(web);
    fireEvent.keyDown(web, { key: "Escape" });
    expect(web).toHaveAttribute("aria-expanded", "false");
  });

  it("activating a project pill opens the preview with a link to the case study", async () => {
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    const pill = screen.getByRole("link", { name: "RU Trading" });
    // Focus sits elsewhere so a correct focus return must come from the
    // explicit opener, not from the dialog's "previously focused element".
    screen.getByRole("button", { name: "Data" }).focus();
    // Enter on a focused link dispatches a click; a plain click is intercepted.
    fireEvent.click(pill);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("RU Trading")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /view case study/i })).toHaveAttribute(
      "href",
      "/projects/ru-trading",
    );
    expect(within(dialog).getByText("Scrum Lead · five-person team", { exact: false })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(pill).toHaveFocus());
  });

  it("parks focus on the area pill when a focused project pill unmounts", () => {
    render(<PortfolioMap />);
    const trading = screen.getByRole("button", { name: "Trading" });
    fireEvent.click(trading);
    const pill = screen.getByRole("link", { name: "RU Trading" });
    pill.focus();
    fireEvent.keyDown(pill, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "RU Trading" })).not.toBeInTheDocument();
    expect(trading).toHaveFocus();
  });

  it("leaves modified clicks on project pills to the browser", () => {
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    const pill = screen.getByRole("link", { name: "RU Trading" });
    const event = fireEvent.click(pill, { metaKey: true });
    expect(event).toBe(true); // not preventDefault-ed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the map's keys out of the preview sheet", async () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    fireEvent.click(screen.getByRole("link", { name: "RU Trading" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The sheet handled Escape itself; the map selection is untouched.
    expect(screen.getByRole("button", { name: "Trading" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("PortfolioMap controls", () => {
  it("zooms in and out about the center with the buttons, clamped to the scale extent", async () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    const wrapper = mapWrapper();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const start = wrapper.__zoom!.k;
    expect(zoomIn).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(zoomIn);
    expect(wrapper.__zoom!.k).toBeCloseTo(start * 1.6);
    // The button states are written from the coalesced frame, not from React.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reset view" })).not.toHaveAttribute("hidden"),
    );

    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(wrapper.__zoom!.k).toBe(4);
    await waitFor(() => expect(zoomIn).toHaveAttribute("aria-disabled", "true"));

    for (let i = 0; i < 8; i++) fireEvent.click(zoomOut);
    expect(wrapper.__zoom!.k).toBe(0.5);
    await waitFor(() => expect(zoomOut).toHaveAttribute("aria-disabled", "true"));
    expect(zoomIn).toHaveAttribute("aria-disabled", "false");
  });

  it("hides the pills that leave the map when an area is focused", () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    expect(pill("Data").style.visibility).toBe("hidden");
    expect(screen.getByRole("button", { name: "Trading" }).style.visibility).toBe("");
    expect(screen.getByRole("link", { name: "RU Trading" }).style.visibility).toBe("");
  });

  it("Tab pans an off-screen pill into view and focuses it", () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    const wrapper = mapWrapper();
    const before = { ...wrapper.__zoom! };
    const project = screen.getByRole("link", { name: "RU Trading" });
    const data = pill("Data");
    expect(data.style.visibility).toBe("hidden");
    project.focus();

    const notPrevented = fireEvent.keyDown(project, { key: "Tab" });
    expect(notPrevented).toBe(false);
    expect(data).toHaveFocus();
    expect(data.style.visibility).toBe("");
    expect(wrapper.__zoom!.k).toBe(before.k);
    expect(wrapper.__zoom!.x === before.x && wrapper.__zoom!.y === before.y).toBe(false);
  });

  it("Shift+Tab from the controls walks back to the last pill even when it is off-screen", () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    fireEvent.click(screen.getByRole("button", { name: "Trading" }));
    const realEstate = pill("Real Estate");
    expect(realEstate.style.visibility).toBe("hidden");
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    zoomOut.focus();
    fireEvent.keyDown(zoomOut, { key: "Tab", shiftKey: true });
    expect(realEstate).toHaveFocus();
    expect(realEstate.style.visibility).toBe("");
  });

  it("leaves Tab alone when the next pill is already visible", () => {
    reducedMotion = true;
    render(<PortfolioMap />);
    const trading = screen.getByRole("button", { name: "Trading" });
    trading.focus();
    const notPrevented = fireEvent.keyDown(trading, { key: "Tab" });
    expect(notPrevented).toBe(true);
    expect(trading).toHaveFocus();
  });
});
