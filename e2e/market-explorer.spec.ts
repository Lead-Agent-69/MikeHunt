import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("Market Explorer home", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("opens the whole market for personal buyers with Market first and Discover second", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page).toHaveURL(/\/market/);
    await expect(
      page.getByRole("heading", { name: "Market Explorer", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Market intelligence" }),
    ).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();
    const nav = page.getByRole("navigation", {
      name: testInfo.project.name.startsWith("mobile")
        ? "Primary mobile navigation"
        : "Primary desktop navigation",
    });
    expect(
      (
        await nav
          .locator("a")
          .evaluateAll((links) =>
            links.map(
              (link) =>
                new URL(link.getAttribute("href")!, location.origin).pathname,
            ),
          )
      ).slice(0, 2),
    ).toEqual(["/market", "/discover"]);
    await expect(
      page.getByText("This tool is for reseller and dealer desks"),
    ).toHaveCount(0);
    const photo = page.locator("article img").first();
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("market-listings.png") });
  });

  test("runs a ZIP radius search, sorts by distance and restores its shareable URL", async ({
    page,
  }) => {
    await page.goto("/market");
    await page.getByLabel("Search location", { exact: true }).fill("63101");
    await page.getByLabel("Search radius", { exact: true }).selectOption("100");
    const result = page.waitForResponse(
      (response) =>
        response.url().includes("/api/market/explore?") &&
        new URL(response.url()).searchParams.get("near") === "63101",
    );
    await page.getByRole("button", { name: "Search this area" }).click();
    const response = await result;
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.total).toBeGreaterThan(0);
    expect(
      body.rows.every(
        (row: { distanceMiles: number }) =>
          row.distanceMiles >= 0 && row.distanceMiles <= 100,
      ),
    ).toBe(true);
    await page
      .getByLabel("Sort market results")
      .selectOption("distanceMiles:asc");
    await expect(page).toHaveURL(/sort=distanceMiles/);
    await page.reload();
    await expect(
      page.getByLabel("Search location", { exact: true }),
    ).toHaveValue("63101");
    await expect(page.getByLabel("Sort market results")).toHaveValue(
      "distanceMiles:asc",
    );
    await page.getByRole("button", { name: "Nationwide", exact: true }).click();
    await expect(page).not.toHaveURL(/near=/);
  });

  test("keeps table view reachable and separates bids from cash asks", async ({
    page,
  }) => {
    await page.goto("/market?priceKind=current_bid&mode=all");
    await expect(page.locator("article").first()).toBeVisible();
    await expect(
      page.locator("article").first().getByText("Current bid", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Table view", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
      page.getByRole("table").getByText("Current bid", { exact: true }).first(),
    ).toBeVisible();
  });
});
