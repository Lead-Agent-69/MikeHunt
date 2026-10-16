import { expect, type Page } from "@playwright/test";
import { assertLocalTarget } from "./target";

export type Desk = "personal" | "diy" | "reseller" | "dealer" | "parts";
export const DESK_LABEL: Record<Desk, RegExp> = {
  personal: /Personal buyer/,
  diy: /DIY/,
  reseller: /Independent reseller/,
  dealer: /Dealer\/team/,
  parts: /Parts \/ teardown/,
};
export const PASSWORD = "LocalOnly-e2e-1234";
export const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL || "e2e-admin@local.test";
export const storagePath = (name: string) => `e2e/.auth/${name}.json`;

export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@local.test`;
}

/** Real UI signup (local stack only). Lands on /onboarding. */
export async function registerViaUi(
  page: Page,
  email: string,
  name = "E2E Tester",
) {
  assertLocalTarget("create an account");
  await page.goto("/register");
  await page.getByPlaceholder("John Doe").fill(name);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
}

export async function loginViaUi(
  page: Page,
  email: string,
  password = PASSWORD,
) {
  assertLocalTarget("sign in");
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

export async function logoutViaUi(page: Page) {
  assertLocalTarget("sign out");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Unified buying setup; optional legacy desk fixtures are seeded explicitly through the local API. */
export async function completeOnboarding(page: Page, desk: Desk) {
  assertLocalTarget("save onboarding preferences");
  await expect(page.getByRole("button", { name: /^Continue/ })).toBeEnabled({
    timeout: 20_000,
  });
  await expect(page.getByText("Buyer mode", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.locator("select").first().selectOption("Nationwide");
  for (let i = 0; i < 4; i++) {
    const finish = page.getByRole("button", { name: /See my matches/ });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.getByRole("button", { name: /^Continue/ }).click();
  }
  await page.waitForURL(/\/discover/, { timeout: 30_000 });
  if (desk !== "reseller") {
    const legacy = await page.request.put("/api/preferences", {
      data: { buyerScope: { buyerMode: desk } },
    });
    expect(legacy.ok()).toBe(true);
  }
}
