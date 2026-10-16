import { test, expect } from "@playwright/test";
import { localOnly } from "./support/target";
import {
  completeOnboarding,
  loginViaUi,
  logoutViaUi,
  registerViaUi,
  storagePath,
  uniqueEmail,
} from "./support/accounts";
import { expectHealthy, watchHealth } from "./support/health";

// Use isolated local accounts, never forgotten fixed accounts or hosted credentials.
localOnly();
test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });

test.describe("Auth Flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page renders without JS errors", async ({ page }) => {
    const health = watchHealth(page);
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectHealthy(page, health);
  });

  test("sign in redirects to the buying workspace", async ({ page }) => {
    const health = watchHealth(page);
    const email = uniqueEmail("smoke");
    await registerViaUi(page, email);
    await completeOnboarding(page, "reseller");
    await expect(
      page.getByRole("region", { name: /vehicles$/ }).first(),
    ).toBeVisible();
    await logoutViaUi(page);
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/discover/);
    await expect(
      page.getByRole("heading", { name: "Discover", exact: true }),
    ).toBeVisible();
    await expectHealthy(page, health);
  });
});

test.describe("Core buying pages", () => {
  for (const route of [
    "fleet",
    "find",
    "discover",
    "saved",
    "alerts",
    "market",
  ]) {
    test(`${route} loads for an authenticated buyer`, async ({ page }) => {
      const health = watchHealth(page);
      const response = await page.goto(`/${route}`);
      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("h1").first()).toBeVisible();
      if (route === "saved") {
        await expect(
          page
            .getByText("Nothing saved yet", { exact: true })
            .or(page.locator('main a[href^="/deal/"]'))
            .first(),
        ).toBeVisible();
      }
      await expectHealthy(page, health);
    });
  }
});
