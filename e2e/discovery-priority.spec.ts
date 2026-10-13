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
      const filters = page
        .locator("summary")
        .filter({ hasText: /^Search filters$/ });
      await expect(page.getByLabel("Make", { exact: true })).toBeHidden();
      const preview = page.getByTestId("discovery-card-price-preview").first();
      const bodyAmount = page
        .getByTestId("discovery-card-price")
        .first()
        .locator("span")
        .first();
      const mobile = (page.viewportSize()?.width ?? 0) < 640;
      const amount = mobile ? preview : bodyAmount;
      await expect(amount).toBeVisible();
      if (mobile)
        await expect(preview).toContainText(await bodyAmount.innerText());
      const box = await amount.boundingBox();
      const nav = await page
        .locator('nav[aria-label="Primary mobile navigation"]')
        .boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        nav?.y ?? page.viewportSize()!.height,
      );
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
