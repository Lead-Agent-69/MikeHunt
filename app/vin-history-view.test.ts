import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as any,
  isLoading: false,
  fetcher: undefined as any,
  mutate: vi.fn(),
}));
vi.mock("swr", () => ({
  default: (_key: any, fetcher: any) => {
    state.fetcher = fetcher;
    return { ...state };
  },
}));
import { VinHistory } from "@/components/deal/VinHistory";
const render = (condition?: string) =>
  renderToStaticMarkup(
    React.createElement(VinHistory, { vin: "3GCPYJEK6NG154660", condition }),
  );
beforeEach(() => {
  state.data = undefined;
  state.error = undefined;
  state.isLoading = false;
  vi.unstubAllGlobals();
  state.mutate.mockClear();
});

describe("history evidence presentation", () => {
  it("retries the actual history request when the retry action is clicked", async () => {
    state.error = new Error("unavailable");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    try {
      await act(async () =>
        root.render(
          React.createElement(VinHistory, { vin: "3GCPYJEK6NG154660" }),
        ),
      );
      const button = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("Retry history"),
      );
      expect(button).toBeTruthy();
      await act(async () => button!.click());
      expect(state.mutate).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
  it("does not present a green all-clear while loading", () => {
    state.isLoading = true;
    const html = render();
    expect(html).toContain("Checking stored vehicle history");
    expect(html).toContain("Independent history not verified");
    expect(html).not.toContain("No red flags disclosed");
    expect(html).not.toContain("var(--green)");
  });
  it("keeps known warnings and offers retry after failure", () => {
    state.error = new Error("unavailable");
    const html = render("salvage");
    expect(html).toContain("Salvage title");
    expect(html).toContain("Retry history");
    expect(html).toContain("could not be checked");
  });
  it("does not reuse an authoritative all-clear after a failed revalidation", () => {
    state.data = {
      source: "nmvtis",
      authoritative: true,
      titleBrands: [],
      cleanClaims: [],
      note: "report",
    };
    state.error = new Error("unavailable");
    expect(render()).not.toContain("NMVTIS · verified");
  });
  it("labels a stored sighting as reported, not cross-referenced", () => {
    state.data = {
      source: "vin-graph",
      authoritative: false,
      titleBrands: ["Recorded damage: repairable"],
      cleanClaims: [],
      note: "1 stored listing sighting.",
      sightings: [{}],
    };
    expect(render()).toContain("stored listing records · reported");
    expect(render()).not.toContain("cross-referenced");
  });
  it("rejects HTTP failures instead of accepting their JSON as history", async () => {
    render();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(state.fetcher("/history")).rejects.toThrow("unavailable");
  });
});
