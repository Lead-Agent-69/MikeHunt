import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  loginViaUi,
  logoutViaUi,
  registerViaUi,
  uniqueEmail,
} from "./support/accounts";
import { expectHealthy, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

test.describe("signup, login, onboarding (local only)", () => {
  localOnly();
  // Keep core account checks independent of browser push-service availability.
  // The real worker has separate Chromium integration and hosted-device gates.
  test.use({ serviceWorkers: "block" });

  test("signup -> unified buying setup -> Market, then log out/in", async ({
    page,
  }) => {
    const h = watchHealth(page);
    const email = uniqueEmail("flow");
    await registerViaUi(page, email);
    await expect(
      page.getByRole("heading", { name: "What vehicles are you looking for?" }),
    ).toBeVisible();
    for (const label of [
      /Personal buyer/,
      /DIY enthusiast/,
      /Parts \/ teardown/,
      /Independent reseller/,
      /Dealer\/team/,
    ]) {
      await expect(page.getByRole("button", { name: label })).toHaveCount(0);
    }
    await completeOnboarding(page, "reseller");
    await expect(page).toHaveURL(/\/market(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: "Market Explorer", exact: true }),
    ).toBeVisible();
    await expectHealthy(page, h);

    // Fresh session: sign in with the same account; onboarded users skip setup.
    await expect(page.locator("article").first()).toBeVisible();
    await logoutViaUi(page);
    await loginViaUi(page, email);
    await page.waitForURL(/\/market(?:\?|$)/, { timeout: 30_000 });
  });

  test("wrong password shows an error and stays on /login", async ({
    page,
  }) => {
    const email = uniqueEmail("badpw");
    await registerViaUi(page, email);
    await page.context().clearCookies();
    await loginViaUi(page, email, "definitely-wrong-password");
    await expect(
      page.locator('[role="alert"], .text-red-500, [class*="red"]').first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
