import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";
import { expectHealthy, watchHealth } from "./support/health";

test.describe("recorded user walkthrough acceptance", () => {
  localOnly();
  test.use({ storageState: storagePath("reseller"), serviceWorkers: "block" });

  test("views and search controls are visible without a hidden Inventory Views menu", async ({
    page,
  }, info) => {
    const health = watchHealth(page);
    await page.goto("/discover");
    const views = page.getByRole("navigation", { name: "Inventory views" });
    await expect(
      views.getByRole("link", { name: "Results", exact: true }),
    ).toBeVisible();
    await expect(
      views.getByRole("link", { name: "Map", exact: true }),
    ).toBeVisible();
    await page.goto(
      "/scan?scope=explicit&state=all&zip=63101&radius=50&q=WalkthroughRadius",
    );
    await expect(page.getByLabel("ZIP", { exact: true })).toHaveValue("63101");
    await expect(page.getByLabel("Radius", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Max Miles", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Model", { exact: true })).toBeVisible();
    await expect(
      page.locator("summary").filter({ hasText: /^Source:/ }),
    ).toBeVisible();
    await expectHealthy(page, health);
    await page.screenshot({
      path: info.outputPath("visible-search.png"),
      fullPage: false,
    });
  });

  test("50-mile St. Louis search includes Illinois, excludes Chicago and ranks qualified price gaps", async ({
    page,
  }) => {
    const response = await page.request.get(
      "/api/scan?scope=explicit&state=all&zip=63101&radius=50&q=WalkthroughRadius&sort=margin",
    );
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.vehicles.map((row: any) => row.locationState).sort()).toEqual(
      ["IL", "MO"],
    );
    expect(result.vehicles.map((row: any) => row.dealMargin)).toEqual([
      6000, 4000,
    ]);
    expect(
      result.vehicles.some((row: any) => row.locationCity === "Chicago"),
    ).toBe(false);
    expect(
      (
        await page.request.get("/api/scan?source=cars_com,copart&sort=price")
      ).ok(),
    ).toBe(true);
  });

  test("preferences save and reload without a buyer role selector", async ({
    page,
  }, info) => {
    const health = watchHealth(page);
    await page.goto("/settings");
    await expect(
      page.getByRole("button", {
        name: "Save buying preferences",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(page.getByLabel("Buyer mode", { exact: true })).toHaveCount(0);
    await page.getByLabel("Maximum price ($)", { exact: true }).fill("20000");
    await page
      .getByRole("button", { name: "Save buying preferences", exact: true })
      .click();
    await expect(
      page.getByText("Buying preferences saved to your account.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel("Maximum price ($)", { exact: true }),
    ).toHaveValue("20000");
    const prefs = await (await page.request.get("/api/preferences")).json();
    expect(prefs.prefs.buyerScope.buyerMode).toBe("reseller");
    expect(prefs.prefs).not.toHaveProperty("role");
    await expectHealthy(page, health);
    await page.screenshot({
      path: info.outputPath("buying-preferences.png"),
      fullPage: false,
    });
  });

  test("listing feedback gets a database-confirmed receipt and survives reload", async ({
    page,
  }, info) => {
    const response = await page.request.get(
      "/api/scan?scope=explicit&state=all&q=WalkthroughRadius&sort=price",
    );
    expect(response.ok()).toBe(true);
    const listing = (await response.json()).vehicles[0];
    expect(listing?.id).toBeTruthy();
    const health = watchHealth(page);
    await page.goto(`/deal/${listing.id}`);
    await page
      .getByRole("button", { name: "Report a listing issue", exact: true })
      .click();
    await page
      .getByLabel("What needs correcting?", { exact: true })
      .fill("Local QA synthetic report: verify seller price meaning.");
    const saved = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/feedback") &&
        result.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Send report", exact: true })
      .click();
    const receipt = await saved;
    expect(receipt.status()).toBe(201);
    const data = await receipt.json();
    await expect(
      page.getByText(`Report saved. Reference: ${data.id}`, { exact: true }),
    ).toBeVisible();
    await expectHealthy(page, health);
    await page.screenshot({
      path: info.outputPath("confirmed-feedback.png"),
      fullPage: false,
    });
    // A same-ID retry after page reload must confirm the same owned row, not create a second report.
    await page.reload();
    const retry = await page.request.post("/api/feedback", {
      data: {
        id: data.id,
        listing_id: listing.id,
        category: "price",
        comment: "Local QA synthetic report: verify seller price meaning.",
      },
    });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).id).toBe(data.id);
  });
});
