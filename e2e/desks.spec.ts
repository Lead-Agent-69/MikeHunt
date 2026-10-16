import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { pickDeal } from "./support/deals";
import { expectHealthy, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

// Each desk is a real account onboarded through the UI in auth.setup.ts.
const FLIP: Record<Desk, boolean> = {
  personal: false,
  diy: false,
  parts: false,
  reseller: true,
  dealer: true,
};

for (const desk of [
  "personal",
  "diy",
  "reseller",
  "dealer",
  "parts",
] as Desk[]) {
  test.describe(`${desk} desk (local only)`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk) });

    test(`Discover is scoped to the ${desk} desk`, async ({ page }) => {
      const h = watchHealth(page);
      await page.goto("/discover");
      await expect(
        page.getByRole("heading", { name: "Quick filters" }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByLabel("Make", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Buyer mode", { exact: true })).toHaveCount(
        0,
      );
      await expectHealthy(page, h);
    });

    test(`API desk gate matches the ${desk} desk`, async ({ page }) => {
      const res = await page.request.get("/api/deals?limit=5");
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.deskAccess).toBe(FLIP[desk] ? "flip" : "personal");
      // Personal/parts desks must not receive resale-profit fields.
      if (!FLIP[desk])
        for (const d of body.deals) expect(d.trueNetProfit ?? null).toBeNull();
    });

    test(`ordinary ${desk} desk cannot read admin aggregates`, async ({
      page,
    }) => {
      const response = await page.request.get("/api/admin/stats");
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    test(`deal page renders for the ${desk} desk`, async ({ page }) => {
      const h = watchHealth(page);
      const deal = await pickDeal(page.request);
      await page.goto(`/deal/${deal.id}`);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Before you decide").first()).toBeVisible();
      await expectHealthy(page, h);
    });

    test(`account Saved survives a fresh device for the ${desk} desk`, async ({
      page,
    }) => {
      const h = watchHealth(page);
      const deal = await pickDeal(page.request);
      await page.goto(`/deal/${deal.id}`);
      const save = page
        .getByRole("button", { name: /^(Save vehicle|Saved|Saved on device)$/ })
        .first();
      await expect(save).toBeVisible({ timeout: 30_000 });
      if ((await save.innerText()).trim() !== "Saved") await save.click();
      await expect(
        page.getByRole("button", { name: /^Saved$/ }).first(),
      ).toBeVisible({ timeout: 20_000 });
      const saved = await page.request.get("/api/saved-cars?view=checklist");
      expect(saved.ok()).toBeTruthy();
      expect(await saved.json()).toEqual(
        expect.arrayContaining([expect.objectContaining({ deal_id: deal.id })]),
      );
      await page.evaluate(() =>
        localStorage.removeItem("mh-local-saved-vehicles-v1"),
      );
      await page.reload();
      await expect(
        page.getByRole("button", { name: /^Saved$/ }).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expectHealthy(page, h);
    });

    if (desk === "parts") {
      test("parts desk tool (/parts) renders", async ({ page }) => {
        const h = watchHealth(page);
        await page.goto("/parts");
        await expect(page).toHaveURL(/\/parts/);
        await expect(page.locator("h1").first()).toBeVisible({
          timeout: 30_000,
        });
        await expectHealthy(page, h);
      });
    }
    if (desk === "dealer") {
      test("dealer desk pipeline (/fleet) renders", async ({ page }) => {
        const h = watchHealth(page);
        await page.goto("/fleet");
        await expect(page.locator("h1").first()).toBeVisible({
          timeout: 30_000,
        });
        await expectHealthy(page, h);
      });
    }
  });
}
