import { expect, test } from "@playwright/test";
import { storagePath } from "./support/accounts";
import { localOnly } from "./support/target";

test.describe("focused deal workspace", () => {
  localOnly();
  test.use({ storageState: storagePath("personal") });

  test("keeps evidence, research, and actions focused instead of stacking tools", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/market?mode=all&sort=askPrice&sortDir=asc");
    const firstDeal = page.locator("article").first();
    await expect(firstDeal).toBeVisible();
    const href = await firstDeal
      .locator('a[aria-label^="Open details for"]')
      .getAttribute("href");
    expect(href).toMatch(/^\/deal\//);
    await page.goto(href!);
    await expect(page.locator("h1").first()).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Find similar vehicles in collected inventory",
      }),
    ).toHaveCount(1);
    await expect(
      page.getByText("Advanced workspace", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Floor plan & carrying cost", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Cash Offer Draft", { exact: true }),
    ).toHaveCount(0);

    const marketEvidence = page
      .locator("details")
      .filter({ hasText: "Compare price and timing" });
    await marketEvidence.locator("summary").click();
    await expect(
      page.getByRole("region", { name: "Interactive listing price history" }),
    ).toBeVisible();

    const research = page
      .locator("details")
      .filter({ hasText: "Open one focused tool" });
    await research.locator("summary").click();
    await expect(
      page.getByRole("region", { name: "Focused vehicle research" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /AI brief/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Vehicle data/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Deal IQ/ })).toHaveCount(0);
    await page.getByRole("tab", { name: /Vehicle data/ }).click();
    await expect(
      page.getByRole("tabpanel", { name: /Vehicle data/ }),
    ).toBeVisible();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("focused-deal-workspace.png"),
      fullPage: true,
    });
  });
});
