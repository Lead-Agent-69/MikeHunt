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
  test.use({ storageState: storagePath("personal") });

  test("create a saved search, then see it on /searches", async ({ page }) => {
    const h = watchHealth(page);
    const name = `E2E Civics ${Date.now()}`;
    await page.goto("/searches");
    await page.getByRole("button", { name: "New search" }).click();
    await page.getByPlaceholder("e.g. F-150s under $25k").fill(name);
    await page.getByPlaceholder("e.g. Ford").fill("Honda");
    await page.getByLabel("Model", { exact: true }).fill("Civic");
    await page.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/not confirmed saved/i)).toHaveCount(0);
    await expectHealthy(page, h);
  });
});
