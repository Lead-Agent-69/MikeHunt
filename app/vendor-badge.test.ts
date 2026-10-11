import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SourceBadge } from "@/components/shared/SourceBadge";

describe("vendor badge", () => {
  it("provides a labeled native listing link and decorative original artwork", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      React.createElement(SourceBadge, {
        source: "craigslist",
        sourceUrl: "https://stlouis.craigslist.org/cto/123.html",
        showChannel: true,
      }),
    );
    const link = host.querySelector("a");
    expect(link?.getAttribute("aria-label")).toBe(
      "View listing at Craigslist (opens in a new tab)",
    );
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.className).toContain("min-h-11");
    expect(host.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(host.textContent).toContain("Private");
  });
  it("does not render an action for an invalid source URL", () => {
    const html = renderToStaticMarkup(
      React.createElement(SourceBadge, {
        source: "copart",
        sourceUrl: "javascript:alert(1)",
      }),
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("Copart");
  });
  it("keeps listing clicks and keyboard events separate from parent card navigation and recovers from image errors", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    try {
      await act(async () =>
        root.render(
          React.createElement(
            "div",
            { onClick, onKeyDown },
            React.createElement(SourceBadge, {
              source: "craigslist",
              sourceUrl: "https://stlouis.craigslist.org/cto/123.html",
            }),
          ),
        ),
      );
      const link = host.querySelector("a")!;
      // Prevent jsdom from opening a new window while testing propagation.
      link.addEventListener("click", (event) => event.preventDefault());
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        link.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        host.querySelector("img")!.dispatchEvent(new Event("error"));
      });
      expect(onClick).not.toHaveBeenCalled();
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(host.querySelector("img")).toBeNull();
      expect(link.textContent).toContain("Craigslist");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
