import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("appearance preference", () => {
  it("changes rendered theme, saves it, and synchronizes multiple controls", () => {
    act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ThemeToggle),
          React.createElement(ThemeToggle),
        ),
      ),
    );
    const buttons = host.querySelectorAll("button");
    act(() => buttons[0].click());
    expect(localStorage.getItem("theme")).toBe("light");
    act(() => buttons[1].click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(buttons[0].getAttribute("aria-label")).toContain("Theme: Dark");
  });
  it("restores saved dark preference", () => {
    localStorage.setItem("theme", "dark");
    act(() => root.render(React.createElement(ThemeToggle)));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("does not force dark mode back to white and keeps offline branding high contrast", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).not.toContain("Keep the product on the premium research skin");
    expect(css).toContain("--s0: #17191e");
    expect(css).toContain(
      "--glow-bg: linear-gradient(180deg, #111318, #0a0a0f)",
    );
    const offline = readFileSync("public/offline.html", "utf8");
    expect(offline).toContain("background: #ffffff");
    expect(offline).toContain("/brand/MIKEHUNT-M.svg");
    expect(offline).toContain('role="status"');
  });
});
