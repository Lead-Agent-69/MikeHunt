import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
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

it("announces task transitions without repeating the decorative brand", () => {
  for (const [state, message] of [
    ["loading", "Checking vehicle"],
    ["error", "Checking vehicle failed"],
    ["loading", "Checking vehicle"],
    ["complete", "Checking vehicle complete"],
    ["idle", "Checking vehicle"],
  ] as const) {
    act(() =>
      root.render(
        <MikeHuntLoader state={state} size={48} label="Checking vehicle" />,
      ),
    );
    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toBe(message);
    expect(status.getAttribute("data-state")).toBe(state);
    expect(host.querySelectorAll("img")).toHaveLength(1);
    expect(host.querySelector("img")!.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  }
});
