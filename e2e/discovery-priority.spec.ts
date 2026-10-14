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
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });

    test("vehicle prices are in the first viewport and quick filters stay reachable", async ({
      page,
    }, info) => {
      const health = watchHealth(page);
      await page.goto("/discover");
      await expect(
        page.getByRole("region", { name: /vehicles$/ }).first(),
      ).toBeVisible();
      const views = page
        .locator("summary")
        .filter({ hasText: /^Inventory views$/ });
      await expect(
        page.getByRole("navigation", { name: "Inventory views" }),
      ).toBeHidden();
      await views.click();
      await expect(
        page.getByRole("navigation", { name: "Inventory views" }),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Shop by body style" }),
      ).toBeVisible();
      await views.click();
      const filters = page
        .locator("summary")
        .filter({ hasText: /^Search filters$/ });
      await expect(page.getByLabel("Make", { exact: true })).toBeHidden();
      const preview = page.getByTestId("discovery-card-price-preview").first();
      const amount = preview;
      await expect(amount).toBeVisible();
      // A refreshed rail can replace its first vehicle between two locator reads.
      await expect
        .poll(() =>
          preview.evaluate((element) => {
            const value = element
              .closest(".discovery-card")
              ?.querySelector('[data-testid="discovery-card-price"] span')
              ?.textContent?.trim();
            return Boolean(value && element.textContent?.includes(value));
          }),
        )
        .toBe(true);
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
      await filters.click();
      await expect(page.getByLabel("Make", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Budget", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Lane", { exact: true })).toBeVisible();
      await filters.click();
      await expect(page.getByLabel("Make", { exact: true })).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Browse inventory", exact: true }),
      ).toBeEnabled();

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
