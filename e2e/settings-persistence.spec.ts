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

    test("source and dealer filters open on demand without replacing inventory", async ({
      page,
    }, info) => {
      const health = watchHealth(page);
      await page.goto("/market");
      const vehicle = page.locator('main a[href^="/deal/"]').first();
      await expect(vehicle).toBeVisible();
      const href = await vehicle.getAttribute("href");
      await page.screenshot({
        path: info.outputPath(`${desk}-inventory-priority.png`),
      });
      await page.getByRole("button", { name: "All filters" }).click();
      const panel = page.locator("#market-filter-panel");
      await expect(panel).toBeVisible();
      const exactFilters = panel.getByTestId("exact-market-filters");
      await exactFilters.locator(":scope > summary").click();
      await panel.getByText(/^Sources & dealers \(/).click();
      await expect(
        panel.getByPlaceholder("Dealer name or website"),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /^Show .* listings$/ })
        .last()
        .click();
      await expect(panel).toBeHidden();
      await expect(vehicle).toHaveAttribute("href", href!);
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
        const response = page
          .waitForResponse(
            (r) =>
              r.url().endsWith("/api/profile") &&
              r.request().method() === "POST",
          )
          .catch(() => null);
        await save.click();
        await expect(page.getByText("Saved!", { exact: true })).toBeVisible();
        expect((await response)?.ok()).toBe(true);
      };
      try {
        await saveContact("202-555-0100");
        await page.reload();
        await expect(phone).toHaveValue("202-555-0100");
        await expect(home).toHaveValue(originalHome);
        await expectHealthy(page, health);
      } finally {
        const restored = await page.request.put("/api/preferences", {
          data: { profileContact: { phone: originalPhone } },
          timeout: 10000,
        });
        expect(restored.ok()).toBe(true);
      }
    });
  });
}
