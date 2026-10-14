import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";

for (const desk of [
  "personal",
  "diy",
  "reseller",
  "dealer",
  "parts",
] as Desk[]) {
  test.describe(`${desk} maintenance boundaries`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk) });
    test("ordinary buyer cannot preview or rescore inventory", async ({
      page,
    }) => {
      const response = await page.request.post("/api/admin/rescore", {
        data: { dryRun: true, pageSize: 1 },
      });
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });
  });
}
test.describe("owner score preview", () => {
  localOnly();
  test.use({ storageState: storagePath("admin") });
  test("real local owner can preview one decision with zero writes", async ({
    page,
  }) => {
    const response = await page.request.post("/api/admin/rescore", {
      data: { dryRun: true, pageSize: 1 },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(0);
    expect(result.rescored).toBe(0);
    expect(result.analyzed).toBe(1);
    expect(result.failed).toBe(0);
    expect(
      Object.values(result.verdicts).reduce(
        (sum: number, value) => sum + Number(value),
        0,
      ),
    ).toBe(1);
  });
});
