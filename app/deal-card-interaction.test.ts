import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DealCard } from "@/components/shared/DealCard";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onClick, onKeyDown, role, tabIndex, className }: any) =>
      React.createElement(
        "div",
        { onClick, onKeyDown, role, tabIndex, className },
        children,
      ),
    a: ({ children, href, onClick, className }: any) =>
      React.createElement("a", { href, onClick, className }, children),
  },
}));

it("keyboard activation opens the card but never hijacks Save or disclosures", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const open = vi.fn();
  const save = vi.fn();
  try {
    await act(async () =>
      root.render(
        React.createElement(DealCard, {
          id: "vehicle-one",
          source: "independent_dealer",
          year: 2020,
          make: "Honda",
          model: "Civic",
          askPrice: 12000,
          mmrValue: 15000,
          profitEstimate: 0,
          flipDesk: false,
          onClick: open,
          onSave: save,
        }),
      ),
    );
    const card = host.firstElementChild!;
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    card.dispatchEvent(enter);
    expect(open).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBe(true);
    const button = host.querySelector("button")!;
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    host
      .querySelector("summary")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(open).toHaveBeenCalledTimes(1);
    host
      .querySelector("h3")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(open).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
