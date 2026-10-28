// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  data: undefined as unknown,
  error: undefined as unknown,
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("swr", () => ({
  default: () => ({
    ...state,
    isLoading: false,
    isValidating: false,
    mutate: state.refresh,
  }),
}));
import { InventoryCapacityPanel } from "@/components/admin/InventoryCapacityPanel";
const report = {
  checkedAt: "2026-10-28T18:00:00Z",
  databaseBytes: 377000000,
  inventory: { total: 10, active: 8, unseen30Days: 0, unseen7Days: 4 },
  relations: [],
  archive: {
    policyDays: 30,
    actionsEnabled: false,
    eligibilityAssessed: false,
  },
};
it.each(["malformed", "unavailable", "stale"])(
  "keeps the admin usable when capacity is %s",
  async (mode) => {
    state.data =
      mode === "malformed"
        ? { sources: [] }
        : mode === "stale"
          ? report
          : undefined;
    state.error =
      mode === "malformed" ? undefined : new Error("private diagnostic");
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(<InventoryCapacityPanel />));
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "temporarily unavailable",
      );
      expect(host.textContent).not.toContain("private diagnostic");
      expect(
        Array.from(host.querySelectorAll("dd")).some(
          (node) => node.textContent === "0.0 MB",
        ),
      ).toBe(false);
      if (mode === "stale") {
        expect(host.textContent).toContain("377.0 MB");
        expect(host.textContent).toContain("last successful check");
      }
      await act(async () => host.querySelector("button")!.click());
      expect(state.refresh).toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  },
);
