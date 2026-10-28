import { describe, expect, it } from "vitest";
import { capacitySummary, inventoryCapacity } from "./inventory-capacity";

const validCapacity = () => ({
  checkedAt: "2026-10-28T18:00:00Z",
  databaseBytes: 377_000_000,
  inventory: { total: 100, active: 80, unseen30Days: 0, unseen7Days: 60 },
  relations: [
    {
      schema_name: "public",
      table_name: "deals",
      total_bytes: 1000,
      table_bytes: 600,
      index_bytes: 400,
      estimated_live_rows: 100,
      estimated_dead_rows: 4,
    },
  ],
  archive: {
    policyDays: 30 as const,
    actionsEnabled: false as const,
    eligibilityAssessed: false as const,
  },
});

describe("inventory capacity assessment", () => {
  it("does not promise archive capacity where no rows exceed the cutoff", () => {
    const report = inventoryCapacity(validCapacity())!;
    expect(capacitySummary(report)).toMatchObject({ state: "warning" });
    expect(capacitySummary(report).archiveMessage).toContain(
      "cannot free inventory capacity today",
    );
  });
  it("keeps age distinct from approved archival and preserves threshold boundaries", () => {
    const report = {
      ...validCapacity(),
      inventory: { ...validCapacity().inventory, unseen30Days: 10 },
    };
    expect(capacitySummary(report).archiveMessage).toContain(
      "Protected references and recovery",
    );
    for (const [bytes, state] of [
      [349999999, "normal"],
      [350000000, "warning"],
      [449999999, "warning"],
      [450000000, "critical"],
    ] as const)
      expect(capacitySummary({ ...report, databaseBytes: bytes }).state).toBe(
        state,
      );
  });
  it.each([
    null,
    {},
    { ...validCapacity(), databaseBytes: -1 },
    {
      ...validCapacity(),
      inventory: { total: 10, active: 11, unseen30Days: 0, unseen7Days: 0 },
    },
    {
      ...validCapacity(),
      archive: {
        policyDays: 30,
        actionsEnabled: true,
        eligibilityAssessed: false,
      },
    },
    {
      ...validCapacity(),
      relations: [{ ...validCapacity().relations[0], total_bytes: null }],
    },
    {
      ...validCapacity(),
      relations: [{ ...validCapacity().relations[0], schema_name: "private" }],
    },
    { ...validCapacity(), checkedAt: "invalid" },
  ])("rejects incomplete or unsafe receipts", (value) =>
    expect(inventoryCapacity(value)).toBeNull(),
  );
});
