import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";
import { expectHealthy, watchHealth } from "./support/health";

for (const desk of [
  "personal",
  "diy",
  "reseller",
  "dealer",
  "parts",
] as Desk[]) {
  test.describe(`${desk} discovery priority`, () => {
    localOnly();
    test.use({
      storageState: storagePath(desk),
      serviceWorkers: "block",
      colorScheme: "dark",
    });

    test("vehicle prices are in the first viewport and quick filters stay reachable", async ({
      page,
    }, info) => {
      const health = watchHealth(page);
      await page.goto("/discover");
      await expect(
        page.getByRole("region", { name: /vehicles$/ }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Inventory views" }),
      ).toBeVisible();
      const amount = page
        .getByTestId("discovery-card-price")
        .first()
        .locator(":scope > div")
        .first();
      await expect(amount).toBeVisible();
      const photo = page.getByTestId("discovery-card-photo").first();
      await expect
        .poll(() =>
          photo
            .locator("img")
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      const photoBox = await photo.boundingBox();
      const priceBox = await amount.boundingBox();
      expect(priceBox!.y).toBeGreaterThanOrEqual(
        photoBox!.y + photoBox!.height,
      );
      const nav = await page
        .locator('nav[aria-label="Primary mobile navigation"]')
        .boundingBox();
      await expect
        .poll(async () => {
          const box = await amount.boundingBox();
          return box ? box.y + box.height : Infinity;
        })
        .toBeLessThanOrEqual(nav?.y ?? page.viewportSize()!.height);
      await page.screenshot({
        path: info.outputPath(`${desk}-first-vehicle-price.png`),
      });
      const quickFilters = page.getByRole("button", { name: /Quick filters/ });
      if (await quickFilters.isVisible()) await quickFilters.click();
      await expect(page.getByLabel("Make", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Budget", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Lane", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Search cars", exact: true }),
      ).toBeEnabled();

      if (await quickFilters.isVisible()) await quickFilters.click();
      const href = await page
        .getByTestId("discovery-card-open")
        .first()
        .getAttribute("href");
      expect(href).toMatch(/^\/deal\//);
      const destination = new URL(href!, page.url()).href;
      const target = await amount.boundingBox();
      const x = target!.x + target!.width / 2;
      const y = target!.y + target!.height / 2;
      if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await expect(page).toHaveURL(destination);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectHealthy(page, health);
    });
  });
}
