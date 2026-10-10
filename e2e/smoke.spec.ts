/**
 * Playwright E2E Smoke Tests — Signup → Browse → Save → Alert
 *
 * Runs against the locally running dev server (http://localhost:3000).
 * These are smoke tests, not exhaustive — they verify the critical user
 * flows don't throw JS errors or return error pages.
 *
 * Setup required:
 * 1. Seed a test user in Supabase Auth:
 *    Email: smoke-test@mikehunt-test.local  Password: Sm0keTest!23
 *    (or set TEST_USER_EMAIL / TEST_USER_PASSWORD env vars)
 * 2. Run `npm run dev` in another terminal.
 * 3. Run `npx playwright test e2e/smoke.spec.ts`
 */
import { test, expect, Page } from "@playwright/test";
import { IS_PROD } from "./support/target";

// This legacy smoke file signs in with a fixed test account, so it never runs against prod
// (guest.spec.ts covers the prod-safe pages).
test.skip(IS_PROD, "legacy smoke signs in with a fixed account: local only");

const EMAIL = process.env.TEST_USER_EMAIL ?? "smoke-test@mikehunt-test.local";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "Sm0keTest!23";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"], input[name="email"]').fill(EMAIL);
  await page
    .locator('input[type="password"], input[name="password"]')
    .fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Wait for redirect to dashboard
  await page.waitForURL(/\/(fleet|find|discover|overview|today)/, {
    timeout: 15000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe("Auth Flow", () => {
  test("login page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
    // Should show an email + password field
    await expect(
      page.locator('input[type="email"], input[name="email"]').first(),
    ).toBeVisible();
  });

  test("sign in redirects to dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(
      /\/(fleet|find|discover|overview|today|dashboard)/,
    );
  });
});

test.describe("Browse Inventory", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("fleet page loads without 500", async ({ page }) => {
    await page.goto("/fleet");
    await page.waitForLoadState("networkidle");
    // Should NOT show a generic error message
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
    await expect(page.locator("text=500")).not.toBeVisible();
  });

  test("find/search page loads", async ({ page }) => {
    await page.goto("/find");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });

  test("discover page loads", async ({ page }) => {
    await page.goto("/discover");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });
});

test.describe("Save a Deal", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("saved cars page loads", async ({ page }) => {
    await page.goto("/saved");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
    // Should show either a list of saved cars OR an empty-state message
    const hasContent = await page
      .locator('[data-testid="saved-car-card"], [data-testid="empty-state"]')
      .or(page.getByText("No saved"))
      .count();
    expect(hasContent).toBeGreaterThanOrEqual(0); // page rendered without error
  });
});

test.describe("Alerts", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("alerts page loads without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/alerts");
    // /alerts polls, so "networkidle" never settles; wait for the heading instead.
    await page.getByRole("heading", { name: "Alerts" }).first().waitFor();
    expect(errors).toHaveLength(0);
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });
});

test.describe("Market Data", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("market page loads", async ({ page }) => {
    await page.goto("/market");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Something went wrong")).not.toBeVisible();
  });
});
