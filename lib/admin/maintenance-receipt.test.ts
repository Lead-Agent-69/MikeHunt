import { describe, expect, it } from "vitest";
import { maintenanceReceipt } from "./maintenance-receipt";
describe("honest maintenance receipts", () => {
  it("reports partial writes even when the request failed", () => {
    expect(maintenanceReceipt(false, { updated: 4, failed: 2 })).toMatchObject({
      confirmedChanges: true,
      description: expect.stringContaining(
        "4 updates confirmed; 2 not confirmed",
      ),
    });
  });
  it("does not mistake scanned rows for confirmed writes on failure", () => {
    expect(maintenanceReceipt(false, { scanned: 50 })).toMatchObject({
      confirmedChanges: false,
      description: expect.stringContaining("could not be verified"),
    });
  });
  it("distinguishes unknown completion from a confirmed empty result", () => {
    expect(maintenanceReceipt(true, {}).description).toBe("Task completed.");
    expect(maintenanceReceipt(true, { updated: 0 }).description).toBe(
      "There was nothing waiting.",
    );
  });
  it("retains successful legacy receipt counts", () => {
    expect(maintenanceReceipt(true, { rescored: 3 }).description).toBe(
      "3 records processed.",
    );
    expect(maintenanceReceipt(true, { scanned: 5 }).description).toBe(
      "5 records processed.",
    );
  });
  it.each([-1, NaN, Infinity, 1.5, "500"])(
    "does not trust malformed counts %s",
    (value) => {
      expect(
        maintenanceReceipt(false, { updated: value }).confirmedChanges,
      ).toBe(false);
      expect(
        maintenanceReceipt(false, { updated: value }).description,
      ).toContain("could not be verified");
    },
  );
});
