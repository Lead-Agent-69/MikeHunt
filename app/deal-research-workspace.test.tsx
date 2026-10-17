import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealResearchWorkspace } from "@/components/deal/DealResearchWorkspace";
import { PriceTimeline } from "@/components/deal/PriceTimeline";

const swrResponse = vi.hoisted(() => ({
  data: [
    { price: 30_000, observedAt: "2026-08-01T12:00:00.000Z" },
    { price: 28_000, observedAt: "2026-09-01T12:00:00.000Z" },
    { price: 26_000, observedAt: "2026-10-01T12:00:00.000Z" },
  ],
  error: null,
  isLoading: false,
  mutate: vi.fn(),
}));

vi.mock("swr", () => ({ default: () => swrResponse }));
vi.mock("@/components/deal/DealIQCard", () => ({
  DealIQCard: () => <div>Deal IQ panel</div>,
}));
vi.mock("@/components/deal/AIBrief", () => ({
  AIBrief: () => <div>AI brief panel</div>,
}));
vi.mock("@/components/deal/VehicleSpecs", () => ({
  VehicleSpecs: () => <div>Vehicle data panel</div>,
}));

describe("focused deal research", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("mounts one research tool at a time and keeps dealer IQ role-aware", () => {
    act(() =>
      root.render(
        <DealResearchWorkspace
          dealId="deal-1"
          vin="VIN123"
          make="Ford"
          dealerMode
        />,
      ),
    );

    const tabs = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Deal IQ"),
        expect.stringContaining("AI brief"),
        expect.stringContaining("Vehicle data"),
      ]),
    );
    expect(host.textContent).toContain("Deal IQ panel");
    expect(host.textContent).not.toContain("AI brief panel");

    act(() =>
      tabs.find((tab) => tab.textContent?.includes("AI brief"))!.click(),
    );
    expect(host.textContent).toContain("AI brief panel");
    expect(host.textContent).not.toContain("Deal IQ panel");
  });

  it("makes every observed price selectable and exposes range controls", () => {
    act(() => root.render(<PriceTimeline dealId="deal-1" />));

    expect(host.textContent).toContain("Listing price history");
    expect(host.textContent).toContain("Down $4,000");
    const allRange = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "All")!;
    expect(allRange.getAttribute("aria-pressed")).toBe("true");

    const firstPoint = host.querySelector<SVGGElement>(
      '[role="button"][aria-label*="Aug 1, 2026"]',
    )!;
    act(() =>
      firstPoint.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(firstPoint.getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("$30,000");
  });
});
