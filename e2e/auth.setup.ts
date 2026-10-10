import { test as setup } from "@playwright/test";
import { IS_PROD, LOCAL_ONLY_REASON } from "./support/target";
import {
  ADMIN_EMAIL, completeOnboarding, loginViaUi, registerViaUi, storagePath, uniqueEmail, type Desk,
} from "./support/accounts";

// One signed-in storage state per desk, built through the real register + onboarding UI against the
// LOCAL stack. On prod this whole project is skipped.
const DESKS: Desk[] = ["personal", "reseller", "dealer", "parts"];

for (const desk of DESKS) {
  setup(`create ${desk} desk account`, async ({ page }) => {
    setup.skip(IS_PROD, LOCAL_ONLY_REASON);
    await registerViaUi(page, uniqueEmail(desk));
    await completeOnboarding(page, desk);
    await page.context().storageState({ path: storagePath(desk) });
  });
}

setup("create admin account", async ({ page }) => {
  setup.skip(IS_PROD, LOCAL_ONLY_REASON);
  // Admin is a fixed email (must match the local server's ADMIN_EMAIL); reuse it across runs.
  await loginViaUi(page, ADMIN_EMAIL);
  const landed = await Promise.race([
    page.waitForURL(/\/(onboarding|discover)/, { timeout: 15_000 }).then(() => true),
    page.getByText(/Invalid|incorrect|couldn.t sign/i).first().waitFor({ timeout: 15_000 }).then(() => false),
  ]).catch(() => false);
  if (!landed) await registerViaUi(page, ADMIN_EMAIL, "E2E Admin");
  if (/\/onboarding/.test(page.url())) await completeOnboarding(page, "dealer");
  await page.context().storageState({ path: storagePath("admin") });
});
