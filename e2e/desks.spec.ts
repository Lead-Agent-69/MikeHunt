import { expect, test } from "@playwright/test";
import { DESK_LABEL, storagePath, type Desk } from "./support/accounts";
import { pickDeal } from "./support/deals";
import { expectHealthy, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

// Each desk is a real account onboarded through the UI in auth.setup.ts.
const FLIP: Record<Desk, boolean> = { personal: false, parts: false, reseller: true, dealer: true };

for (const desk of ["personal", "reseller", "dealer", "parts"] as Desk[]) {
  test.describe(`${desk} desk (local only)`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk) });

    test(`Discover is scoped to the ${desk} desk`, async ({ page }) => {
      const h = watchHealth(page);
      await page.goto("/discover");
      await expect(page.getByText(/BUYING FOR/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(DESK_LABEL[desk]).first()).toBeVisible();
      await expectHealthy(page, h);
    });

    test(`API desk gate matches the ${desk} desk`, async ({ page }) => {
      const res = await page.request.get("/api/deals?limit=5");
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.deskAccess).toBe(FLIP[desk] ? "flip" : "personal");
      // Personal/parts desks must not receive resale-profit fields.
      if (!FLIP[desk]) for (const d of body.deals) expect(d.trueNetProfit ?? null).toBeNull();
    });

    test(`deal page renders for the ${desk} desk`, async ({ page }) => {
      const h = watchHealth(page);
      const deal = await pickDeal(page.request);
      await page.goto(`/deal/${deal.id}`);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Before you decide").first()).toBeVisible();
      await expectHealthy(page, h);
    });

    if (desk === "parts") {
      test("parts desk tool (/parts) renders", async ({ page }) => {
        const h = watchHealth(page);
        await page.goto("/parts");
        await expect(page).toHaveURL(/\/parts/);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
        await expectHealthy(page, h);
      });
    }
    if (desk === "dealer") {
      test("dealer desk pipeline (/fleet) renders", async ({ page }) => {
        const h = watchHealth(page);
        await page.goto("/fleet");
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
        await expectHealthy(page, h);
      });
    }
  });
}
