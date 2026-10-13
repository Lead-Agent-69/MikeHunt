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
  test.describe(`${desk} settings persistence`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });

    test("secondary marketplaces open on demand without replacing inventory", async ({
      page,
    }, info) => {
      const health = watchHealth(page);
      await page.goto("/scan");
      await expect(
        page.getByRole("button", {
          name: "Search saved inventory",
          exact: true,
        }),
      ).toBeEnabled();
      const disclosure = page.locator("#wider-market-search > details");
      await expect(disclosure).toHaveJSProperty("open", false);
      const vehicle = page.locator('main a[href^="/deal/"]').first();
      await expect(vehicle).toBeVisible();
      const href = await vehicle.getAttribute("href");
      await page.screenshot({
        path: info.outputPath(`${desk}-inventory-priority.png`),
      });
      await page
        .getByRole("link", { name: "More marketplaces", exact: true })
        .click();
      await expect(disclosure).toHaveJSProperty("open", true);
      await expect(
        disclosure
          .getByRole("link", { name: /^Search .*opens in a new tab/ })
          .first(),
      ).toBeVisible();
      await expect(vehicle).toHaveAttribute("href", href!);
      await disclosure.locator(":scope > summary").click();
      await expect(disclosure).toHaveJSProperty("open", false);
      await expectHealthy(page, health);
    });

    test("contact saves survive reload without changing the home market", async ({
      page,
    }) => {
      const health = watchHealth(page);
      await page.goto("/settings");
      const phone = page.getByLabel("Phone", { exact: true });
      const home = page.getByRole("combobox", {
        name: "Home state",
        exact: true,
      });
      await expect(phone).toBeVisible();
      const originalPhone = await phone.inputValue();
      const originalHome = await home.inputValue();
      const save = page.getByRole("button", {
        name: /^Save profile( and costs)?$/,
      });
      const saveContact = async (value: string) => {
        await phone.fill(value);
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/profile") && r.request().method() === "POST",
        );
        await save.click();
        expect((await response).ok()).toBe(true);
        await expect(page.getByText("Saved!", { exact: true })).toBeVisible();
      };
      try {
        await saveContact("202-555-0100");
        await page.reload();
        await expect(phone).toHaveValue("202-555-0100");
        await expect(home).toHaveValue(originalHome);
        await expectHealthy(page, health);
      } finally {
        await page.goto("/settings");
        await expect(phone).toBeVisible();
        await saveContact(originalPhone);
      }
    });
  });
}
