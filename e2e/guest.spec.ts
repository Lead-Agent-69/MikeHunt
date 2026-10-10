import { expect, test } from "@playwright/test";
import { expectHealthy, settle, watchHealth } from "./support/health";
import { IS_PROD } from "./support/target";

// Guest, read-only. Safe for prod: GETs only, nothing is typed into a submitting form.
test.describe("guest (read-only, prod-safe)", () => {
  test("landing page renders a hero and a way in", async ({ page }) => {
    const h = watchHealth(page);
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await settle(page);
    await expect(page.locator("h1").first()).toBeVisible();
    // Desktop shows "Sign in"; at 390px that link is hidden and the hero CTAs carry the way in.
    await expect(
      page
        .locator(
          'a[href*="/register"], a[href*="/login"], a[href*="/scan"], a[href*="/onboarding"]',
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expectHealthy(page, h);
  });

  test("login page renders email + password (not submitted)", async ({
    page,
  }) => {
    const h = watchHealth(page);
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
    await expectHealthy(page, h);
  });

  test("signup page renders the form (not submitted)", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/register");
    await expect(page.getByPlaceholder("John Doe")).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectHealthy(page, h);
  });

  for (const path of ["/scan", "/tools", "/dealer-network"]) {
    test(`public buyer page ${path} renders`, async ({ page }) => {
      const h = watchHealth(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await settle(page, 2500);
      await expect(
        page.locator("main, [role=main], body").first(),
      ).toBeVisible();
      await expectHealthy(page, h);
    });
  }

  // Signed-out visitors must be sent to /login?next=… (never a 500 or a blank app shell).
  const PROTECTED = [
    "/find",
    "/discover",
    "/map",
    "/flash-deals",
    "/saved",
    "/searches",
    "/alerts",
    "/settings",
    "/onboarding",
    "/parts",
    "/status",
  ];
  test("protected pages redirect guests to login with next=", async ({
    page,
  }) => {
    for (const path of PROTECTED) {
      await page.goto(path);
      await expect(page, `${path} should bounce to login`).toHaveURL(
        new RegExp(
          `/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        ),
      );
      if (IS_PROD) await page.waitForTimeout(400); // keep prod gentle
    }
  });

  test("For You and Flash aliases resolve (guest ends at login)", async ({
    page,
  }) => {
    await page.goto("/for-you");
    await expect(page).toHaveURL(/\/login\?next=%2Fdiscover|\/discover/);
    await page.goto("/flash");
    await expect(page).toHaveURL(/\/login\?next=%2Fflash-deals|\/flash-deals/);
  });

  test("guest-safe API answers without leaking (alerts unread)", async ({
    request,
  }) => {
    const res = await request.get("/api/alerts/unread");
    expect(res.status()).toBeLessThan(500);
    const user = await request.get("/api/saved-cars");
    expect(user.status()).toBe(401);
    expect(user.headers()["cache-control"] || "").toContain("no-store");
  });
});
