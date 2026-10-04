import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
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
  it("cycles System to Light to Dark and syncs every control", () => {
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
    expect(buttons[0].getAttribute("type")).toBe("button");
    expect(buttons[0].className).toContain("min-h-11");
    expect(buttons[0].className).toContain("min-w-11");
    act(() => buttons[0].click());
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => buttons[1].click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(buttons[0].getAttribute("aria-label")).toContain("Theme: Dark");
  });

  it("restores a saved dark preference", () => {
    localStorage.setItem("theme", "dark");
    act(() => root.render(React.createElement(ThemeToggle)));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the OS when the saved preference is system", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    localStorage.setItem("theme", "system");
    act(() => root.render(React.createElement(ThemeToggle)));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("does not restamp dark mode with the light skin", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).not.toContain("premium research skin");
    expect(css.match(/\[data-theme="dark"\]/g)).toHaveLength(1);
    expect(css).toContain("--s0: #17191e");
    expect(css).toContain("--s1: #0a0a0f");
    expect(css).toContain("--t1: #f8f8ff");
    expect(css).toContain(
      "--glow-bg: linear-gradient(180deg, #111318, #0a0a0f)",
    );
    expect(css).toContain("color-scheme: dark");
    const lightGroup = css.slice(
      css.indexOf("Premium acquisition skin"),
      css.indexOf("/* Dark theme */"),
    );
    expect(lightGroup).not.toContain("[data-theme=\"dark\"]");
    expect(lightGroup).toContain("--s1: #f6f8fb");
    expect(lightGroup).toContain("--t1: #0b1220");
  });

  it("keeps the wordmark and plates the cobalt mark on dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    act(() => root.render(React.createElement(MikeHuntLogo, { size: "sm" })));
    expect(host.textContent).toContain("MIKEHUNT");
    const mark = host.querySelector("img");
    expect(mark?.getAttribute("src")).toBe("/brand/MIKEHUNT-M.svg");
    expect(mark?.parentElement?.className).toContain("bg-white");
  });

  it("leaves the cobalt mark unplated on light", () => {
    document.documentElement.setAttribute("data-theme", "light");
    act(() => root.render(React.createElement(MikeHuntLogo, { size: "sm" })));
    expect(host.textContent).toContain("MIKEHUNT");
    expect(host.querySelector("img")?.parentElement?.className ?? "").not.toContain(
      "bg-white",
    );
  });
});