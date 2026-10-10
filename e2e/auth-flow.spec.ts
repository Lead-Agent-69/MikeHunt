import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  loginViaUi,
  registerViaUi,
  uniqueEmail,
} from "./support/accounts";
import { expectHealthy, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

test.describe("signup, login, onboarding (local only)", () => {
  localOnly();

  test("signup -> onboarding desk choice -> Discover, then log out/in", async ({
    page,
    context,
  }) => {
    const h = watchHealth(page);
    const email = uniqueEmail("flow");
    await registerViaUi(page, email);
    await expect(
      page.getByRole("heading", { name: "What are you buying for?" }),
    ).toBeVisible();
    for (const label of [
      /Personal buyer/,
      /DIY enthusiast/,
      /Parts \/ teardown/,
      /Independent reseller/,
      /Dealer\/team/,
    ]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await completeOnboarding(page, "reseller");
    await expect(page).toHaveURL(/mode=reseller/);
    await expect(page.getByText(/BUYING FOR/i).first()).toBeVisible();
    await expectHealthy(page, h);

    // Fresh session: sign in with the same account; onboarded users skip setup.
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginViaUi(page, email);
    await page.waitForURL(/\/discover/, { timeout: 30_000 });
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
