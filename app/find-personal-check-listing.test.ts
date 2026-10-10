import { createElement, act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mode = vi.hoisted(() => ({ value: "personal" as string }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: mode.value } }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {}, isLoading: false }),
}));

import { FlipDeskGate } from "@/components/shared/FlipDeskGate";
import { CheckAnyListingAnyDesk } from "@/components/intelligence/CheckAnyListingAnyDesk";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const render = () =>
  act(() =>
    root.render(
      createElement(
        FlipDeskGate,
        {
          route: "/find",
          openToAllDesks: createElement(CheckAnyListingAnyDesk),
        } as ComponentProps<typeof FlipDeskGate>,
        createElement("div", { "data-testid": "flip-page" }),
      ),
    ),
  );

describe("/find: Check any listing for every desk", () => {
  it("personal, DIY and parts desks get the card, and arbitrage routes stay gated", () => {
    for (const m of ["personal", "diy", "parts"]) {
      mode.value = m;
      render();
      expect($("check-any-listing"), m).not.toBeNull();
      expect($("flip-tool-blocked"), m).not.toBeNull();
      expect($("flip-page"), m).toBeNull();
      // One page h1; the desk notice drops to h2 under the card.
      expect(host.querySelectorAll("h1")).toHaveLength(1);
      expect($("flip-tool-blocked")?.querySelector("h2")?.textContent).toBe(
        "This tool is for reseller and dealer desks",
      );
    }
  });

  it("reseller and dealer get the full page (which has its own card)", () => {
    for (const m of ["reseller", "dealer"]) {
      mode.value = m;
      render();
      expect($("flip-page"), m).not.toBeNull();
      expect($("flip-tool-blocked"), m).toBeNull();
    }
  });

  it("the /find layout passes the any-desk card; other flip routes don't", () => {
    expect(readFileSync("app/(dashboard)/find/layout.tsx", "utf8")).toContain(
      "openToAllDesks={<CheckAnyListingAnyDesk />}",
    );
    for (const r of ["arbitrage", "best-buy", "lane", "market", "auctions"]) {
      expect(
        readFileSync(`app/(dashboard)/${r}/layout.tsx`, "utf8"),
      ).not.toContain("openToAllDesks");
    }
  });
});
