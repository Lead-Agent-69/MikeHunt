import { expect, test } from "@playwright/test";
import { storagePath, type Desk } from "./support/accounts";
import { localOnly } from "./support/target";

for (const desk of [
  "personal",
  "diy",
  "reseller",
  "dealer",
  "parts",
] as Desk[]) {
  test.describe(`${desk} install overlay`, () => {
    localOnly();
    test.use({ storageState: storagePath(desk), serviceWorkers: "block" });
    test("eligible iOS install hint cannot block account commands", async ({
      page,
    }, info) => {
      test.skip(
        info.project.name !== "webkit-390",
        "iOS manual-install hint regression",
      );
      await page.addInitScript(() => {
        localStorage.setItem("installSessions", "2");
        localStorage.removeItem("installDismissed");
        localStorage.removeItem("installDone");
      });
      await page.route("**/api/scrape/health", (route) =>
        route.fulfill({ status: 503, json: { error: "Unavailable" } }),
      );
      await page.goto("/discover");
      await expect(
        page.getByRole("region", { name: "Install MikeHunt" }),
      ).toBeVisible();
      expect(
        await page
          .getByRole("region", { name: "Install MikeHunt" })
          .evaluate((el) => getComputedStyle(el.parentElement!).position),
      ).toBe("static");
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Decision guide", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Decision guide" }),
      ).toBeVisible();
      await expect(
        page.getByText("Market availability unavailable", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", {
          name: "Which markets have current listings?",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/^Indexed availability is unavailable right now/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close decision guide" }).click();
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await page.getByRole("link", { name: "All tools", exact: true }).click();
      await expect(page).toHaveURL(/\/tools$/);
    });
  });
}
