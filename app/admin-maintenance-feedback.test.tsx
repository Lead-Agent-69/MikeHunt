import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("swr", () => ({
  default: (url: string) => ({
    data: url.includes("/stats")
      ? {
          activeDeals: 1,
          topDeals: [
            {
              id: "one",
              year: 2020,
              make: "Ford",
              model: "Edge",
              true_net_profit: null,
              deal_verdict: "go",
            },
          ],
        }
      : { sources: [], enabled: 0, healthy: 0, due: 0 },
    error: undefined,
    isLoading: false,
    mutate: state.refresh,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import AdminDashboard from "./(dashboard)/admin/page";

afterEach(() => {
  vi.unstubAllGlobals();
  state.refresh.mockReset().mockResolvedValue(undefined);
});

async function exercise(status: number, result: unknown, refreshFails = false) {
  const host = document.createElement("div");
  const root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status })),
  );
  if (refreshFails) state.refresh.mockRejectedValue(new Error("offline"));
  try {
    await act(async () => root.render(<AdminDashboard />));
    const button = Array.from(host.querySelectorAll("button")).find(
      (node) =>
        node.textContent === "Run task" &&
        node.parentElement?.textContent?.includes("Verify Missouri photos"),
    )!;
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const receipt = host.querySelector(
      '[aria-label="Latest maintenance result"]',
    );
    return {
      html: host.innerHTML,
      role: receipt?.getAttribute("role"),
      receipt: receipt?.textContent,
    };
  } finally {
    await act(async () => root.unmount());
  }
}

it("keeps a counted success receipt visible independently of the toast and qualifies model outputs", async () => {
  const view = await exercise(200, {
    photoHealth: true,
    checked: 10,
    available: 8,
    unknown: 2,
    written: 8,
  });
  expect(view.role).toBe("status");
  expect(view.receipt).toContain(
    "10 galleries checked; 8 working, 0 missing, 2 unverified. 8 updates confirmed.",
  );
  expect(view.html).toContain("Model-ranked inventory");
  expect(view.html).toContain("Not calculated");
  expect(view.html).not.toContain("High-confidence buys");
});
it("keeps partial confirmed writes distinct from success", async () => {
  const view = await exercise(503, {
    photoHealth: true,
    checked: 4,
    available: 4,
    written: 2,
    failed: 1,
  });
  expect(view.role).toBe("alert");
  expect(view.receipt).toContain("could not finish");
  expect(view.receipt).toContain("2 updates confirmed.");
});
it("does not erase a successful write receipt when dashboard refresh fails", async () => {
  const view = await exercise(
    200,
    { photoHealth: true, checked: 1, available: 1, written: 1 },
    true,
  );
  expect(view.role).toBe("alert");
  expect(view.receipt).toContain("finished; dashboard refresh failed");
  expect(view.receipt).toContain("1 updates confirmed.");
});
it("does not claim success from an invalid maintenance response", async () => {
  const view = await exercise(200, null);
  expect(view.role).toBe("alert");
  expect(view.receipt).toContain("Completion could not be verified");
});
