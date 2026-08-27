// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PortfolioMap } from "../portfolio-map";

beforeAll(() => {
  // jsdom has no layout, canvas, or ResizeObserver; the map only needs them to exist.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
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

afterEach(cleanup);

const areaNames = ["Trading", "Data", "Web", "Real Estate"];

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
    expect(pill.style.transform).toMatch(/^translate\(-?\d+px, -?\d+px\) translateX\(-50%\)$/);
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
});
