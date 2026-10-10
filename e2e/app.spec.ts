import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { pickDeal } from "./support/deals";
import { expectHealthy, settle, watchHealth } from "./support/health";
import { localOnly } from "./support/target";

test.describe("signed-in app, personal desk (local only)", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("/find is a flip-desk tool: personal desk gets an honest gate", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/find");
    await expect(page.getByRole("heading", { name: /for reseller and dealer desks/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Change desk in Settings" })).toBeVisible();
    await expectHealthy(page, h);
  });

  test("Check any listing (/deal-check): amounts -> cost check; paste mode available", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/deal-check");
    await page.getByLabel("Selling price ($)").fill("14500");
    await page.getByLabel("Itemized fees total ($)").fill("299");
    await page.getByRole("button", { name: "Review amounts" }).click();
    await expect(page.getByLabel("Offer arithmetic")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Offer arithmetic")).toContainText("14,799");
    await page.getByRole("button", { name: "Read offer" }).first().click();
    await expect(page.getByLabel("Offer text or listing URL")).toBeVisible();
    await expectHealthy(page, h);
  });

  test("Discover renders rails with deal links", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/discover");
    await expect(page.getByText(/BUYING FOR/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Personal buyer/).first()).toBeVisible();
    await expect(page.locator('a[href^="/deal/"]').first()).toBeVisible({ timeout: 30_000 });
    await expectHealthy(page, h);
  });

  test("For You (alias) lands on Discover", async ({ page }) => {
    await page.goto("/for-you");
    await expect(page).toHaveURL(/\/discover/);
  });

  test("Flash (price opportunities) renders", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/flash");
    await expect(page).toHaveURL(/\/flash-deals/);
    await expect(page.getByText("Price opportunities").first()).toBeVisible();
    await expectHealthy(page, h);
  });

  test("map renders Leaflet and plots seeded inventory", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/map");
    await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 30_000 });
    const plotted = page.getByText(/\d+ plotted/).first();
    await expect(plotted).toBeVisible();
    // "0 plotted" is shown while loading; wait for the real count.
    await expect
      .poll(async () => Number((await plotted.innerText()).match(/(\d+) plotted/)?.[1] || 0), { timeout: 30_000, message: "points plotted on /map with 5k seeded listings" })
      .toBeGreaterThan(0);
    await expect(page.locator(".leaflet-marker-icon, .marker-cluster").first()).toBeVisible();
    await expectHealthy(page, h);
  });

  test("deal page: decision (advisor) card + price history", async ({ page }) => {
    const h = watchHealth(page);
    const deal = await pickDeal(page.request);
    await page.goto(`/deal/${deal.id}`);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    // The buy/no-buy advisor on main is the "Before you decide / Why this verdict?" card.
    await expect(page.getByText("Before you decide").first()).toBeVisible();
    await expect(page.getByText("Why this verdict?").first()).toBeVisible();
    await page.getByText("Compare price and timing").first().click();
    if (deal.hasHistory) await expect(page.getByText("Listing price history").first()).toBeVisible({ timeout: 20_000 });
    else test.info().annotations.push({ type: "note", description: "no deal with >=2 price points" });
    await expectHealthy(page, h);
  });

  test("save a car, then see it on /saved", async ({ page }) => {
    const h = watchHealth(page);
    const deal = await pickDeal(page.request);
    await page.goto(`/deal/${deal.id}`);
    const save = page.getByRole("button", { name: /^(Save vehicle|Saved)$/ }).first();
    await expect(save).toBeVisible({ timeout: 30_000 });
    if ((await save.innerText()).trim() === "Save vehicle") await save.click();
    await expect(page.getByRole("button", { name: /^Saved$/ }).first()).toBeVisible({ timeout: 20_000 });
    await page.goto("/saved");
    await expect(page.getByRole("heading", { name: "Saved Vehicles" })).toBeVisible();
    await expect(page.getByText(deal.title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expectHealthy(page, h);
  });

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
    await expectHealthy(page, h);
  });

  test("alerts page renders (empty state or matches)", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/alerts");
    await expect(page.getByRole("heading", { name: "Alerts" }).first()).toBeVisible();
    await expect(page.getByText(/No alerts yet|new match|price/i).first()).toBeVisible();
    const api = await page.request.get("/api/alerts");
    expect(api.status()).toBeLessThan(500);
    await expectHealthy(page, h);
  });

  test("settings shows locations and buyer mode", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Home location").first()).toBeVisible();
    await expect(page.getByText("Buyer mode").first()).toBeVisible();
    await expectHealthy(page, h);
  });

  test("/status is admin-only: a regular user is bounced to Discover", async ({ page }) => {
    await page.goto("/status");
    await expect(page).toHaveURL(/\/discover/);
  });
});

test.describe("/status as admin (local only)", () => {
  localOnly();
  test.use({ storageState: storagePath("admin") });
  test("system status renders for the admin", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/status");
    await expect(page).toHaveURL(/\/status/);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
    await expectHealthy(page, h);
  });
});

test.describe("signed-in app, reseller desk (local only)", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller") });

  test("/find: filters + multi-site links", async ({ page }) => {
    const h = watchHealth(page);
    await page.goto("/find");
    await settle(page);
    await expect(page.getByText("Also search on")).toBeVisible();
    await expect(page.getByText("Enter a make to get links.")).toBeVisible();
    await page.getByLabel("Make", { exact: true }).fill("Honda");
    await page.getByLabel("Model", { exact: true }).fill("Civic");
    await page.getByLabel("Year from").fill("2016");
    await page.getByLabel("Year to").fill("2022");
    await page.getByLabel("Max price").fill("30000");
    await page.getByLabel("ZIP").fill("60601");
    const links = page.getByTestId("also-search-on-links").locator("a");
    await expect(links.first()).toBeVisible();
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const a = links.nth(i);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", /noopener/);
      expect(await a.getAttribute("href")).toMatch(/^https:\/\//);
    }
    const hrefs = (await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href))).join(" ");
    expect(hrefs.toLowerCase()).toContain("honda");
    expect(hrefs).toContain("60601");
    // Saved-inventory filter: pick a state chip and the arbitrage lists stay rendered.
    await page.getByLabel("Home state").selectOption("TX");
    await expect(page.getByLabel("Home state")).toHaveValue("TX");
    // Desktop tab reads "Local in TX (n)"; at 390px it collapses to "TX (n)".
    await expect(page.getByRole("button", { name: /TX \(\d+\)/ }).filter({ visible: true }).first()).toBeVisible();
    await expectHealthy(page, h);
  });
});
