import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import SearchesPage from "./(dashboard)/searches/page";

const db = vi.hoisted(() => ({
  insert: vi.fn(),
  getUser: vi.fn(async () => ({ data: { user: null } })),
}));
vi.mock("@/lib/supabase", () => ({
  createClientComponentClient: () => ({
    auth: { getUser: db.getUser },
    from: () => ({ insert: db.insert }),
  }),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "reseller" } }),
}));
vi.mock("next/link", () => ({ default: "a" }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = "";
  localStorage.clear();
  vi.clearAllMocks();
});

it("blocks a broader saved alert and gives a lossless Market handoff for the recorded request", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<SearchesPage />));
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Describe your saved search"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(
      input,
      "Ford Expedition, 2018 to 2022, under $20,000, under 100000 miles, within 100 miles of ZIP 63101, clean title.",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const parse = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Parse",
  )!;
  await act(async () => parse.click());
  expect(
    host.querySelector<HTMLSelectElement>('[aria-label="Title type"]')?.value,
  ).toBe("clean");
  expect(
    host.querySelector<HTMLInputElement>('[aria-label="Model"]')?.value,
  ).toBe("Expedition");
  expect(host.textContent).toContain("Mileage limit");
  const save = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(save.disabled).toBe(true);
  // Also enforce on submit, not just on the visual disabled button.
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(db.insert).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  const handoff = Array.from(host.querySelectorAll("a")).find((a) =>
    a.textContent?.includes("Review full search"),
  )!;
  expect(handoff.getAttribute("href")).toContain("near=63101");
  expect(handoff.getAttribute("href")).toContain("mileageMax=100000");
});
