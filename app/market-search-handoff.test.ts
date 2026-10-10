import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MarketSearchHandoff } from "@/components/search/MarketSearchHandoff";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("market search handoff", () => {
  it("separates external coverage and makes dropped filters explicit", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        React.createElement(MarketSearchHandoff, {
          query: "make=Ford&model=Bronco+Sport&state=TX&damage=flood",
        }),
      ),
    );
    expect(host.textContent).toContain(
      "External results are separate from our indexed inventory",
    );
    expect(host.querySelector("summary")?.textContent).toContain(
      "Statewide: TX",
    );
    expect(host.querySelector("summary")?.textContent).toContain(
      "1 filter not transferred",
    );
    expect(host.textContent).toContain("Not transferred: Damage: flood");
    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    expect(new URL(links[0].href).searchParams.get("model_kw")).toBe(
      "Bronco Sport",
    );
    expect(links[1].href).toBe("https://www.copart.com/vehicleFinder");
    expect(links[2].href).toBe("https://visor.vin/search/filters");
    for (const link of links) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
      expect(link.getAttribute("aria-label")).toContain("opens in a new tab");
    }
  });
});
