import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";

const link = "https://seller.example/car/1";
const id = "00000000-0000-4000-8000-000000000001";
for (const desk of ["personal", "reseller", "dealer", "parts"] as Desk[]) {
  test.describe(`${desk} shared listing save`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });

    test("prose share sends only the URL and opens the confirmed vehicle", async ({
      page,
    }) => {
      await page.route("**/api/save-from-url", async (route) => {
        expect(route.request().postDataJSON()).toEqual({ url: link });
        await route.fulfill({ json: { dealId: id } });
      });
      await page.goto(
        `/save?text=${encodeURIComponent(`${link}\nA useful truck`)}`,
      );
      await expect(page).toHaveURL(new RegExp(`/deal/${id}$`));
    });

    test("missing confirmation remains recoverable without a false redirect", async ({
      page,
    }, testInfo) => {
      await page.route("**/favicon.ico", (route) => route.abort());
      await page.route("**/api/save-from-url", async (route) => {
        await route.fulfill({ json: {} });
      });
      await page.goto(`/save?url=${encodeURIComponent(link)}`);
      await expect(
        page.getByRole("heading", { name: "Could not save vehicle" }),
      ).toBeVisible();
      const retry = page.getByRole("button", { name: "Try again" });
      await expect(retry).toBeVisible();
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(
        await retry.evaluate((button) => getComputedStyle(button).color),
      ).toBe("rgb(255, 255, 255)");
      const connection = page.locator(".connection-status-mobile");
      await expect(connection).toBeVisible();
      const noticeBox = (await connection.boundingBox())!;
      const headerBox = (await page.getByRole("banner").boundingBox())!;
      expect(headerBox.y).toBeGreaterThanOrEqual(
        noticeBox.y + noticeBox.height,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      expect(page.url()).not.toContain("/deal/");
      const image = testInfo.outputPath("shared-save-error.png");
      await page.screenshot({ path: image, fullPage: true });
      await testInfo.attach("Shared save error", {
        path: image,
        contentType: "image/png",
      });
    });

    test("retry reuses the original link after an outage", async ({ page }) => {
      let attempts = 0;
      await page.route("**/api/save-from-url", async (route) => {
        expect(route.request().postDataJSON()).toEqual({ url: link });
        attempts++;
        await route.fulfill(
          attempts === 1
            ? {
                status: 503,
                json: { error: "Listing temporarily unavailable" },
              }
            : { json: { dealId: id } },
        );
      });
      await page.goto(`/save?url=${encodeURIComponent(link)}`);
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page).toHaveURL(new RegExp(`/deal/${id}$`));
      expect(attempts).toBe(2);
    });
  });
}
