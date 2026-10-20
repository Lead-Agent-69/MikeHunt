import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { expectHealthy, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

// Regression for 20261010150000_saved_search_scope_columns: /searches inserts state, lane,
// seller_type and title_type (as NULL when unset), and PostgREST rejects the whole insert with
// PGRST204 when any of those columns is missing. Fails on a migration-built main without the
// migration (desktop + 390px), passes with it. Writes data, so local stack only (never prod).
test.describe("saved searches (local only)", () => {
  localOnly();
  // Core bookmark persistence is independent of the worker. PWA behavior has its own
  // Chromium-only suite: https://playwright.dev/docs/service-workers
  test.use({ storageState: storagePath("personal"), serviceWorkers: "block" });

  test("create a saved search, then see it on /searches", async ({ page }) => {
    const h = watchHealth(page);
    const name = `E2E Civics ${Date.now()}`;
    await page.goto("/searches");
    await page.getByRole("button", { name: "New search" }).click();
    await page.getByLabel("Search name", { exact: true }).fill(name);
    await page.getByPlaceholder("e.g. Ford").fill("Honda");
    await page.getByLabel("Model", { exact: true }).fill("Civic");
    await page.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/not confirmed saved/i)).toHaveCount(0);
    await expectHealthy(page, h);
  });

  test("Scan bookmarks preserve the complete scope without claiming alerts", async ({
    page,
  }) => {
    const h = watchHealth(page);
    await page.goto(
      "/scan?make=Honda&model=Civic&state=MO&maxPrice=20000&maxMileage=85000&fuelType=Hybrid&sort=price-desc&reset=1",
    );
    await expect(page).toHaveURL(/\/market\?/);
    const save = page.getByRole("button", {
      name: "Save search on this device",
      exact: true,
    });
    await expect(save).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save alert", exact: true }),
    ).toHaveCount(0);
    await save.click();
    await expect(page.getByRole("status")).toContainText(
      /Saved .* on this device/,
    );
    await page.goto("/searches");
    const row = page
      .locator(".glass-panel")
      .filter({ has: page.getByRole("heading", { name: /Honda.*Civic/ }) })
      .first();
    await expect(row).toContainText("Device only. No automatic alerts.");
    await expect(row.getByRole("button", { name: /Pause|Resume/ })).toHaveCount(
      0,
    );
    const href = await row
      .getByRole("link", { name: "Open Market" })
      .getAttribute("href");
    const scope = new URL(href!, "http://localhost").searchParams;
    for (const [key, value] of Object.entries({
      makes: "Honda",
      model: "Civic",
      states: "MO",
      priceMax: "20000",
      mileageMax: "85000",
      fuelType: "Hybrid",
      sort: "askPrice",
      sortDir: "desc",
    }))
      expect(scope.get(key)).toBe(value);
    await page.reload();
    await expect(row).toContainText("Device only. No automatic alerts.");
    await expectHealthy(page, h);
  });
});
